import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendInvitation, INVITE_EXPIRY_DAYS } from "@/lib/invitations";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Full account details are admin-only; everyone else gets just what the
  // member-picker and approver-picker UIs need (active users, basic identity).
  const isUserAdmin = await can(session.user.role, "admin:users");

  const users = await prisma.user.findMany({
    where: isUserAdmin ? {} : { isActive: true },
    select: isUserAdmin
      ? {
          id: true, email: true, name: true, image: true, role: true,
          isActive: true, createdAt: true, updatedAt: true, passwordHash: true,
        }
      : { id: true, email: true, name: true, image: true, role: true },
    orderBy: { name: "asc" },
  });

  // passwordHash never leaves the server; admins get a pendingInvite flag
  // derived from it so the UI can flag accounts that were never activated.
  if (!isUserAdmin) return NextResponse.json(users);
  return NextResponse.json(
    users.map((u) => {
      const { passwordHash, ...rest } = u as typeof u & { passwordHash: string | null };
      return { ...rest, pendingInvite: !passwordHash };
    })
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:users"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const name: string | undefined = body.name?.trim() || undefined;
  const role: string = body.role ?? "CONTRIBUTOR";
  const password: string | undefined = body.password;
  const email = String(body.email ?? "").toLowerCase().trim();

  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });
  if (password && password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  // Without an explicit password the account is created inert — no
  // passwordHash means auth refuses it — and an invitation link sets one.
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role: role as never,
      passwordHash: password ? await bcrypt.hash(password, 12) : null,
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });

  let inviteUrl: string | undefined;
  if (!password) {
    ({ inviteUrl } = await sendInvitation({
      email: user.email,
      role: user.role,
      inviterName: session.user.name ?? session.user.email ?? "An administrator",
    }));
  }

  return NextResponse.json(
    { ...user, invited: !password, inviteUrl, expiresInDays: password ? undefined : INVITE_EXPIRY_DAYS },
    { status: 201 }
  );
}
