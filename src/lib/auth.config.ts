import type { NextAuthConfig } from "next-auth";

// Edge-safe config — no Prisma, no Node.js-only imports.
// Used by proxy.ts (Edge runtime) for session checking only.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      // Reachable without a session. Anything that a signed-out person must be
      // able to open — invitation and reset links above all — belongs here, or
      // it bounces to /login and the token in the query string is lost.
      const publicPaths = [
        "/login",
        "/forgot-password",
        "/reset-password",
        "/accept-invite",
        "/share",
        "/api/auth/",
      ];
      if (publicPaths.some((p) => path.startsWith(p))) return true;
      return !!auth?.user;
    },
  },
};
