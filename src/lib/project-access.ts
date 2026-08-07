import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

export type ProjectAccessLevel = "view" | "edit";

export type ProjectAccessResult =
  | { ok: true; isAdmin: boolean }
  | { ok: false; status: 401 | 403 | 404; error: string };

// Central authorization check for project-scoped resources.
//
// - ADMIN: full access to every project.
// - DIRECTOR: view of every project; edit only where owner or editing member.
// - Owner: view + edit.
// - Member: view; edit only when the membership has canEdit.
// - Everyone else: no access (404 on view to avoid leaking project existence,
//   403 on edit for users who can view but not modify).
export async function checkProjectAccess(
  projectId: string,
  session: Session | null,
  level: ProjectAccessLevel
): Promise<ProjectAccessResult> {
  if (!session?.user?.id) return { ok: false, status: 401, error: "Unauthorized" };
  if (session.user.role === "ADMIN") return { ok: true, isAdmin: true };

  const membership = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      members: { where: { userId: session.user.id }, select: { canEdit: true } },
    },
  });
  if (!membership) return { ok: false, status: 404, error: "Not found" };

  const isOwner = membership.ownerId === session.user.id;
  const member = membership.members[0];
  const isDirector = session.user.role === "DIRECTOR";

  // Directors can see every project, so a project they aren't on is 403 on
  // edit rather than 404 — its existence isn't a secret from them.
  if (!isOwner && !member) {
    if (!isDirector) return { ok: false, status: 404, error: "Not found" };
    if (level === "view") return { ok: true, isAdmin: false };
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (level === "view") return { ok: true, isAdmin: false };

  if (isOwner || member?.canEdit) return { ok: true, isAdmin: false };
  return { ok: false, status: 403, error: "Forbidden" };
}

// Roles allowed to create/modify/delete cross-project QA records
// (compliance events, PSIRs, and their documents). Reviewers, Approvers,
// and Viewers get read-only access.
const QA_MUTATION_ROLES = new Set(["ADMIN", "DIRECTOR", "PRODUCT_MANAGER", "CONTRIBUTOR"]);

export function canMutateQaRecords(role: string | null | undefined): boolean {
  return !!role && QA_MUTATION_ROLES.has(role);
}
