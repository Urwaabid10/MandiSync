import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Valid dashboard roles mapped to their route prefixes
// ---------------------------------------------------------------------------
const ROLE_ROUTES: Record<string, string> = {
  arthi: "/dashboard/arthi",
  farmer: "/dashboard/farmer",
  farmer_landlord: "/dashboard/farmer",
  bidder: "/dashboard/bidder",
  buyer: "/dashboard/bidder",
};

const DASHBOARD_PREFIX = "/dashboard";
const LOGIN_PATH = "/auth/login";

// ---------------------------------------------------------------------------
// Proxy handler (renamed from middleware per Next.js 16+ convention)
// ---------------------------------------------------------------------------
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only process dashboard routes
  if (!pathname.startsWith(DASHBOARD_PREFIX)) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies onto both the request (for downstream reads)
          // and the response (for the browser).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session -- this also updates cookies if needed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ------------------------------------------------------------------
  // Unauthenticated: redirect to login
  // ------------------------------------------------------------------
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ------------------------------------------------------------------
  // Read role from user_metadata (set during signup)
  // ------------------------------------------------------------------
  const role = user.user_metadata?.role as string | undefined;

  if (!role || !ROLE_ROUTES[role]) {
    // Role missing or unrecognized -- send to login for re-auth
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    return NextResponse.redirect(loginUrl);
  }

  // ------------------------------------------------------------------
  // Cross-role guard: e.g. a farmer accessing /dashboard/arthi
  // ------------------------------------------------------------------
  const allowedPrefix = ROLE_ROUTES[role];

  if (pathname.startsWith(DASHBOARD_PREFIX) && !pathname.startsWith(allowedPrefix)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = allowedPrefix;
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

// ---------------------------------------------------------------------------
// Route matcher -- only invoke proxy on protected paths
// ---------------------------------------------------------------------------
export const config = {
  matcher: [
    /*
     * Match all dashboard routes.
     * Exclude static files, images, and api routes.
     */
    "/dashboard/:path*",
  ],
};
