import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { canEditProduct, projectLinksOf } from "@/lib/product-catalog";
import { applyProductPatch } from "@/lib/product-update";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ productId: string }> };

// Catalog-level save, independent of any project.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { productId } = await params;
  if (!(await canEditProduct(session, productId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return applyProductPatch({
    req, productId, userId: session.user.id, projectId: null,
    decorate: async (updated) => {
      const links = await projectLinksOf(productId);
      return { ...updated, projects: links, project: links[0]?.project ?? null, duplicateOf: null };
    },
  });
}

// Archives the product in the catalog (hidden everywhere, links kept so it can be restored).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.role, "products:edit_catalog"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { productId } = await params;
  const product = await prisma.productRecord.update({ where: { id: productId }, data: { isArchived: true } }).catch(() => null);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  logActivity({
    userId: session.user.id, action: "DELETED", entityType: "ProductRecord", entityId: productId, productId,
    oldValue: product.partNumber ?? product.itemName ?? undefined, source: "Products",
    metadata: { partNumber: product.partNumber, itemName: product.itemName },
  }).catch(() => {});
  return NextResponse.json({ success: true });
}
