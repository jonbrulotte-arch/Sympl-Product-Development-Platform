import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { sendMail, passwordResetEmail, BASE_URL } from "@/lib/email";
import { logActivity } from "@/lib/activity";

const RESET_EXPIRY_HOURS = 1;

// Admin-initiated password reset. The current password is replaced with a
// random value nobody knows — which immediately locks out anyone using the old
// one, including a compromised session's owner — and the user is emailed a
// reset link to choose a new one. Admins never see or set the password.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:users"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, passwordHash: true, isActive: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "This account hasn't been activated yet. Resend the invitation instead." },
      { status: 409 }
    );
  }

  // Random, never disclosed: the account is unusable until the reset link is
  // followed, rather than sitting on a guessable temporary password.
  const scrambled = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
  await prisma.user.update({ where: { id }, data: { passwordHash: scrambled } });

  await prisma.passwordResetToken.deleteMany({ where: { email: user.email } });
  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      email: user.email,
      token,
      expiresAt: new Date(Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000),
    },
  });

  const resetUrl = `${BASE_URL}/reset-password?token=${token}`;
  await sendMail(user.email, "Reset your Sympl password", passwordResetEmail(resetUrl));

  await logActivity({
    userId: session.user.id,
    action: "UPDATED",
    entityType: "User",
    entityId: user.id,
    fieldKey: "password",
    newValue: "reset by administrator",
    source: "Admin → Users",
  }).catch(() => {});

  return NextResponse.json({
    sent: true,
    email: user.email,
    resetUrl,
    expiresInHours: RESET_EXPIRY_HOURS,
    warning: user.isActive ? undefined : "This account is deactivated and cannot sign in until reactivated.",
  });
}
