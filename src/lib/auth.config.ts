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
      const publicPaths = ["/login", "/forgot-password", "/reset-password", "/share", "/api/auth/"];
      if (publicPaths.some((p) => path.startsWith(p))) return true;
      return !!auth?.user;
    },
  },
};
