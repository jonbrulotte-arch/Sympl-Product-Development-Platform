import type { UserRole, Project, ProjectMember } from "@prisma/client";
import { prisma } from "./prisma";

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

// ─── Dynamic RBAC ─────────────────────────────────────────────────────────────

export const ROLES = [
  "ADMIN",
  "PRODUCT_MANAGER",
  "CONTRIBUTOR",
  "REVIEWER",
  "APPROVER",
  "VIEWER",
] as const;

export const PERMISSIONS = {
  "admin:users":              { label: "Manage Users",             description: "Create, edit, and deactivate user accounts" },
  "admin:categories":         { label: "Manage Categories",        description: "Create and edit product categories" },
  "admin:attributes":         { label: "Manage Attributes",        description: "Create and edit EAV attribute definitions" },
  "admin:workflow_templates": { label: "Manage Workflow Templates", description: "Create and edit reusable workflow templates" },
  "admin:compliance_types":   { label: "Manage Compliance Types",  description: "Create and edit compliance event types" },
  "admin:psir_attributes":    { label: "Manage Inspection Attributes",   description: "Create and edit inspection report attributes" },
  "admin:backup":             { label: "Backup & Restore",         description: "Run backups and restore from snapshots" },
  "admin:settings":           { label: "Global Settings",          description: "Manage Salsify and other integration settings" },
  "projects:create":          { label: "Create Projects",          description: "Create new product development projects" },
  "products:sync_salsify":    { label: "Sync to Salsify",          description: "Push product data to Salsify" },
  "projects:override_status": { label: "Override Project Status",  description: "Manually set project status from the Settings tab" },
} as const;

export type Permission = keyof typeof PERMISSIONS;

const PERMISSION_DEFAULTS: Record<string, Permission[]> = {
  ADMIN:           Object.keys(PERMISSIONS) as Permission[],
  PRODUCT_MANAGER: ["admin:categories", "admin:attributes", "projects:create", "products:sync_salsify", "projects:override_status"],
  CONTRIBUTOR:     [],
  REVIEWER:        [],
  APPROVER:        [],
  VIEWER:          [],
};

// Simple in-memory cache with 30 s TTL
let _cache: Map<string, boolean> | null = null;
let _cacheExpiry = 0;

async function loadCache(): Promise<Map<string, boolean>> {
  if (_cache && Date.now() < _cacheExpiry) return _cache;
  const rows = await prisma.rolePermission.findMany();
  const map = new Map<string, boolean>();
  for (const row of rows) map.set(`${row.role}:${row.permission}`, row.granted);
  _cache = map;
  _cacheExpiry = Date.now() + 30_000;
  return map;
}

export function invalidatePermissionCache() {
  _cache = null;
}

export async function can(role: string | null | undefined, permission: Permission): Promise<boolean> {
  if (!role) return false;
  const map = await loadCache();
  const key = `${role}:${permission}`;
  if (map.has(key)) return map.get(key)!;
  return PERMISSION_DEFAULTS[role]?.includes(permission) ?? false;
}

export async function getGrantedPermissions(role: string | null | undefined): Promise<Set<Permission>> {
  if (!role) return new Set();
  const granted = new Set<Permission>();
  for (const p of Object.keys(PERMISSIONS) as Permission[]) {
    if (await can(role, p)) granted.add(p);
  }
  return granted;
}

export async function getPermissionMatrix(): Promise<Record<string, Record<Permission, boolean>>> {
  const map = await loadCache();
  const matrix: Record<string, Record<Permission, boolean>> = {};
  for (const role of ROLES) {
    matrix[role] = {} as Record<Permission, boolean>;
    for (const p of Object.keys(PERMISSIONS) as Permission[]) {
      const key = `${role}:${p}`;
      matrix[role][p] = map.has(key) ? map.get(key)! : (PERMISSION_DEFAULTS[role]?.includes(p) ?? false);
    }
  }
  return matrix;
}
