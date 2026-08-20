import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { RateLimiter } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity";

const limiter = new RateLimiter({ maxRequests: 10, windowMs: 15 * 60 * 1000 });

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limiter.isLimited(`reset:${ip}`)) {
    return NextResponse.json({ error: "Too many requests, please try again later" }, { status: 429 });
  }

  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: "Token and password required" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "Reset link is invalid or has expired" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: record.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await prisma.passwordResetToken.delete({ where: { token } });

  logActivity({
    userId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "user",
    entityId: user.id,
    metadata: { method: "reset_link" },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
