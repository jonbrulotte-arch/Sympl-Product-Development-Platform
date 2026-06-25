import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { ProductEditClient } from "./product-edit-client";

const CORE_COLUMN_KEYS = new Set([
  "partNumber", "modelNumber", "itemName", "brand", "upc",
  "inventoryStatus", "warrantyInfo",
  "htsCode", "htsCodeCanada", "productComposition", "needsProp65",
  "packagingType", "packSize", "numberOfPieces", "individualOrSet", "material", "size",
  "jspCategory", "userManual", "cutSheets",
  "upcHeight", "upcWidth", "upcLength", "upcWeight",
  "itemHeight", "itemWidth", "itemLength", "itemWeight",
  "innerCartonGtin", "innerCartonHeight", "innerCartonWidth", "innerCartonLength", "innerCartonWeight", "innerCartonQty",
  "masterCartonGtin", "masterCartonHeight", "masterCartonWidth", "masterCartonLength", "masterCartonWeight", "masterCartonQty",
  "palletGtin", "palletHeight", "palletWidth", "palletLength", "palletWeight", "palletStackable", "layersPerPallet", "palletQty",
]);

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

  // Effective category: product's own override, else inherit from project
  const effectiveCategoryId = product.categoryId ?? product.project.categoryId ?? null;

  const [globalAttrs, categoryAttrs, coreAttrDefs] = await Promise.all([
    prisma.attributeDefinition.findMany({
      where: { categoryId: null, isActive: true, key: { notIn: Array.from(CORE_COLUMN_KEYS) } },
      ...attrInclude,
      orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    effectiveCategoryId
      ? prisma.attributeDefinition.findMany({
          where: { categoryId: effectiveCategoryId, isActive: true },
          ...attrInclude,
          orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
        })
      : Promise.resolve([]),
    prisma.attributeDefinition.findMany({
      where: { key: { in: Array.from(CORE_COLUMN_KEYS) }, isActive: true },
      ...attrInclude,
      orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
  ]);

  const serialized = JSON.parse(
    JSON.stringify({ product, globalAttrs, categoryAttrs, coreAttrDefs })
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
    />
  );
}
