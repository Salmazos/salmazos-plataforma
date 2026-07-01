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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // API route protection
  if (isApiRoute && !isPublicApiRoute(pathname, request.method)) {
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return responseRef.value;
  }

  // Painel protection
  if (!user && pathname.startsWith("/painel")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/painel";
    return NextResponse.redirect(url);
  }

  // Portal protection
  if (!user && isPortalRoute && pathname !== "/portal/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    return NextResponse.redirect(url);
  }

  return responseRef.value;
}

export const config = {
  matcher: ["/painel/:path*", "/login", "/portal", "/portal/:path*", "/api/:path*"],
};
