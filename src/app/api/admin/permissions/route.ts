import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissionMatrix, invalidatePermissionCache, PERMISSIONS, ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const matrix = await getPermissionMatrix();
  return NextResponse.json(matrix);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: Record<string, Record<string, boolean>> = await req.json();
  const permKeys = Object.keys(PERMISSIONS);

  const upserts = [];
  for (const role of ROLES) {
    if (!body[role]) continue;
    for (const permission of permKeys) {
      if (!(permission in body[role])) continue;
      // Never let ADMIN lose access to admin:users or admin:settings to prevent lockout
      if (role === "ADMIN" && (permission === "admin:users" || permission === "admin:settings")) continue;
      upserts.push(
        prisma.rolePermission.upsert({
          where: { role_permission: { role, permission } },
          update: { granted: body[role][permission] },
          create: { role, permission, granted: body[role][permission] },
        })
      );
    }
  }

  const oldMatrix = await getPermissionMatrix();
  await Promise.all(upserts);
  invalidatePermissionCache();

  logActivity({
    userId: session.user.id,
    action: "PERMISSION_CHANGED",
    entityType: "RolePermission",
    entityId: "permissions",
    oldValue: JSON.stringify(oldMatrix),
    newValue: JSON.stringify(body),
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
