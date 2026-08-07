import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";

// Detail behind a row of the Out-of-Sync Products report: which fields were
// edited since the last Salsify push, what they were, what they are now, and
// whether the caller may push individual fields back to Salsify.

type Params = { params: Promise<{ id: string; productId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, productId } = await params;
  const access = await checkProjectAccess(projectId, session, "view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const product = await prisma.productRecord.findUnique({
    where: { id: productId },
    select: {
      id: true,
      projectId: true,
      partNumber: true,
      itemName: true,
      brand: true,
      updatedAt: true,
      salsifyLastSyncedAt: true,
      project: { select: { id: true, name: true, status: true } },
    },
  });
  if (!product || product.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [logs, salsifyAttrs, salsifyConfig, canSync] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        productId,
        entityType: "ProductRecord",
        fieldKey: { not: null },
        ...(product.salsifyLastSyncedAt ? { createdAt: { gt: product.salsifyLastSyncedAt } } : {}),
      },
      select: {
        id: true,
        fieldKey: true,
        oldValue: true,
        newValue: true,
        source: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.attributeDefinition.findMany({
      where: { salsifyEnabled: true, isActive: true },
      select: { key: true, label: true, salsifyPropertyId: true },
    }),
    prisma.salsifyConfig.findFirst({ select: { organizationId: true, isEnabled: true } }),
    can(session.user.role, "products:sync_salsify"),
  ]);

  const syncable = new Map(salsifyAttrs.map((a) => [a.key, a]));

  // Collapse the log into one entry per field: the value before the first edit
  // since the last sync, and the value after the most recent one.
  type Change = {
    fieldKey: string;
    label: string;
    oldValue: string | null;
    newValue: string | null;
    changedBy: string;
    changedAt: string;
    source: string | null;
    edits: number;
    syncable: boolean;
  };
  const byField = new Map<string, Change>();
  for (const log of logs) {
    const key = log.fieldKey!;
    const attr = syncable.get(key);
    const existing = byField.get(key);
    if (existing) {
      // logs are newest-first, so each later entry is the older edit
      existing.oldValue = log.oldValue;
      existing.edits++;
      continue;
    }
    byField.set(key, {
      fieldKey: key,
      label: attr?.label ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim(),
      oldValue: log.oldValue,
      newValue: log.newValue,
      changedBy: log.user.name ?? log.user.email,
      changedAt: log.createdAt.toISOString(),
      source: log.source,
      edits: 1,
      syncable: !!attr?.salsifyPropertyId,
    });
  }

  const salsifyUrl =
    salsifyConfig?.organizationId && product.partNumber
      ? `https://app.salsify.com/app/orgs/${salsifyConfig.organizationId}/products/v2/${encodeURIComponent(product.partNumber)}`
      : null;

  return NextResponse.json({
    product: {
      id: product.id,
      partNumber: product.partNumber,
      itemName: product.itemName,
      brand: product.brand,
      updatedAt: product.updatedAt.toISOString(),
      salsifyLastSyncedAt: product.salsifyLastSyncedAt?.toISOString() ?? null,
    },
    project: product.project,
    links: {
      project: `/projects/${product.projectId}`,
      product: `/products/${product.id}`,
      salsify: salsifyUrl,
    },
    changes: [...byField.values()],
    canSync: canSync && !!salsifyConfig?.isEnabled,
  });
}
