import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:users"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  // Guard against locking everyone out: refuse to demote or deactivate the
  // last remaining active ADMIN account.
  const demoting = body.role !== undefined && body.role !== "ADMIN";
  const deactivating = body.isActive === false;
  if (demoting || deactivating) {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
    if (target?.role === "ADMIN" && target.isActive) {
      const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: "Cannot demote or deactivate the last active admin account" },
          { status: 400 }
        );
      }
    }
  }

  // Passwords are never set by an administrator — see
  // POST /api/users/[id]/reset-password, which scrambles the stored hash and
  // emails the user a reset link so only they ever know it.
  const before = await prisma.user.findUnique({
    where: { id },
    select: { role: true, isActive: true, name: true },
  });

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
    },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  const action = body.isActive === false ? "USER_DEACTIVATED" : "USER_UPDATED";
  logActivity({
    userId: session.user.id,
    action: action as never,
    entityType: "user",
    entityId: id,
    oldValue: JSON.stringify({ role: before?.role, isActive: before?.isActive, name: before?.name }),
    newValue: JSON.stringify({ role: user.role, isActive: user.isActive, name: user.name }),
    metadata: { email: user.email },
  }).catch(() => {});

  return NextResponse.json(user);
}
