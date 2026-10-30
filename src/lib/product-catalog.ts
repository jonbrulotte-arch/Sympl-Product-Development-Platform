// Products are a master catalog; projects reference them through ProjectProduct.
import type { Session } from "next-auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

/** Prisma filter: products actively linked to a project. */
export const inProject = (projectId: string): Prisma.ProductRecordWhereInput => ({
  projects: { some: { projectId, isArchived: false } },
});

/** Select for a product's active project links (oldest first = "primary"). */
export const PROJECT_LINKS = {
  where: { isArchived: false },
  orderBy: { createdAt: "asc" as const },
  select: { projectId: true, rowIndex: true, project: { select: { id: true, name: true, status: true, brand: true, ownerId: true } } },
} satisfies Prisma.ProductRecord$projectsArgs;

export async function nextRowIndex(projectId: string, tx: Prisma.TransactionClient = prisma): Promise<number> {
  const max = await tx.projectProduct.aggregate({ where: { projectId }, _max: { rowIndex: true } });
  return (max._max.rowIndex ?? -1) + 1;
}

/** Ensures a product is active in a project; new or re-activated links go to the end of the grid. */
export async function linkProduct(projectId: string, productId: string, userId: string, tx: Prisma.TransactionClient = prisma) {
  const existing = await tx.projectProduct.findUnique({ where: { projectId_productId: { projectId, productId } } });
  if (existing && !existing.isArchived) return existing;
  const rowIndex = await nextRowIndex(projectId, tx);
  return tx.projectProduct.upsert({
    where: { projectId_productId: { projectId, productId } },
    update: { isArchived: false, rowIndex },
    create: { projectId, productId, rowIndex, addedById: userId },
  });
}

/** Trims a part number; blank becomes null so uniqueness only applies once set. */
export function normalizePartNumber(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

export type SharedProjectInfo = { productId: string; projectId: string; projectName: string };

/** For each product, another project it is also active in (excluding currentProjectId). */
export async function otherProjectsFor(productIds: string[], currentProjectId: string | null): Promise<Map<string, SharedProjectInfo>> {
  if (productIds.length === 0) return new Map();
  const links = await prisma.projectProduct.findMany({
    where: { productId: { in: productIds }, isArchived: false, ...(currentProjectId ? { projectId: { not: currentProjectId } } : {}) },
    select: { productId: true, projectId: true, project: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const out = new Map<string, SharedProjectInfo>();
  for (const l of links) if (!out.has(l.productId)) out.set(l.productId, { productId: l.productId, projectId: l.projectId, projectName: l.project.name });
  return out;
}

/**
 * Catalog-level edit right: the catalog permission, or edit access on any
 * project the product is linked to (owner, or member with canEdit). Admins always.
 */
export async function canEditProduct(session: Session | null, productId: string): Promise<boolean> {
  if (!session?.user?.id) return false;
  if (session.user.role === "ADMIN") return true;
  if (await can(session.user.role, "products:edit_catalog")) return true;
  const link = await prisma.projectProduct.findFirst({
    where: {
      productId,
      isArchived: false,
      project: { OR: [{ ownerId: session.user.id }, { members: { some: { userId: session.user.id, canEdit: true } } }] },
    },
    select: { id: true },
  });
  return !!link;
}

/** Project ids to attribute activity / notifications to. */
export async function projectIdsForProduct(productId: string): Promise<string[]> {
  const links = await prisma.projectProduct.findMany({ where: { productId, isArchived: false }, select: { projectId: true }, orderBy: { createdAt: "asc" } });
  return links.map((l) => l.projectId);
}

/** Orders products by their grid position in a project (then creation time). */
export async function sortByProjectRows<T extends { id: string; createdAt: Date }>(projectId: string, products: T[]): Promise<T[]> {
  const links = await prisma.projectProduct.findMany({ where: { projectId }, select: { productId: true, rowIndex: true } });
  const row = new Map(links.map((l) => [l.productId, l.rowIndex]));
  return [...products].sort((a, b) => (row.get(a.id) ?? 0) - (row.get(b.id) ?? 0) || a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Before a project is deleted: product comments carry projectId and would
 * cascade with it, but the products outlive the project, so detach them.
 */
export async function detachProductCommentsFromProjects(projectIds: string[]) {
  await prisma.comment.updateMany({ where: { projectId: { in: projectIds }, productId: { not: null } }, data: { projectId: null } });
}

export async function isLinked(projectId: string, productId: string): Promise<boolean> {
  const link = await prisma.projectProduct.findUnique({ where: { projectId_productId: { projectId, productId } }, select: { isArchived: true } });
  return !!link && !link.isArchived;
}

/** Nested select for a product's primary (oldest active) project, as `projects[0].project`. */
export function primaryProject<S extends Prisma.ProjectSelect>(select: S) {
  return { where: { isArchived: false }, orderBy: { createdAt: "asc" as const }, take: 1, select: { project: { select } } };
}

/** Nested select for all of a product's active project ids. */
export const ACTIVE_PROJECT_IDS = { where: { isArchived: false }, select: { projectId: true } } as const;

/**
 * Walks an API payload and gives every product carrying `projects: [{ project }]`
 * a `project` field (its primary project, or null), for clients that display one.
 * `projects` is kept for clients that list every project.
 */
export function withPrimaryProject<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) o[k] = walk(val);
      const links = o.projects;
      if (Array.isArray(links) && (links.length === 0 || (links[0] && typeof links[0] === "object" && "project" in links[0]))) {
        o.project = links.length ? (links[0] as { project: unknown }).project : null;
      }
      return o;
    }
    return v;
  };
  return walk(value) as T;
}

/** A product's active project links, primary first. */
export function projectLinksOf(productId: string) {
  return prisma.projectProduct.findMany({
    where: { productId, isArchived: false },
    orderBy: { createdAt: "asc" },
    select: PROJECT_LINKS.select,
  });
}
