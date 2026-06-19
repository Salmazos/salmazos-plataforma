import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

export async function middleware(request: NextRequest) {
  const responseRef = { value: NextResponse.next({ request }) };
  const { pathname } = request.nextUrl;

  const isPortalRoute = pathname === "/portal" || pathname.startsWith("/portal/");

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
  matcher: ["/painel/:path*", "/login", "/portal", "/portal/:path*"],
};
