// Account invitations.
//
// An invited user is created with no passwordHash — auth rejects those, so the
// account is inert until the recipient follows the emailed link and sets a
// password. Invitations reuse PasswordResetToken (same single-use, expiring
// token, same consuming endpoint) with a longer window, since a person may not
// check email for a few days.

import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendMail, invitationEmail, BASE_URL } from "@/lib/email";

export const INVITE_EXPIRY_DAYS = 7;

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  DIRECTOR: "Director",
  PRODUCT_MANAGER: "Product Manager",
  CONTRIBUTOR: "Contributor",
  REVIEWER: "Reviewer",
  APPROVER: "Approver",
  VIEWER: "Viewer",
};

/**
 * Issues a fresh invitation token and emails it. Any outstanding token for the
 * address is dropped first so only the newest link works.
 */
export async function sendInvitation(opts: {
  email: string;
  role: string;
  inviterName: string;
}): Promise<{ inviteUrl: string }> {
  await prisma.passwordResetToken.deleteMany({ where: { email: opts.email } });

  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      email: opts.email,
      token,
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const inviteUrl = `${BASE_URL}/accept-invite?token=${token}`;
  await sendMail(
    opts.email,
    "You've been invited to Sympl PM",
    invitationEmail({
      inviteUrl,
      inviterName: opts.inviterName,
      roleLabel: ROLE_LABELS[opts.role] ?? opts.role,
      expiresInDays: INVITE_EXPIRY_DAYS,
    })
  );

  // Returned so an admin can copy the link when SMTP isn't configured.
  return { inviteUrl };
}
