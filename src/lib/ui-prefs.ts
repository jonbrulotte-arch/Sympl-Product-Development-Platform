import { prisma } from "@/lib/prisma";

// Sticky UI choices that follow a user across devices — the kind of thing that
// would otherwise live in localStorage and reset on every new browser.

export type ProjectsView = "card" | "list";

export type UiPrefs = {
  projectsView?: ProjectsView;
};

const PROJECTS_VIEWS: ProjectsView[] = ["card", "list"];

/** Narrows an untrusted JSON blob to the keys we recognize. */
export function parseUiPrefs(raw: unknown): UiPrefs {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const prefs: UiPrefs = {};
  if (PROJECTS_VIEWS.includes(value.projectsView as ProjectsView)) {
    prefs.projectsView = value.projectsView as ProjectsView;
  }
  return prefs;
}

export async function getUiPrefs(userId: string): Promise<UiPrefs> {
  const row = await prisma.userPreferences
    .findUnique({ where: { userId }, select: { uiPrefs: true } })
    .catch(() => null);
  return parseUiPrefs(row?.uiPrefs);
}
