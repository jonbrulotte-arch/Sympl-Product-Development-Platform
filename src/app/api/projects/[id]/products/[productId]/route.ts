import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string; productId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;
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

  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, productId } = await params;
  const body = await req.json();
  const { attributeValues: attrValues, ...coreData } = body;

  const parsed = productSchema.partial().safeParse(coreData);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  // Capture old values for audit
  const oldProduct = await prisma.productRecord.findUnique({ where: { id: productId } });

  const updated = await prisma.productRecord.update({
    where: { id: productId },
    data: {
      ...parsed.data,
      updatedById: session.user.id,
    },
    include: {
      attributeValues: { include: { attributeDefinition: true } },
      category: true,
      createdBy: { select: { id: true, name: true, email: true, image: true, role: true } },
      updatedBy: { select: { id: true, name: true, email: true, image: true, role: true } },
    },
  });

  // Upsert multi-value attributes
  if (attrValues && Array.isArray(attrValues)) {
    for (const av of attrValues as { attributeDefinitionId: string; valueIndex?: number; textValue?: string; numberValue?: number; booleanValue?: boolean }[]) {
      await prisma.productAttributeValue.upsert({
        where: {
          productId_attributeDefinitionId_valueIndex: {
            productId,
            attributeDefinitionId: av.attributeDefinitionId,
            valueIndex: av.valueIndex ?? 0,
          },
        },
        update: {
          textValue: av.textValue,
          numberValue: av.numberValue,
          booleanValue: av.booleanValue,
        },
        create: {
          productId,
          attributeDefinitionId: av.attributeDefinitionId,
          valueIndex: av.valueIndex ?? 0,
          textValue: av.textValue,
          numberValue: av.numberValue,
          booleanValue: av.booleanValue,
        },
      });
    }
  }

  // Log field-level changes — fire-and-forget so missing ActivityLog table doesn't crash saves
  const changedFields = Object.keys(parsed.data) as (keyof typeof parsed.data)[];
  for (const field of changedFields) {
    const oldVal = oldProduct?.[field as keyof typeof oldProduct];
    const newVal = parsed.data[field];
    if (String(oldVal) !== String(newVal)) {
      logActivity({
        userId: session.user.id,
        action: "UPDATED",
        entityType: "ProductRecord",
        entityId: productId,
        projectId,
        productId,
        fieldKey: field,
        oldValue: oldVal != null ? String(oldVal) : undefined,
        newValue: newVal != null ? String(newVal) : undefined,
      }).catch(() => {});
    }
  }

  prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } }).catch(() => {});

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, productId } = await params;

  await prisma.productRecord.update({
    where: { id: productId },
    data: { isArchived: true },
  });

  logActivity({
    userId: session.user.id,
    action: "DELETED",
    entityType: "ProductRecord",
    entityId: productId,
    projectId,
    productId,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
