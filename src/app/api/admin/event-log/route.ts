import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:event_log"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = 50;

  const userId = searchParams.get("userId") ?? undefined;
  const action = searchParams.get("action") ?? undefined;
  const entityType = searchParams.get("entityType") ?? undefined;
  const projectId = searchParams.get("projectId") ?? undefined;
  const partNumber = searchParams.get("partNumber") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const where: Prisma.ActivityLogWhereInput = {};
  if (userId) where.userId = userId;
  if (action) where.action = action as never;
  if (entityType) where.entityType = entityType;
  if (projectId) where.projectId = projectId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to + "T23:59:59.999Z");
  }

  if (partNumber) {
    const products = await prisma.productRecord.findMany({
      where: { partNumber: { contains: partNumber, mode: "insensitive" } },
      select: { id: true },
      take: 200,
    });
    where.productId = { in: products.map((p) => p.id) };
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, image: true, role: true } },
        project: { select: { id: true, name: true } },
        product: { select: { id: true, partNumber: true, itemName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return NextResponse.json({ data: logs, total, page, pageSize });
}
