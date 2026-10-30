import type { CategoryRequest, CategoryRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, ROLES } from "@/lib/permissions";
import { createNotificationForMany } from "@/lib/notifications";
import { categoryRequestEmail } from "@/lib/email";
import { categoryPaths } from "@/lib/category-paths";

export const REQUEST_ATTR_TYPES = [
  "Text", "Long text", "Number", "Decimal", "Yes/No", "Date", "List", "Multi-select", "URL", "UPC / GTIN",
] as const;
export type RequestAttrType = (typeof REQUEST_ATTR_TYPES)[number];

export type RequestedAttribute = {
  name: string;
  type: RequestAttrType;
  required: boolean;
  values?: string;
  notes?: string;
};

export const STATUS_LABELS: Record<CategoryRequestStatus, string> = {
  PENDING: "Pending",
  NEEDS_INFO: "Needs Info",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
};

/** Statuses still waiting on a reviewer. */
export const OPEN_FOR_REVIEW: CategoryRequestStatus[] = ["PENDING"];
/** Statuses the requester may still edit. */
export const EDITABLE_BY_REQUESTER: CategoryRequestStatus[] = ["PENDING", "NEEDS_INFO"];

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseAttributes(input: unknown): { ok: true; rows: RequestedAttribute[] } | { ok: false; error: string } {
  if (input == null) return { ok: true, rows: [] };
  if (!Array.isArray(input)) return { ok: false, error: "attributes must be a list" };
  if (input.length > 100) return { ok: false, error: "At most 100 attributes per request" };
  const rows: RequestedAttribute[] = [];
  for (const [i, raw] of input.entries()) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const name = clip(r.name, 200);
    if (!name) {
      // Fully blank rows (an empty line left in the grid) are dropped silently.
      if (!clip(r.values, 1) && !clip(r.notes, 1)) continue;
      return { ok: false, error: `Attribute row ${i + 1} needs a name` };
    }
    const type = REQUEST_ATTR_TYPES.find((t) => t === r.type) ?? "Text";
    rows.push({
      name,
      type,
      required: r.required === true,
      values: clip(r.values, 2000) || undefined,
      notes: clip(r.notes, 2000) || undefined,
    });
  }
  return { ok: true, rows };
}

/** "Parent > Child" label for where the requested category would live. */
export async function parentPathFor(req: Pick<CategoryRequest, "parentCategoryId" | "newParentName">): Promise<string> {
  const parts: string[] = [];
  if (req.parentCategoryId) {
    const all = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
    const label = categoryPaths(all).find((p) => p.id === req.parentCategoryId)?.label;
    if (label) parts.push(label);
  }
  if (req.newParentName) parts.push(`${req.newParentName} (new)`);
  return parts.join(" > ");
}

/** A category with this name already under the chosen parent (case-insensitive)? */
export async function existingCategoryClash(name: string, parentCategoryId: string | null, newParentName: string | null) {
  if (newParentName) return null; // the parent itself is new, so nothing can sit under it yet
  return prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, parentId: parentCategoryId },
    select: { id: true, name: true },
  });
}

/** Active users whose role currently holds the review permission (follows Access Control). */
export async function reviewerIds(): Promise<string[]> {
  const roles: string[] = [];
  for (const role of ROLES) if (await can(role, "categories:review_requests")) roles.push(role);
  if (roles.length === 0) return [];
  const users = await prisma.user.findMany({ where: { isActive: true, role: { in: roles as never } }, select: { id: true } });
  return users.map((u) => u.id);
}

type RequestForMail = CategoryRequest & { requestedBy: { name: string | null; email: string } };

export async function notifyReviewers(req: RequestForMail, kind: "submitted" | "resubmitted", exclude?: string) {
  const ids = (await reviewerIds()).filter((id) => id !== exclude);
  const parentPath = await parentPathFor(req);
  const who = req.requestedBy.name ?? req.requestedBy.email;
  const title = kind === "submitted" ? `New category request: ${req.name}` : `Category request updated: ${req.name}`;
  const message = `${who} ${kind === "submitted" ? "requested" : "updated their request for"} the category "${parentPath ? `${parentPath} > ` : ""}${req.name}".`;
  const link = `/category-requests/${req.id}`;
  await createNotificationForMany(ids, {
    title,
    message,
    category: "CATEGORY_REQUEST",
    link,
    emailHtml: categoryRequestEmail({
      heading: title,
      intro: kind === "submitted" ? "A new category has been requested and is waiting for review." : "The requester has updated this request and resubmitted it for review.",
      name: req.name,
      parentPath,
      requester: who,
      note: req.note,
      attributes: (req.attributes as RequestedAttribute[]) ?? [],
      link,
    }),
  });
}

export async function notifyRequester(req: CategoryRequest, reviewerName: string) {
  const status = STATUS_LABELS[req.status];
  const title = `Category request ${status.toLowerCase()}: ${req.name}`;
  const message = `${reviewerName} marked your request for "${req.name}" as ${status}.${req.reviewNote ? ` Note: ${req.reviewNote}` : ""}`;
  await createNotificationForMany([req.requestedById], {
    title,
    message,
    type: req.status === "REJECTED" ? "warning" : req.status === "NEEDS_INFO" ? "info" : "success",
    category: "CATEGORY_REQUEST",
    link: `/category-requests/${req.id}`,
  });
}

export const REQUEST_INCLUDE = {
  requestedBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  parentCategory: { select: { id: true, name: true } },
  createdCategory: { select: { id: true, name: true } },
} as const;

export async function validateRequestBody(body: Record<string, unknown>) {
  const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const name = s(body.name, 200);
  if (!name) return { ok: false as const, error: "Category name is required" };
  const parentCategoryId = s(body.parentCategoryId, 100);
  const newParentName = s(body.newParentName, 200);
  if (parentCategoryId && !(await prisma.category.findUnique({ where: { id: parentCategoryId }, select: { id: true } }))) {
    return { ok: false as const, error: "Parent category not found" };
  }
  const clash = await existingCategoryClash(name, parentCategoryId, newParentName);
  if (clash) return { ok: false as const, status: 409, error: `"${clash.name}" already exists there` };
  const attrs = parseAttributes(body.attributes);
  if (!attrs.ok) return { ok: false as const, error: attrs.error };
  return {
    ok: true as const,
    data: {
      name,
      parentCategoryId,
      newParentName,
      description: s(body.description, 5000),
      note: s(body.note, 5000),
      exampleProducts: s(body.exampleProducts, 5000),
      attributes: attrs.rows,
    },
  };
}
