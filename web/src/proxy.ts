import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/db";
import { AUTH_COOKIE } from "@/lib/auth";

// Paths that do not require authentication.
// /api/v1/* routes handle their own Bearer-token auth internally,
// so the cookie-only middleware must not block them.
const PUBLIC_PATHS = [
  "/login",
  "/admin/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/admin/login",
  "/api/v1",
];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  let session = null;
  if (token) {
    try {
      session = await getSessionUser(token);
    } catch {
      session = null;
    }
  }

  // Admin pages are token-authenticated: the client stores the bearer token
  // and everything sensitive is fetched through /api/v1/admin/* which enforces
  // admin-only backend auth. The marker cookie here is a soft frontend gate so
  // non-authenticated visitors are sent to the admin login without a round
  // trip, while the real authorization always happens server-side.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (session && session.role !== "admin") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (!session && !request.cookies.get("qx_admin_ok")?.value) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  // No/expired session -> protect the route.
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
    // Redirect admin pages to the admin login, everything else to the
    // customer login.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only area.
  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Protect app pages and API routes, while always allowing static
     * assets and image optimization.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
