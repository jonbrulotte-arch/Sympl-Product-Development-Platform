import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { checkProjectAccess } from "@/lib/project-access";
import { inProject, linkProduct, normalizePartNumber, otherProjectsFor } from "@/lib/product-catalog";

const PRODUCT_INCLUDE = {
  attributeValues: { include: { attributeDefinition: true } },
  category: true,
  createdBy: { select: { id: true, name: true, email: true, image: true, role: true } },
  updatedBy: { select: { id: true, name: true, email: true, image: true, role: true } },
  _count: { select: { comments: true } },
} as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const access = await checkProjectAccess(projectId, session, "view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const links = await prisma.projectProduct.findMany({
    where: { projectId, isArchived: false, product: { isArchived: false } },
    orderBy: [{ rowIndex: "asc" }, { createdAt: "asc" }],
    include: { product: { include: PRODUCT_INCLUDE } },
  });

  const shared = await otherProjectsFor(links.map((l) => l.productId), projectId);
  return NextResponse.json(
    links.map((l) => ({ ...l.product, projectId, rowIndex: l.rowIndex, duplicateOf: shared.get(l.productId) ?? null })),
  );
}

// Creates a product in this project, or links an existing catalog product
// (body.linkProductId), optionally replacing a blank row the user just added.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const access = await checkProjectAccess(projectId, session, "edit");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json().catch(() => ({}));

  if (typeof body.linkProductId === "string") {
    const existing = await prisma.productRecord.findUnique({ where: { id: body.linkProductId }, select: { id: true, partNumber: true } });
    if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      if (typeof body.replaceProductId === "string" && body.replaceProductId !== existing.id) {
        await removeBlankRow(tx, projectId, body.replaceProductId);
      }
      await linkProduct(projectId, existing.id, session.user.id, tx);
    });
    await logActivity({
      userId: session.user.id, action: "UPDATED", entityType: "ProductRecord", entityId: existing.id,
      projectId, productId: existing.id, fieldKey: "project", newValue: "Linked to project", source: "Project Grid",
    });
    const link = await prisma.projectProduct.findUnique({
      where: { projectId_productId: { projectId, productId: existing.id } },
      include: { product: { include: PRODUCT_INCLUDE } },
    });
    const shared = await otherProjectsFor([existing.id], projectId);
    return NextResponse.json({ ...link!.product, projectId, rowIndex: link!.rowIndex, duplicateOf: shared.get(existing.id) ?? null }, { status: 201 });
  }

  const { attributeValues: attrValues, ...coreData } = body;
  const parsed = productSchema.safeParse(coreData);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const partNumber = normalizePartNumber(parsed.data.partNumber);
  if (partNumber) {
    const clash = await prisma.productRecord.findUnique({ where: { partNumber }, select: { id: true, partNumber: true, itemName: true } });
    if (clash) return NextResponse.json({ error: "Part number already exists", existingProduct: clash }, { status: 409 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { categoryId: true } });

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.productRecord.create({
      data: {
        ...parsed.data,
        partNumber: partNumber ?? null,
        categoryId: parsed.data.categoryId ?? project?.categoryId ?? undefined,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    });
    await linkProduct(projectId, created.id, session.user.id, tx);
    if (Array.isArray(attrValues) && attrValues.length) {
      await tx.productAttributeValue.createMany({
        data: attrValues.map((av: { attributeDefinitionId: string; valueIndex: number; textValue?: string; numberValue?: number; booleanValue?: boolean }) => ({
          productId: created.id,
          attributeDefinitionId: av.attributeDefinitionId,
          valueIndex: av.valueIndex ?? 0,
          textValue: av.textValue,
          numberValue: av.numberValue,
          booleanValue: av.booleanValue,
        })),
      });
    }
    return created;
  });

  await logActivity({
    userId: session.user.id,
    action: "CREATED",
    entityType: "ProductRecord",
    entityId: product.id,
    projectId,
    productId: product.id,
    newValue: product.partNumber ?? undefined,
  });
  await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });

  const link = await prisma.projectProduct.findUnique({
    where: { projectId_productId: { projectId, productId: product.id } },
    include: { product: { include: PRODUCT_INCLUDE } },
  });
  return NextResponse.json({ ...link!.product, projectId, rowIndex: link!.rowIndex, duplicateOf: null }, { status: 201 });
}

// A blank row is only deleted outright when it belongs to no other project;
// otherwise it is just unlinked from this one.
async function removeBlankRow(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], projectId: string, productId: string) {
  const otherLinks = await tx.projectProduct.count({ where: { productId, projectId: { not: projectId } } });
  if (otherLinks === 0) {
    await tx.productRecord.deleteMany({ where: { id: productId, ...inProject(projectId) } });
  } else {
    await tx.projectProduct.deleteMany({ where: { projectId, productId } });
  }
}
