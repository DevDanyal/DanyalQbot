import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/db";
import { AUTH_COOKIE } from "@/lib/auth";

// Paths that do not require authentication.
const PUBLIC_PATHS = [
  "/login",
  "/admin/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/admin/login",
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
