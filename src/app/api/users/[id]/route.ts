import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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

  let passwordHash: string | undefined;
  if (body.password) {
    if (typeof body.password !== "string" || body.password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    passwordHash = await bcrypt.hash(body.password, 12);
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(passwordHash ? { passwordHash } : {}),
    },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  return NextResponse.json(user);
}
