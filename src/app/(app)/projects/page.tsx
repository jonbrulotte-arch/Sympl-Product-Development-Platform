import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProjectsClient } from "./projects-client";

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  const projects = await prisma.project.findMany({
    where: {
      isArchived: false,
      ...(isAdmin ? {} : {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      }),
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      category: true,
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      _count: { select: { products: { where: { isArchived: false } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return <ProjectsClient initialProjects={projects} />;
}
