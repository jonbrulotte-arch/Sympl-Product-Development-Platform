import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { sendInvitation, INVITE_EXPIRY_DAYS } from "@/lib/invitations";

// Re-issues an invitation for an account that hasn't set a password yet.
// Invalidates the previous link, so a resend also serves as "revoke the old
// one". Accounts that already have a password use the password-reset flow
// instead — re-inviting them would hand out a way in to whoever holds the
// mailbox.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:users"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { email: true, role: true, passwordHash: true, isActive: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.passwordHash) {
    return NextResponse.json(
      { error: "This account already has a password. Use Change password or have them use Forgot password." },
      { status: 409 }
    );
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Reactivate the account before inviting." }, { status: 409 });
  }

  const { inviteUrl } = await sendInvitation({
    email: user.email,
    role: user.role,
    inviterName: session.user.name ?? session.user.email ?? "An administrator",
  });

  return NextResponse.json({ sent: true, inviteUrl, expiresInDays: INVITE_EXPIRY_DAYS });
}
