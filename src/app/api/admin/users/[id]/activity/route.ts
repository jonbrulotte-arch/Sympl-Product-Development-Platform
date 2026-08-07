import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:users"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;

  const logs = await prisma.activityLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      fieldKey: true,
      oldValue: true,
      newValue: true,
      source: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
      product: { select: { id: true, partNumber: true, itemName: true } },
    },
  });

  return NextResponse.json({ data: logs });
}
