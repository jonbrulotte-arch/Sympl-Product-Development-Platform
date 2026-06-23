import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { formatDate } from "@/lib/utils";
import { FolderKanban, Package, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const [myProjects, needsReview, recentActivity, stats, pendingApprovalsData] = await Promise.all([
    prisma.project.findMany({
      where: {
        isArchived: false,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        category: true,
        _count: { select: { products: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.project.findMany({
      where: {
        isArchived: false,
        status: { in: ["NEEDS_REVIEW", "CHANGES_REQUESTED"] },
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { products: true } },
      },
      take: 5,
    }),
    prisma.activityLog.findMany({
      where: { userId },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.$transaction([
      prisma.project.count({ where: { isArchived: false, OR: [{ ownerId: userId }, { members: { some: { userId } } }] } }),
      prisma.project.count({ where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }], status: "APPROVED" } }),
      prisma.project.count({ where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }], status: { in: ["NEEDS_REVIEW", "CHANGES_REQUESTED"] } } }),
      prisma.project.count({ where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }], status: "EXPORT_READY" } }),
    ]),
    prisma.workflowApproval.findMany({
      where: { approverId: userId, status: "PENDING" },
      include: {
        stage: {
          include: {
            project: { select: { id: true, name: true } },
          },
        },
      },
      take: 5,
    }),
  ]);

  const [totalProjects, approvedProjects, needsReviewCount, exportReadyCount] = stats;
  const needsActionCount = needsReviewCount + pendingApprovalsData.length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {session.user.name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Here&apos;s what&apos;s happening with your product development projects
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "My Projects", value: totalProjects, icon: FolderKanban, color: "text-blue-600 bg-blue-50" },
          { label: "Needs Action", value: needsActionCount, icon: AlertCircle, color: "text-yellow-600 bg-yellow-50" },
          { label: "Approved", value: approvedProjects, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
          { label: "Export Ready", value: exportReadyCount, icon: Package, color: "text-purple-600 bg-purple-50" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn("rounded-lg p-2", color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Projects */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>My Projects</CardTitle>
                <Link href="/projects" className="text-sm text-blue-600 hover:underline">
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100">
                {myProjects.length === 0 && (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    No projects yet. Create your first project to get started.
                  </div>
                )}
                {myProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
                        <ProjectStatusBadge status={project.status} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {project._count.products} products
                        {project.brand && ` · ${project.brand}`}
                        {project.category && ` · ${project.category.name}`}
                      </p>
                    </div>
                    <div className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDate(project.updatedAt)}
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Needs Review + Activity */}
        <div className="space-y-6">
          {pendingApprovalsData.length > 0 && (
            <Card className="border-yellow-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-yellow-800">Pending Your Approval</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {pendingApprovalsData.map((approval) => (
                    <Link
                      key={approval.id}
                      href={`/projects/${approval.stage.project.id}?tab=workflow`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-yellow-50"
                    >
                      <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{approval.stage.project.name}</p>
                        <p className="text-xs text-gray-500">{approval.stage.name}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {needsReview.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Needs Your Attention</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {needsReview.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                    >
                      <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
                        <ProjectStatusBadge status={project.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100">
                {recentActivity.length === 0 && (
                  <p className="px-4 py-4 text-sm text-gray-400">No recent activity.</p>
                )}
                {recentActivity.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                    <Clock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">{log.action.replace("_", " ")}</span>{" "}
                        {log.entityType}
                        {log.newValue && (
                          <span className="text-gray-500"> — {log.newValue.slice(0, 40)}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(log.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined | boolean)[]): string {
  return classes.filter(Boolean).join(" ");
}
