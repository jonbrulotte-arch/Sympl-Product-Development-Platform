import { prisma } from "@/lib/prisma";

// "Last activity" on a project means the most recent entry in its activity log
// — a product edit, a workflow vote, a comment, an import, a Salsify sync.
//
// Project.updatedAt is not a substitute: it only moves when a column on the
// Project row itself changes, so a project whose products are edited daily can
// sit there looking untouched for months.

/**
 * Newest ActivityLog timestamp per project, for the ids given.
 * Projects with no logged activity are absent from the map.
 */
export async function getLastActivityByProject(
  projectIds: string[],
): Promise<Map<string, Date>> {
  if (projectIds.length === 0) return new Map();

  const rows = await prisma.activityLog
    .groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds } },
      _max: { createdAt: true },
    })
    .catch(() => []);

  const map = new Map<string, Date>();
  for (const row of rows) {
    if (row.projectId && row._max.createdAt) map.set(row.projectId, row._max.createdAt);
  }
  return map;
}

/**
 * Attaches `lastActivityAt` to each project, falling back to the row's own
 * updatedAt so a brand-new project with no log entries still sorts sensibly
 * rather than reading as "never".
 */
export async function withLastActivity<T extends { id: string; updatedAt: Date }>(
  projects: T[],
): Promise<(T & { lastActivityAt: Date })[]> {
  const byProject = await getLastActivityByProject(projects.map((p) => p.id));
  return projects.map((p) => {
    const logged = byProject.get(p.id);
    return {
      ...p,
      lastActivityAt: logged && logged > p.updatedAt ? logged : p.updatedAt,
    };
  });
}
