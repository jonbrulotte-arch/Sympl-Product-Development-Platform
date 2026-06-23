import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ProjectDetailClient } from "./project-detail-client";
import { canEditProject } from "@/lib/permissions";

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
    orderBy: { rowIndex: "asc" },
  });

  const canEdit = canEditProject(
    session.user.role as never,
    session.user.id,
    project
  );

  return (
    <ProjectDetailClient
      project={project as never}
      initialProducts={products as never}
      canEdit={canEdit}
      currentUserId={session.user.id}
    />
  );
}
