import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProjectsClient } from "./projects-client";
import { seesAllProjects } from "@/lib/permissions";
import { getFilterableProjectStatuses } from "@/lib/project-statuses";
import { getUiPrefs } from "@/lib/ui-prefs";
import { withLastActivity } from "@/lib/project-activity";

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;
  const isAdmin = seesAllProjects(session.user.role);

  // Statuses and the saved view come from the server so the filter matches
  // Admin → Settings and the page renders in the user's chosen view without a
  // flash of the wrong one.
  const [projects, statuses, uiPrefs] = await Promise.all([
    prisma.project.findMany({
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
    }),
    getFilterableProjectStatuses(),
    getUiPrefs(userId),
  ]);

  return (
    <ProjectsClient
      initialProjects={await withLastActivity(projects)}
      statuses={statuses.map((s) => ({ code: s.code, label: s.label }))}
      initialView={uiPrefs.projectsView ?? "card"}
    />
  );
}
