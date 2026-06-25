import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendMail, passwordResetEmail, BASE_URL } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  // Always return success to avoid user enumeration
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (user) {
    // Invalidate any existing tokens for this email
    await prisma.passwordResetToken.deleteMany({ where: { email: user.email } });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { email: user.email, token, expiresAt },
    });

    const resetUrl = `${BASE_URL}/reset-password?token=${token}`;
    await sendMail(user.email, "Reset your Sympl password", passwordResetEmail(resetUrl));
  }

  return NextResponse.json({ success: true });
}
