import type { UserRole, Project, ProjectMember } from "@prisma/client";

export const ROLE_WEIGHTS: Record<UserRole, number> = {
  ADMIN: 100,
  PRODUCT_MANAGER: 80,
  APPROVER: 60,
  REVIEWER: 40,
  CONTRIBUTOR: 30,
  VIEWER: 10,
};

export function canEditProject(
  userRole: UserRole,
  userId: string,
  project: Project & { members: ProjectMember[] }
): boolean {
  if (userRole === "ADMIN") return true;
  if (project.ownerId === userId) return true;
  const member = project.members.find((m) => m.userId === userId);
  return member?.canEdit ?? false;
}

export function canApproveProject(
  userRole: UserRole,
  userId: string,
  project: Project & { members: ProjectMember[] }
): boolean {
  if (userRole === "ADMIN") return true;
  if (userRole === "APPROVER") return true;
  const member = project.members.find((m) => m.userId === userId);
  return member?.canApprove ?? false;
}

export function canDeleteProject(userRole: UserRole, userId: string, ownerId: string): boolean {
  return userRole === "ADMIN" || userId === ownerId;
}

export function canManageUsers(userRole: UserRole): boolean {
  return userRole === "ADMIN";
}

export function canConfigureSystem(userRole: UserRole): boolean {
  return userRole === "ADMIN";
}
