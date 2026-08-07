export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { ProductEditClient } from "./product-edit-client";
import { CORE_FIELD_KEYS, REMOVED_CORE_KEYS } from "@/lib/core-fields";
import { findDuplicateForProduct } from "@/lib/duplicate-check";
import { checkProjectAccess } from "@/lib/project-access";
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
      project: { select: { id: true, name: true, status: true, brand: true, categoryId: true, category: true } },
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

  const access = await checkProjectAccess(product.projectId, session, "view");
  if (!access.ok) notFound();

  // Effective category: product's own override, else inherit from project
  const effectiveCategoryId = product.categoryId ?? product.project.categoryId ?? null;

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

  const duplicateOf = await findDuplicateForProduct(product.partNumber, product.projectId, product.id);

  const serialized = JSON.parse(
    JSON.stringify({ product: { ...product, duplicateOf }, globalAttrs, categoryAttrs, coreAttrDefs })
  );

  return (
    <ProductEditClient
      product={serialized.product}
      globalAttrs={serialized.globalAttrs}
      categoryAttrs={serialized.categoryAttrs}
      coreAttrDefs={serialized.coreAttrDefs}
      effectiveCategoryId={effectiveCategoryId}
      projectCategory={serialized.product.project.category ?? null}
      userRole={session.user.role}
      salsifyOrgId={salsifyConfig?.organizationId ?? null}
      inspectionsEnabled={inspectionsEnabled}
    />
  );
}
