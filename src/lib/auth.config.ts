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
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};
