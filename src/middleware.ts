import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ── Auth config ──────────────────────────────────────────────────────────────

const PUBLIC_API_PREFIXES = [
  "/api/auth/",
  "/api/portal/",
  "/api/cron/",
  // Formulário público de admissão — sem login, autenticado via token na URL.
  // Cada rota valida o token manualmente (existência, expiração, status editável)
  // usando o cliente service role, que ignora RLS.
  "/api/admissoes/token/",
];

const PUBLIC_API_POST_ONLY = [
  "/api/candidatos",
];

function isPublicApiRoute(pathname: string, method: string): boolean {
  for (const prefix of PUBLIC_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  for (const route of PUBLIC_API_POST_ONLY) {
    if (pathname === route && method === "POST") return true;
  }
  return false;
}

// ── Rate limiting ────────────────────────────────────────────────────────────

interface RateLimitRule {
  match: (pathname: string, method: string) => boolean;
  maxRequests: number;
  windowMs: number;
}

const RATE_LIMIT_RULES: RateLimitRule[] = [
  // Public routes — stricter
  {
    match: (p, m) => p === "/api/candidatos" && m === "POST",
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
  },
  {
    match: (p, m) => p === "/api/auth/login" && m === "POST",
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  },
  // AI/email cost routes — moderate
  {
    match: (p) => /^\/api\/vagas\/[^/]+\/match$/.test(p),
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  },
  {
    match: (p) => /^\/api\/vagas\/[^/]+\/match-all$/.test(p),
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  },
  {
    match: (p) => p === "/api/banco-candidatos/match",
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  },
  {
    match: (p) => p === "/api/extrair-curriculo",
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  },
  {
    match: (p) => p === "/api/admin/recalcular-triagem",
    maxRequests: 3,
    windowMs: 60 * 60 * 1000,
  },
  {
    match: (p) => /^\/api\/vagas\/[^/]+\/notificar-/.test(p),
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  },
  {
    match: (p) => p === "/api/email/send",
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  },
];

interface SlidingWindowEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, SlidingWindowEntry>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStaleEntries(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const maxWindow = 60 * 60 * 1000;
  for (const [key, entry] of rateLimitStore) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < maxWindow);
    if (entry.timestamps.length === 0) rateLimitStore.delete(key);
  }
}

function checkRateLimit(
  ip: string,
  rule: RateLimitRule,
  ruleIndex: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  cleanupStaleEntries(now);

  const key = `${ip}:${ruleIndex}`;
  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  const windowStart = now - rule.windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= rule.maxRequests) {
    const oldest = entry.timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + rule.windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  entry.timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

function applyRateLimit(pathname: string, method: string, ip: string): NextResponse | null {
  for (let i = 0; i < RATE_LIMIT_RULES.length; i++) {
    const rule = RATE_LIMIT_RULES[i];
    if (!rule.match(pathname, method)) continue;

    const { allowed, retryAfterSeconds } = checkRateLimit(ip, rule, i);
    if (!allowed) {
      console.warn(
        `[rate-limit] IP ${ip} exceeded limit on ${method} ${pathname} (retry in ${retryAfterSeconds}s)`,
      );
      return NextResponse.json(
        { error: "Muitas requisições. Tente novamente em alguns minutos." },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds) },
        },
      );
    }
    return null;
  }
  return null;
}

// ── Cookie helpers ───────────────────────────────────────────────────────────

function makeCookieHandlers(request: NextRequest, response: { value: NextResponse }, cookieOptions?: { name: string }) {
  return {
    ...(cookieOptions ? { cookieOptions } : {}),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: Array<{ name: string; value: string; options?: object }>
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response.value = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.value.cookies.set(name, value, options as Parameters<typeof response.value.cookies.set>[2])
        );
      },
    },
  };
}

// ── Cookie propagation ──────────────────────────────────────────────────────
//
// getUser() pode rotacionar o refresh token (chamando setAll via
// makeCookieHandlers, que grava o cookie novo em responseRef.value) e ainda
// assim, para ESSA mesma requisição, terminarmos retornando null em `user`
// (ex: a chamada de verificação que vem depois do refresh falha por um
// motivo transitório). Se, nesse caso, devolvermos uma resposta nova
// (NextResponse.json/redirect) sem copiar os cookies de responseRef.value,
// o cookie novo se perde: o navegador continua com o refresh token ANTIGO,
// que o Supabase já invalidou ao rotacionar — toda requisição seguinte falha
// com 401, de forma permanente, até um login manual. É o aviso oficial do
// guia de SSR do Supabase: "If this is not done, you may be causing the
// browser and server to go out of sync and terminate the user's session
// prematurely." https://supabase.com/docs/guides/auth/server-side/nextjs
function withCookies(response: NextResponse, from: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

// ── Auth retry ───────────────────────────────────────────────────────────────
//
// Testado empiricamente contra o projeto Supabase real (8 chamadas
// concorrentes de refresh com o MESMO refresh_token, todas 200 OK) — o
// "Refresh Token Reuse Interval" padrão do Supabase já absorve bem rajadas
// de requisições paralelas (ex: o Promise.all de visitas no formulário de
// KM), então isso não é a causa raiz do 401 intermitente. Esta retentativa
// fica como rede de segurança adicional para falhas transitórias de rede
// durante o refresh (timeout, blip) que não a corrida de reuse em si.
async function getUserWithRetry(
  supabase: ReturnType<typeof createServerClient>,
  pathname: string,
) {
  const first = await supabase.auth.getUser();
  if (!first.error) return first.data.user;

  // "Auth session missing!" é o estado normal de um visitante sem cookie de
  // sessão nenhum (anônimo) — não é uma corrida, não vale retentar.
  if (first.error.message === "Auth session missing!") return null;

  console.warn(
    `[middleware] getUser() falhou em ${pathname}, tentando novamente em 300ms: ${first.error.message}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 300));

  const second = await supabase.auth.getUser();
  if (second.error) {
    console.error(
      `[middleware] getUser() falhou após retry em ${pathname}: ${second.error.message}`,
    );
    return null;
  }
  console.warn(`[middleware] getUser() recuperou no retry em ${pathname}`);
  return second.data.user;
}

// ── Middleware entry point ───────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const responseRef = { value: NextResponse.next({ request }) };
  const { pathname } = request.nextUrl;

  const isPortalRoute = pathname === "/portal" || pathname.startsWith("/portal/");
  const isApiRoute = pathname.startsWith("/api/");

  // Rate limiting (runs before auth — applies to both public and authenticated routes)
  if (isApiRoute) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    const blocked = applyRateLimit(pathname, request.method, ip);
    if (blocked) return blocked;
  }

  const supabaseConfig = isPortalRoute
    ? makeCookieHandlers(request, responseRef, { name: "sb-portal-auth-token" })
    : makeCookieHandlers(request, responseRef);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    supabaseConfig,
  );

  const user = await getUserWithRetry(supabase, pathname);

  // API route protection
  if (isApiRoute && !isPublicApiRoute(pathname, request.method)) {
    if (!user) {
      return withCookies(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), responseRef.value);
    }
    return responseRef.value;
  }

  // Painel protection
  if (!user && pathname.startsWith("/painel")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return withCookies(NextResponse.redirect(url), responseRef.value);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/painel";
    return withCookies(NextResponse.redirect(url), responseRef.value);
  }

  // Portal protection
  if (!user && isPortalRoute && pathname !== "/portal/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    return withCookies(NextResponse.redirect(url), responseRef.value);
  }

  return responseRef.value;
}

export const config = {
  matcher: ["/painel/:path*", "/login", "/portal", "/portal/:path*", "/api/:path*"],
};
