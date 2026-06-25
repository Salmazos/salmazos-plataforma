import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_API_PREFIXES = [
  "/api/auth/",
  "/api/portal/",
  "/api/cron/",
];

const PUBLIC_API_POST_ONLY = [
  "/api/candidatos",
];

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

function isPublicApiRoute(pathname: string, method: string): boolean {
  for (const prefix of PUBLIC_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }

  for (const route of PUBLIC_API_POST_ONLY) {
    if (pathname === route && method === "POST") return true;
  }

  return false;
}

export async function middleware(request: NextRequest) {
  const responseRef = { value: NextResponse.next({ request }) };
  const { pathname } = request.nextUrl;

  const isPortalRoute = pathname === "/portal" || pathname.startsWith("/portal/");
  const isApiRoute = pathname.startsWith("/api/");

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
