import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Only protect /admin routes (but NOT /admin/login)
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // Allow the login page itself
  if (request.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Check for admin cookie
  const adminToken = request.cookies.get("admin-token")?.value;

  // UX-only redirect: if no admin cookie, send to login page.
  // The API layer (admin-auth.ts) enforces the real ADMIN_API_KEY check.
  if (!adminToken) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
