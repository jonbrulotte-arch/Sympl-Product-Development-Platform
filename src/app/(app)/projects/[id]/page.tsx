import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ProjectDetailClient } from "./project-detail-client";
import { canEditProject } from "@/lib/permissions";
import { CORE_FIELD_KEYS, REMOVED_CORE_KEYS } from "@/lib/core-fields";
import { findDuplicatesForProducts } from "@/lib/duplicate-check";
import { checkProjectAccess } from "@/lib/project-access";
import { expandWithAncestors } from "@/lib/category-tree";

const CORE_COLUMN_KEYS = new Set(CORE_FIELD_KEYS);

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { id } = await params;

  const access = await checkProjectAccess(id, session, "view");
  if (!access.ok) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true, role: true } },
      category: true,
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true, role: true } },
        },
      },
      workflowStages: {
        include: {
          approvals: {
            include: {
              approver: { select: { id: true, name: true, email: true, image: true, role: true } },
            },
          },
          dependsOnStage: { select: { id: true, name: true, status: true } },
          complianceEvent: { select: { id: true, title: true, status: true, type: { select: { name: true, color: true } } } },
          psir: { select: { id: true, title: true, result: true, referenceNumber: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { products: { where: { isArchived: false } } } },
    },
  });

  if (!project) notFound();

  const attrInclude = {
    include: {
      lovItems: { orderBy: { sortOrder: "asc" as const } },
      section: true,
    },
  };

  const products = await prisma.productRecord.findMany({
    where: { projectId: id, isArchived: false },
    include: {
      attributeValues: {
        include: { attributeDefinition: true },
      },
      category: true,
      createdBy: { select: { id: true, name: true, email: true, image: true, role: true } },
      updatedBy: { select: { id: true, name: true, email: true, image: true, role: true } },
    },
    orderBy: [{ rowIndex: "asc" }, { createdAt: "asc" }],
  });

  // Category attrs must cover the project's category, every product's own
  // category (products can override the project category), and all of their
  // ancestors so nested categories inherit their parents' attributes.
  const categoryIds = await expandWithAncestors([
    project.categoryId,
    ...products.map((p) => p.categoryId),
  ]);

  // Single unified attribute query — the same ordering the export uses
  // (section.sortOrder → attr.sortOrder) so grid columns and spreadsheet
  // columns always appear in the same sequence.
  const [allAttrDefs, allCategories] = await Promise.all([
    prisma.attributeDefinition.findMany({
      where: {
        isActive: true,
        key: { notIn: REMOVED_CORE_KEYS },
        OR: [
          { key: { in: Array.from(CORE_COLUMN_KEYS) } },
          { categoryId: null },
          ...(categoryIds.length > 0 ? [{ categoryId: { in: categoryIds } }] : []),
        ],
      },
      ...attrInclude,
      orderBy: [{ section: { sortOrder: "asc" } }, { sectionId: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Split into core (ProductRecord-backed columns) and EAV for the grid,
  // preserving the unified sort order within each group.
  const coreAttrDefs = allAttrDefs.filter((a) => CORE_COLUMN_KEYS.has(a.key));
  const eavAttrDefs = allAttrDefs.filter((a) => !CORE_COLUMN_KEYS.has(a.key));

  const canEdit = canEditProject(
    session.user.role as never,
    session.user.id,
    project
  );

  const dupes = await findDuplicatesForProducts(
    products.map((p) => ({ id: p.id, partNumber: p.partNumber, projectId: p.projectId }))
  );
  const productsWithDupes = products.map((p) => ({ ...p, duplicateOf: dupes.get(p.id) ?? null }));

  // Serialize through JSON to convert Prisma Decimal/Date objects to plain primitives
  // before crossing the server→client boundary
  const serialized = JSON.parse(JSON.stringify({ project, products: productsWithDupes, allAttrDefs, coreAttrDefs, eavAttrDefs, allCategories }));

  return (
    <ProjectDetailClient
      project={serialized.project}
      initialProducts={serialized.products}
      allAttrDefs={serialized.allAttrDefs}
      coreAttrDefs={serialized.coreAttrDefs}
      eavAttrDefs={serialized.eavAttrDefs}
      allCategories={serialized.allCategories}
      canEdit={canEdit}
      currentUserId={session.user.id}
      userRole={session.user.role as string}
    />
  );
}
