import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { findDuplicateForProduct } from "@/lib/duplicate-check";
import { checkProjectAccess } from "@/lib/project-access";

type Params = { params: Promise<{ id: string; productId: string }> };

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

  if (!product || product.projectId !== routeProjectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const duplicateOf = await findDuplicateForProduct(product.partNumber, product.projectId, product.id);
  return NextResponse.json({ ...product, duplicateOf });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, productId } = await params;
  const editAccess = await checkProjectAccess(projectId, session, "edit");
  if (!editAccess.ok) return NextResponse.json({ error: editAccess.error }, { status: editAccess.status });

  const body = await req.json();
  const { attributeValues: attrValues, clearAttributeIds, source: reqSource, ...coreData } = body;
  const activitySource: string = reqSource ?? "Product Record";

  const parsed = productSchema.partial().safeParse(coreData);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  // Capture old values for audit (also verifies product exists and belongs to project)
  const oldProduct = await prisma.productRecord.findUnique({ where: { id: productId } });
  if (!oldProduct || oldProduct.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Replace EAV attributes FIRST so the final update/include returns up-to-date attributeValues.
  // We delete-then-create (not upsert) so removed values don't linger in the DB.
  if (attrValues && Array.isArray(attrValues)) {
    type AvInput = { attributeDefinitionId: string; valueIndex?: number; textValue?: string; numberValue?: number; booleanValue?: boolean };
    const incoming = attrValues as AvInput[];
    // Collect IDs from both the incoming values AND the explicit clear list
    // so that clearing a field (empty attributeValues) still deletes old rows.
    const explicitClearIds: string[] = Array.isArray(clearAttributeIds) ? clearAttributeIds : [];
    const affectedAttrIds = [...new Set([
      ...incoming.map((av) => av.attributeDefinitionId),
      ...explicitClearIds,
    ])];
    if (affectedAttrIds.length > 0) {
      await prisma.productAttributeValue.deleteMany({
        where: { productId, attributeDefinitionId: { in: affectedAttrIds } },
      });
    }
    if (incoming.length > 0) {
      await prisma.productAttributeValue.createMany({
        data: incoming.map((av) => ({
          productId,
          attributeDefinitionId: av.attributeDefinitionId,
          valueIndex: av.valueIndex ?? 0,
          textValue: av.textValue,
          numberValue: av.numberValue,
          booleanValue: av.booleanValue,
        })),
      });
    }
  }

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
        source: activitySource,
      }).catch(() => {});
    }
  }

  prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } }).catch(() => {});

  const duplicateOf = await findDuplicateForProduct(updated.partNumber, updated.projectId, updated.id);

  return NextResponse.json({ ...updated, duplicateOf });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, productId } = await params;
  const access = await checkProjectAccess(projectId, session, "edit");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // Verify the product actually belongs to the project the caller was authorized on
  const target = await prisma.productRecord.findUnique({ where: { id: productId }, select: { projectId: true } });
  if (!target || target.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
