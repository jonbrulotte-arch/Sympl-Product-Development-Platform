// Permanent delete of catalog products. The schema's cascades remove project
// links, attribute values, components, comments and compliance/inspection
// product links; ActivityLog.productId is SetNull, so history survives with
// the part number kept in the log entry's metadata.
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { deleteUploadFile, parseCommentAttachments } from "@/lib/uploads";

export const MAX_BULK_DELETE = 500;

/** What a delete would affect, for the confirmation dialog. */
export async function deletePreview(ids: string[]) {
  const products = await prisma.productRecord.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, partNumber: true, itemName: true,
      projects: { where: { isArchived: false }, select: { project: { select: { id: true, name: true } } } },
    },
  });
  return products.map((p) => ({
    id: p.id, partNumber: p.partNumber, itemName: p.itemName,
    projects: p.projects.map((l) => l.project),
  }));
}

export async function deleteProducts(userId: string, ids: string[]) {
  const preview = await deletePreview(ids);
  if (preview.length === 0) return { deleted: 0, projects: [] as { id: string; name: string }[] };
  const found = preview.map((p) => p.id);

  const comments = await prisma.comment.findMany({ where: { productId: { in: found } }, select: { content: true } });
  const attachmentPaths = [...new Set(comments.flatMap((c) => parseCommentAttachments(c.content)))];

  await prisma.productRecord.deleteMany({ where: { id: { in: found } } });

  // Files only after the rows are gone, so a failed delete never orphans data.
  await Promise.all(attachmentPaths.map((p) => deleteUploadFile(p).catch(() => false)));

  const projects = new Map<string, string>();
  for (const p of preview) {
    for (const pr of p.projects) projects.set(pr.id, pr.name);
    const meta = { partNumber: p.partNumber, itemName: p.itemName, projects: p.projects.map((x) => x.name) };
    // One platform-level entry (Event Log) plus one per project (project Activity).
    logActivity({
      userId, action: "DELETED", entityType: "ProductRecord", entityId: p.id,
      oldValue: p.partNumber ?? p.itemName ?? undefined, source: "Products", metadata: meta,
    }).catch(() => {});
    for (const pr of p.projects) {
      logActivity({
        userId, action: "DELETED", entityType: "ProductRecord", entityId: p.id, projectId: pr.id,
        oldValue: p.partNumber ?? p.itemName ?? undefined, source: "Products", metadata: meta,
      }).catch(() => {});
    }
  }
  if (projects.size > 0) {
    await prisma.project.updateMany({ where: { id: { in: [...projects.keys()] } }, data: { updatedAt: new Date() } }).catch(() => {});
  }

  return { deleted: found.length, projects: [...projects].map(([id, name]) => ({ id, name })) };
}
