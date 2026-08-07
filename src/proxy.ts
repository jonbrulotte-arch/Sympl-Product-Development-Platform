import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;

  // API routes and auth routes pass through — they handle auth themselves.
  // /share/<token>, /reset-password and /accept-invite pages are intentionally
  // public: access is controlled by the unguessable, expiring token in the
  // URL. Guarding them would bounce the recipient to /login and drop the
  // token, making the emailed link useless.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/accept-invite") ||
    pathname.startsWith("/share/")
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users away from page routes
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|public).*)"],
};
