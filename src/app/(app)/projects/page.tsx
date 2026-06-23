import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { formatDate, getInitials } from "@/lib/utils";
import { Package, Calendar, Users } from "lucide-react";

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
      owner: { select: { id: true, name: true, email: true, image: true, role: true } },
      category: true,
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        take: 3,
      },
      _count: { select: { products: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 text-sm">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        </div>
        <CreateProjectDialog />
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-1">No projects yet</h3>
          <p className="text-gray-400 text-sm mb-6">Create your first product development project to get started.</p>
          <CreateProjectDialog />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:shadow-md transition-shadow h-full cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-gray-900 leading-tight line-clamp-2">{project.name}</h3>
                    <ProjectStatusBadge status={project.status} />
                  </div>

                  {project.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{project.description}</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-auto">
                    {project.brand && (
                      <span className="font-medium text-gray-700">{project.brand}</span>
                    )}
                    {project.category && <span>{project.category.name}</span>}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Package className="h-3.5 w-3.5" />
                        {project._count.products} products
                      </span>
                      {project.targetLaunchDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(project.targetLaunchDate)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Owner avatar */}
                      <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium" title={project.owner.name ?? project.owner.email}>
                        {getInitials(project.owner.name)}
                      </div>
                      {project.members.slice(0, 2).map((m) => (
                        <div key={m.id} className="h-6 w-6 rounded-full bg-gray-100 text-gray-600 text-xs flex items-center justify-center font-medium -ml-1" title={m.user.name ?? m.user.email}>
                          {getInitials(m.user.name)}
                        </div>
                      ))}
                      {(project.members.length > 2) && (
                        <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center -ml-1">
                          +{project.members.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
