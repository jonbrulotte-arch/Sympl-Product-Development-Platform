import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";
import { unresolvedDriftForProduct } from "@/lib/salsify-drift";

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

  const [outstanding, salsifyAttrs, salsifyConfig, canSync] = await Promise.all([
    unresolvedDriftForProduct(productId, product.salsifyLastSyncedAt),
    prisma.attributeDefinition.findMany({
      where: { salsifyEnabled: true, isActive: true },
      select: { key: true, label: true, salsifyPropertyId: true },
    }),
    prisma.salsifyConfig.findFirst({ select: { organizationId: true, isEnabled: true } }),
    can(session.user.role, "products:sync_salsify"),
  ]);

  const syncable = new Map(salsifyAttrs.map((a) => [a.key, a]));

  const changes = outstanding.map((c) => {
    const attr = syncable.get(c.fieldKey);
    return {
      ...c,
      changedAt: c.changedAt.toISOString(),
      label: attr?.label ?? c.fieldKey.replace(/([A-Z])/g, " $1").replace(/^./, (ch) => ch.toUpperCase()).trim(),
      syncable: !!attr?.salsifyPropertyId,
    };
  });

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
    changes,
    canSync: canSync && !!salsifyConfig?.isEnabled,
  });
}
