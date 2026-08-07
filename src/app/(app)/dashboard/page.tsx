import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { formatDate } from "@/lib/utils";
import { FolderKanban, Package, Clock, CheckCircle2, AlertCircle, ShieldAlert, ExternalLink } from "lucide-react";
import { seesAllProjects } from "@/lib/permissions";

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
        _count: { select: { products: { where: { isArchived: false } } } },
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
        _count: { select: { products: { where: { isArchived: false } } } },
      },
      take: 5,
    }),
    prisma.activityLog.findMany({
      where: { userId },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        product: { select: { id: true, partNumber: true, itemName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    Promise.all([
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

  // Overdue compliance events on products in projects this user can see
  const isAdmin = seesAllProjects(session.user.role);
  const overdueCompliance = await prisma.complianceEvent.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      dueDate: { lt: new Date() },
      ...(!isAdmin
        ? {
            products: {
              some: {
                product: {
                  project: {
                    OR: [{ ownerId: userId }, { members: { some: { userId } } }],
                  },
                },
              },
            },
          }
        : {}),
    },
    include: {
      type: { select: { name: true, color: true } },
      _count: { select: { products: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 5,
  });

  // Overdue workflow stages on projects this user can see
  const overdueStages = await prisma.workflowStage.findMany({
    where: {
      status: { in: ["PENDING", "IN_REVIEW"] },
      dueDate: { lt: new Date() },
      ...(!isAdmin
        ? { project: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } }
        : {}),
    },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
    take: 5,
  });

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
        <div>
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
                      <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
                      <div className="mt-0.5"><ProjectStatusBadge status={project.status} /></div>
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

        {/* Pending Approval + Needs Attention */}
        <div className="space-y-6">
          {overdueCompliance.length > 0 && (
            <Card className="border-red-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-800 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" /> Overdue Compliance
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {overdueCompliance.map((ev) => (
                    <Link
                      key={ev.id}
                      href="/compliance"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-red-50"
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ev.type.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{ev.title}</p>
                        <p className="text-xs text-red-600">
                          Due {formatDate(ev.dueDate!)} · {ev._count.products} product{ev._count.products !== 1 ? "s" : ""} · {ev.severity}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {overdueStages.length > 0 && (
            <Card className="border-red-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-800 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Overdue Stages
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {overdueStages.map((stage) => (
                    <Link
                      key={stage.id}
                      href={`/projects/${stage.project.id}?tab=workflow`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-red-50"
                    >
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{stage.name}</p>
                        <p className="text-xs text-red-600">
                          {stage.project.name} · due {formatDate(stage.dueDate!)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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

          {pendingApprovalsData.length === 0 && needsReview.length === 0 && overdueCompliance.length === 0 && overdueStages.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-gray-400">
                Nothing needs your attention right now.
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Activity */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100">
                {recentActivity.length === 0 && (
                  <p className="px-4 py-4 text-sm text-gray-400">No recent activity.</p>
                )}
                {recentActivity.map((log) => {
                  const productLabel = log.product?.partNumber ?? log.product?.itemName ?? null;
                  const entityLabel =
                    log.entityType === "ProductRecord" ? "product" :
                    log.entityType === "WorkflowStage" ? "workflow stage" :
                    log.entityType === "Project" ? "project" :
                    log.entityType.toLowerCase();
                  const actionColor =
                    log.action === "DELETED" ? "bg-red-50 text-red-600" :
                    log.action === "CREATED" ? "bg-green-50 text-green-600" :
                    "bg-blue-50 text-blue-600";
                  const truncate = (v: string, n = 40) => v.length > n ? v.slice(0, n) + "…" : v;
                  return (
                    <div key={log.id} className="px-4 py-2.5 space-y-1">
                      <p className="text-xs text-gray-700">
                        <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded mr-1.5 ${actionColor}`}>
                          {log.action}
                        </span>
                        {entityLabel}
                        {log.fieldKey && <span className="text-gray-500"> · {log.fieldKey}</span>}
                        {log.source && (
                          <span className="ml-1.5 inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                            via {log.source}
                          </span>
                        )}
                      </p>
                      {log.project && (
                        <p className="text-xs text-gray-600">
                          <Link
                            href={`/projects/${log.project.id}`}
                            className="font-medium text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-0.5"
                          >
                            {log.project.name}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        </p>
                      )}
                      {productLabel && (
                        <p className="text-xs text-gray-600">
                          Product: <span className="font-medium text-gray-800">{productLabel}</span>
                        </p>
                      )}
                      {log.fieldKey && (log.oldValue != null || log.newValue != null) && (
                        <div className="flex items-center gap-1.5 text-xs flex-wrap">
                          {log.oldValue != null && (
                            <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded line-through">{truncate(log.oldValue)}</span>
                          )}
                          {log.oldValue != null && log.newValue != null && <span className="text-gray-500">→</span>}
                          {log.newValue != null && (
                            <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{truncate(log.newValue)}</span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-gray-500">{formatDate(log.createdAt)}</p>
                    </div>
                  );
                })}
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
