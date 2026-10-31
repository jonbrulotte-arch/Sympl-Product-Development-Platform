import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { deleteProducts } from "@/lib/product-delete";
import { canEditProduct, projectLinksOf } from "@/lib/product-catalog";
import { applyProductPatch } from "@/lib/product-update";

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

// Permanently deletes the product (and its project links, values and comments).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.role, "products:delete"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { productId } = await params;
  const result = await deleteProducts(session.user.id, [productId]);
  if (result.deleted === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
