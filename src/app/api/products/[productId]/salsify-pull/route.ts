import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { canEditProduct } from "@/lib/product-catalog";
import { logActivity } from "@/lib/activity";
import { runSalsifyPull, curateSalsifyData } from "@/lib/salsify-pull";

// Single-product pull FROM Salsify for the product page. Works for catalog
// products that aren't in any project. Same contract as the project bulk pull:
// { dryRun: true } returns the change report; { dryRun: false, attributeKeys }
// applies the checked attributes and refreshes the stored Salsify snapshot
// (digital assets, timestamps) shown on the page.

type Params = { params: Promise<{ productId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await can(session.user.role, "products:pull_salsify"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId } = await params;
  // A pull overwrites product data, so it needs edit rights on the product.
  if (!(await canEditProduct(session, productId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const product = await prisma.productRecord.findUnique({
    where: { id: productId },
    include: { attributeValues: true },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dryRun !== false;
  const attributeKeys: string[] | null = Array.isArray(body.attributeKeys) ? body.attributeKeys : null;

  const result = await runSalsifyPull({
    session: session as Parameters<typeof runSalsifyPull>[0]["session"],
    products: [product],
    fallbackCategoryId: product.categoryId,
    dryRun,
    attributeKeys,
    emptyMessage: "This product has no Part Number, so there is nothing to look up in Salsify.",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // The snapshot (assets, timestamps) is display-only, so it refreshes on the
  // report as well as on apply — opening the report alone updates the images.
  const remote = result.remoteById.get(product.id);
  if (remote) {
    await prisma.productRecord.update({
      where: { id: product.id },
      data: { salsifyData: curateSalsifyData(remote), salsifyLastPulledAt: new Date() },
    });
  }
  if (dryRun) return NextResponse.json(result.body);

  for (const c of result.applied) {
    logActivity({
      userId: session.user.id, action: "UPDATED", entityType: "ProductRecord", entityId: product.id, productId: product.id,
      fieldKey: c.key, oldValue: c.current || undefined, newValue: c.incoming || undefined, source: "Salsify Pull",
    }).catch(() => {});
  }

  return NextResponse.json(result.body);
}
