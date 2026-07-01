import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { findDuplicateForProduct, findDuplicatesForProducts } from "@/lib/duplicate-check";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const products = await prisma.productRecord.findMany({
    where: { projectId, isArchived: false },
    include: {
      attributeValues: {
        include: { attributeDefinition: true },
      },
      category: true,
      createdBy: { select: { id: true, name: true, email: true, image: true, role: true } },
      updatedBy: { select: { id: true, name: true, email: true, image: true, role: true } },
      _count: { select: { comments: true } },
    },
    orderBy: { rowIndex: "asc" },
  });

  const dupes = await findDuplicatesForProducts(
    products.map((p) => ({ id: p.id, partNumber: p.partNumber, projectId: p.projectId }))
  );
  return NextResponse.json(products.map((p) => ({ ...p, duplicateOf: dupes.get(p.id) ?? null })));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const body = await req.json();
  const { attributeValues: attrValues, ...coreData } = body;
  const parsed = productSchema.safeParse(coreData);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const [maxRow, project] = await Promise.all([
    prisma.productRecord.aggregate({ where: { projectId }, _max: { rowIndex: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { categoryId: true } }),
  ]);

  const product = await prisma.productRecord.create({
    data: {
      ...parsed.data,
      projectId,
      // Inherit project category if not explicitly overridden
      categoryId: parsed.data.categoryId ?? project?.categoryId ?? undefined,
      createdById: session.user.id,
      updatedById: session.user.id,
      rowIndex: (maxRow._max.rowIndex ?? -1) + 1,
    },
    include: {
      attributeValues: { include: { attributeDefinition: true } },
      category: true,
      createdBy: { select: { id: true, name: true, email: true, image: true, role: true } },
      updatedBy: { select: { id: true, name: true, email: true, image: true, role: true } },
    },
  });

  // Save multi-value attribute values
  if (attrValues && Array.isArray(attrValues)) {
    await prisma.productAttributeValue.createMany({
      data: attrValues.map((av: { attributeDefinitionId: string; valueIndex: number; textValue?: string; numberValue?: number; booleanValue?: boolean }) => ({
        productId: product.id,
        attributeDefinitionId: av.attributeDefinitionId,
        valueIndex: av.valueIndex ?? 0,
        textValue: av.textValue,
        numberValue: av.numberValue,
        booleanValue: av.booleanValue,
      })),
    });
  }

  await logActivity({
    userId: session.user.id,
    action: "CREATED",
    entityType: "ProductRecord",
    entityId: product.id,
    projectId,
    productId: product.id,
    newValue: product.partNumber ?? undefined,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

  const duplicateOf = await findDuplicateForProduct(product.partNumber, product.projectId, product.id);

  return NextResponse.json({ ...product, duplicateOf }, { status: 201 });
}
