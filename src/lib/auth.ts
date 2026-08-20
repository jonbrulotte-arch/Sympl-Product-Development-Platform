import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { authConfig } from "@/lib/auth.config";
import { isLoginBlocked, recordLoginFailure, clearLoginFailures } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity";

// Short-lived cache for the per-request user lookup in the jwt callback —
// keeps role changes and deactivations near-instant (≤60 s) without paying
// a DB query on literally every request.
const userStateCache = new Map<string, { role: UserRole; isActive: boolean; expiresAt: number }>();
const USER_STATE_TTL_MS = 60_000;

async function getUserState(userId: string): Promise<{ role: UserRole; isActive: boolean } | null> {
  const cached = userStateCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return { role: cached.role, isActive: cached.isActive };
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!dbUser) {
    userStateCache.delete(userId);
    return null;
  }
  if (userStateCache.size > 5_000) userStateCache.clear();
  userStateCache.set(userId, { ...dbUser, expiresAt: Date.now() + USER_STATE_TTL_MS });
  // Piggy-back a "last accessed" stamp on the cache miss — that already
  // throttles us to at most one write per TTL window per user, so the admin
  // Users page can show real activity without hitting the DB every request.
  prisma.user.update({
    where: { id: userId },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});
  return dbUser;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).toLowerCase().trim();
        const ip =
          request?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const limiterKey = `${email}:${ip}`;

        if (isLoginBlocked(limiterKey)) {
          const blockedUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
          logActivity({
            userId: blockedUser?.id ?? "unknown",
            action: "LOGIN_LOCKED",
            entityType: "user",
            entityId: blockedUser?.id ?? email,
            metadata: { email, ip },
          }).catch(() => {});
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.passwordHash || !user.isActive) {
          recordLoginFailure(limiterKey);
          logActivity({
            userId: user?.id ?? "unknown",
            action: "LOGIN_FAILED",
            entityType: "user",
            entityId: user?.id ?? email,
            metadata: { email, ip, reason: !user ? "not_found" : !user.passwordHash ? "no_password" : "inactive" },
          }).catch(() => {});
          return null;
        }

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) {
          recordLoginFailure(limiterKey);
          logActivity({
            userId: user.id,
            action: "LOGIN_FAILED",
            entityType: "user",
            entityId: user.id,
            metadata: { email, ip, reason: "wrong_password" },
          }).catch(() => {});
          return null;
        }

        clearLoginFailures(limiterKey);
        logActivity({
          userId: user.id,
          action: "LOGIN_SUCCESS",
          entityType: "user",
          entityId: user.id,
          metadata: { email, ip },
        }).catch(() => {});
        prisma.user.update({
          where: { id: user.id },
          data: { lastAccessedAt: new Date() },
        }).catch(() => {});
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: UserRole }).role;
        token.id = user.id;
      } else if (token.id) {
        const state = await getUserState(token.id as string);
        // Deactivated (or deleted) users lose their session — returning null
        // invalidates the token instead of letting it ride out the JWT lifetime.
        if (!state?.isActive) return null;
        token.role = state.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
});
