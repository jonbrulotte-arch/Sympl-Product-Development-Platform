import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { otherProjectsFor } from "@/lib/product-catalog";
import { applyProductPatch } from "@/lib/product-update";
import { checkProjectAccess } from "@/lib/project-access";

type Params = { params: Promise<{ id: string; productId: string }> };

async function linkFor(projectId: string, productId: string) {
  return prisma.projectProduct.findUnique({ where: { projectId_productId: { projectId, productId } } });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: routeProjectId, productId } = await params;
  const viewAccess = await checkProjectAccess(routeProjectId, session, "view");
  if (!viewAccess.ok) return NextResponse.json({ error: viewAccess.error }, { status: viewAccess.status });
  const product = await prisma.productRecord.findUnique({
    where: { id: productId },
    include: {
      attributeValues: { include: { attributeDefinition: { include: { lovItems: true } } } },
      category: true,
      createdBy: { select: { id: true, name: true, email: true, image: true, role: true } },
      updatedBy: { select: { id: true, name: true, email: true, image: true, role: true } },
      comments: {
        include: { author: { select: { id: true, name: true, email: true, image: true, role: true } } },
        where: { parentId: null },
        orderBy: { createdAt: "desc" },
      },
      components: { include: { child: true } },
      componentOf: { include: { parent: true } },
    },
  });

  const link = product ? await linkFor(routeProjectId, product.id) : null;
  if (!product || !link || link.isArchived) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const duplicateOf = (await otherProjectsFor([product.id], routeProjectId)).get(product.id) ?? null;
  return NextResponse.json({ ...product, projectId: routeProjectId, rowIndex: link.rowIndex, duplicateOf });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, productId } = await params;
  const editAccess = await checkProjectAccess(projectId, session, "edit");
  if (!editAccess.ok) return NextResponse.json({ error: editAccess.error }, { status: editAccess.status });

  // Verifies the product is in this project before any write.
  const link = await linkFor(projectId, productId);
  if (!link || link.isArchived) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return applyProductPatch({
    req, productId, userId: session.user.id, projectId,
    decorate: async (updated) => ({
      ...updated,
      projectId,
      rowIndex: link.rowIndex,
      duplicateOf: (await otherProjectsFor([productId], projectId)).get(productId) ?? null,
    }),
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, productId } = await params;
  const access = await checkProjectAccess(projectId, session, "edit");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // Removing a product from a project only archives the link; the catalog
  // record and its other project links are untouched.
  const [target, link] = await Promise.all([
    prisma.productRecord.findUnique({ where: { id: productId }, select: { partNumber: true, itemName: true } }),
    linkFor(projectId, productId),
  ]);
  if (!target || !link || link.isArchived) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.projectProduct.update({
    where: { projectId_productId: { projectId, productId } },
    data: { isArchived: true },
  });

  logActivity({
    userId: session.user.id,
    action: "DELETED",
    entityType: "ProductRecord",
    fieldKey: "project",
    newValue: "Removed from project",
    entityId: productId,
    projectId,
    productId,
    // Kept in metadata because the product relation is nulled if the record is
    // ever purged — without this the entry reads "deleted product" and nothing else.
    oldValue: target.partNumber ?? target.itemName ?? undefined,
    metadata: { partNumber: target.partNumber, itemName: target.itemName },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
