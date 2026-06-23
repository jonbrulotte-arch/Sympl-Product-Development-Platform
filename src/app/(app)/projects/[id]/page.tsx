import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ProjectDetailClient } from "./project-detail-client";
import { canEditProject } from "@/lib/permissions";

// Keys already rendered as typed columns in the grid — exclude from EAV query
const CORE_COLUMN_KEYS = new Set([
  "partNumber", "modelNumber", "itemName", "brand", "upc",
  "inventoryStatus", "warrantyInfo", "htsCode", "packSize",
  "numberOfPieces", "material", "size",
  "upcHeight", "upcWidth", "upcLength", "upcWeight",
  "masterCartonGtin", "masterCartonHeight", "masterCartonWidth",
  "masterCartonLength", "masterCartonWeight", "masterCartonQty",
  "palletGtin", "palletQty",
]);

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
        },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { products: true } },
    },
  });

  if (!project) notFound();

  const attrInclude = {
    include: { lovItems: { orderBy: { sortOrder: "asc" as const } } },
  };

  const [products, globalAttrs, categoryAttrs] = await Promise.all([
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
  ]);

  const canEdit = canEditProject(
    session.user.role as never,
    session.user.id,
    project
  );

  return (
    <ProjectDetailClient
      project={project as never}
      initialProducts={products as never}
      globalAttrs={globalAttrs as never}
      categoryAttrs={categoryAttrs as never}
      canEdit={canEdit}
      currentUserId={session.user.id}
    />
  );
}
