export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { ProductEditClient } from "./product-edit-client";
import { CORE_FIELD_KEYS, REMOVED_CORE_KEYS } from "@/lib/core-fields";
import { canEditProduct } from "@/lib/product-catalog";
import { getCategoryAndAncestorIds } from "@/lib/category-tree";
import { isInspectionsEnabled } from "@/lib/app-config";

const CORE_COLUMN_KEYS = new Set(CORE_FIELD_KEYS);
const EXCLUDED_GLOBAL_KEYS = [...CORE_FIELD_KEYS, ...REMOVED_CORE_KEYS];

const attrInclude = {
  include: {
    lovItems: { orderBy: { sortOrder: "asc" as const } },
    section: true,
  },
};

export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { productId } = await params;

  const product = await prisma.productRecord.findUnique({
    where: { id: productId },
    include: {
      projects: { where: { isArchived: false }, orderBy: { createdAt: "asc" }, select: { projectId: true, project: { select: { id: true, name: true, status: true, brand: true, categoryId: true, category: true } } } },
      category: true,
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
      attributeValues: {
        include: { attributeDefinition: true },
        orderBy: [{ attributeDefinitionId: "asc" }, { valueIndex: "asc" }],
      },
    },
  });

  if (!product) notFound();

  // Products are a shared catalog: anyone signed in can view; editing is checked separately.
  const primary = product.projects[0]?.project ?? null;

  // Effective category: product's own override, else inherit from its primary project
  const effectiveCategoryId = product.categoryId ?? primary?.categoryId ?? null;

  // Include attributes scoped to the effective category AND any ancestor
  // categories, so nested categories inherit their parents' attributes.
  const categoryIds = await getCategoryAndAncestorIds(effectiveCategoryId);

  const [globalAttrs, categoryAttrs, coreAttrDefs] = await Promise.all([
    prisma.attributeDefinition.findMany({
      where: { categoryId: null, isActive: true, key: { notIn: EXCLUDED_GLOBAL_KEYS } },
      ...attrInclude,
      orderBy: [{ section: { sortOrder: "asc" } }, { sectionId: "asc" }, { sortOrder: "asc" }],
    }),
    categoryIds.length > 0
      ? prisma.attributeDefinition.findMany({
          where: { categoryId: { in: categoryIds }, isActive: true },
          ...attrInclude,
          orderBy: [{ section: { sortOrder: "asc" } }, { sectionId: "asc" }, { sortOrder: "asc" }],
        })
      : Promise.resolve([]),
    prisma.attributeDefinition.findMany({
      where: { key: { in: Array.from(CORE_COLUMN_KEYS) }, isActive: true },
      ...attrInclude,
      orderBy: [{ section: { sortOrder: "asc" } }, { sectionId: "asc" }, { sortOrder: "asc" }],
    }),
  ]);

  const [salsifyConfig, inspectionsEnabled] = await Promise.all([
    prisma.salsifyConfig.findFirst({ select: { organizationId: true, isEnabled: true } }),
    isInspectionsEnabled(),
  ]);

  const isAdmin = session.user.role === "ADMIN";
  const [canEdit, linkableProjects] = await Promise.all([
    canEditProduct(session, product.id),
    prisma.project.findMany({
      where: {
        isArchived: false,
        ...(isAdmin ? {} : { OR: [{ ownerId: session.user.id }, { members: { some: { userId: session.user.id, canEdit: true } } }] }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serialized = JSON.parse(
    JSON.stringify({ product: { ...product, project: primary, projectId: primary?.id ?? null, duplicateOf: null }, globalAttrs, categoryAttrs, coreAttrDefs })
  );

  return (
    <ProductEditClient
      product={serialized.product}
      globalAttrs={serialized.globalAttrs}
      categoryAttrs={serialized.categoryAttrs}
      coreAttrDefs={serialized.coreAttrDefs}
      effectiveCategoryId={effectiveCategoryId}
      projectCategory={serialized.product.project?.category ?? null}
      canEdit={canEdit}
      linkableProjects={linkableProjects}
      userRole={session.user.role}
      salsifyOrgId={salsifyConfig?.organizationId ?? null}
      inspectionsEnabled={inspectionsEnabled}
    />
  );
}
