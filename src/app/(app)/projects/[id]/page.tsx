import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ProjectDetailClient } from "./project-detail-client";
import { canEditProject } from "@/lib/permissions";
import { CORE_FIELD_KEYS } from "@/lib/core-fields";
import { findDuplicatesForProducts } from "@/lib/duplicate-check";

// Keys already rendered as typed columns in the grid — exclude from EAV query
const CORE_COLUMN_KEYS = new Set(CORE_FIELD_KEYS);

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { id } = await params;

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
      _count: { select: { products: true } },
    },
  });

  if (!project) notFound();

  const attrInclude = {
    include: {
      lovItems: { orderBy: { sortOrder: "asc" as const } },
      section: true,
    },
  };

  const [products, globalAttrs, categoryAttrs, coreAttrDefs, allCategories] = await Promise.all([
    prisma.productRecord.findMany({
      where: { projectId: id, isArchived: false },
      include: {
        attributeValues: {
          include: { attributeDefinition: true },
        },
        category: true,
        createdBy: { select: { id: true, name: true, email: true, image: true, role: true } },
        updatedBy: { select: { id: true, name: true, email: true, image: true, role: true } },
      },
      orderBy: { rowIndex: "asc" },
    }),
    // Global EAV attrs (no category) — exclude keys already shown as typed columns
    prisma.attributeDefinition.findMany({
      where: {
        categoryId: null,
        isActive: true,
        key: { notIn: Array.from(CORE_COLUMN_KEYS) },
      },
      ...attrInclude,
      orderBy: { sortOrder: "asc" },
    }),
    // Category-specific attrs (if project has a category)
    project.categoryId
      ? prisma.attributeDefinition.findMany({
          where: { categoryId: project.categoryId, isActive: true },
          ...attrInclude,
          orderBy: { sortOrder: "asc" },
        })
      : Promise.resolve([]),
    // Core column attribute definitions (for LOV support + column ordering)
    prisma.attributeDefinition.findMany({
      where: { key: { in: Array.from(CORE_COLUMN_KEYS) }, isActive: true },
      ...attrInclude,
      orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

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
  const serialized = JSON.parse(JSON.stringify({ project, products: productsWithDupes, globalAttrs, categoryAttrs, coreAttrDefs, allCategories }));

  return (
    <ProjectDetailClient
      project={serialized.project}
      initialProducts={serialized.products}
      globalAttrs={serialized.globalAttrs}
      categoryAttrs={serialized.categoryAttrs}
      coreAttrDefs={serialized.coreAttrDefs}
      allCategories={serialized.allCategories}
      canEdit={canEdit}
      currentUserId={session.user.id}
      userRole={session.user.role as string}
    />
  );
}
