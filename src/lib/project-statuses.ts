import { prisma } from "@/lib/prisma";
import type { ProjectStatus } from "@prisma/client";

// One source of truth for the project status list. Admin → Settings can
// relabel, recolour, reorder, and deactivate these, so anything showing a
// status list to a user reads from here rather than hardcoding its own copy —
// the Projects filter used to, and had drifted to a set of codes that don't
// exist in the schema at all.

export type ProjectStatusOption = {
  code: string;
  label: string;
  color: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  /** True when the code is a real ProjectStatus a project can actually hold. */
  assignable: boolean;
};

export const PROJECT_STATUS_DEFAULTS = [
  { code: "DRAFT",              label: "Draft",             color: "gray",   sortOrder: 0, description: "Initial state — work in progress" },
  { code: "IN_PROGRESS",        label: "In Progress",       color: "blue",   sortOrder: 1, description: "Actively being worked on" },
  { code: "NEEDS_REVIEW",       label: "Needs Review",      color: "yellow", sortOrder: 2, description: "Ready for stakeholder review" },
  { code: "CHANGES_REQUESTED",  label: "Changes Requested", color: "orange", sortOrder: 3, description: "Reviewer requested revisions" },
  { code: "APPROVED",           label: "Approved",          color: "green",  sortOrder: 4, description: "All approvals obtained" },
  { code: "EXPORT_READY",       label: "Export Ready",      color: "purple", sortOrder: 5, description: "Data verified and ready for export" },
  { code: "ARCHIVED",           label: "Archived",          color: "gray",   sortOrder: 6, description: "Hidden from active projects list" },
];

// Project.status is a Prisma enum, so only these codes can ever be stored on a
// project. A custom status configured in the admin can be listed there, but a
// filter on it would match nothing — hence the `assignable` flag.
export const ASSIGNABLE_STATUS_CODES: ReadonlySet<string> = new Set(
  PROJECT_STATUS_DEFAULTS.map((d) => d.code),
);

export function isAssignableStatus(code: string): code is ProjectStatus {
  return ASSIGNABLE_STATUS_CODES.has(code);
}

/**
 * The configured statuses, merged over the built-in defaults so every built-in
 * always appears even before an admin has saved any overrides.
 */
export async function getProjectStatuses(): Promise<ProjectStatusOption[]> {
  let configs: {
    code: string; label: string; color: string; description: string | null;
    sortOrder: number; isActive: boolean;
  }[] = [];
  try {
    configs = await prisma.projectStatusConfig.findMany({ orderBy: { sortOrder: "asc" } });
  } catch {
    // Table may not exist yet — fall through to the defaults.
  }

  const byCode = new Map(configs.map((c) => [c.code, c]));
  const merged: ProjectStatusOption[] = PROJECT_STATUS_DEFAULTS.map((d) => {
    const c = byCode.get(d.code);
    return {
      code: d.code,
      label: c?.label ?? d.label,
      color: c?.color ?? d.color,
      description: c?.description ?? d.description,
      sortOrder: c?.sortOrder ?? d.sortOrder,
      isActive: c?.isActive ?? true,
      assignable: true,
    };
  });

  const extras: ProjectStatusOption[] = configs
    .filter((c) => !ASSIGNABLE_STATUS_CODES.has(c.code))
    .map((c) => ({ ...c, assignable: false }));

  return [...merged, ...extras].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Statuses worth offering as a filter: active, and actually storable. */
export async function getFilterableProjectStatuses(): Promise<ProjectStatusOption[]> {
  return (await getProjectStatuses()).filter((s) => s.isActive && s.assignable);
}
