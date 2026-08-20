import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { buildXlsxResponse } from "@/lib/xlsx-export";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:event_log"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
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

  const logs = await prisma.activityLog.findMany({
    where,
    include: {
      user: { select: { name: true, email: true, role: true } },
      project: { select: { name: true } },
      product: { select: { partNumber: true, itemName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const rows = logs.map((log) => ({
    Timestamp: new Date(log.createdAt).toLocaleString(),
    User: log.user?.name ?? "System",
    Email: log.user?.email ?? "",
    Role: log.user?.role ?? "",
    Action: log.action,
    "Entity Type": log.entityType,
    "Entity ID": log.entityId,
    Subject: log.product?.partNumber ?? log.product?.itemName ?? log.project?.name ?? log.entityId,
    Project: log.project?.name ?? "",
    "Part Number": log.product?.partNumber ?? "",
    "Field": log.fieldKey ?? "",
    "Old Value": log.oldValue ?? "",
    "New Value": log.newValue ?? "",
    Source: log.source ?? "",
  }));

  const date = new Date().toISOString().slice(0, 10);
  return buildXlsxResponse(rows, "Event Log", `sympl-event-log-${date}.xlsx`);
}
