import { prisma } from "@/lib/prisma";

export type DuplicateInfo = { productId: string; projectId: string; projectName: string };

// Looks up whether a Part Number is already used by a product in a DIFFERENT
// project, system-wide (deliberately ignores project membership/ownership —
// this is a data-integrity check, not an access check).
export async function findDuplicateForProduct(
  partNumber: string | null | undefined,
  projectId: string,
  excludeProductId?: string
): Promise<DuplicateInfo | null> {
  const trimmed = partNumber?.trim();
  if (!trimmed) return null;

  const match = await prisma.productRecord.findFirst({
    where: {
      partNumber: trimmed,
      isArchived: false,
      projectId: { not: projectId },
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
    select: { id: true, projectId: true, project: { select: { name: true } } },
  });
  if (!match) return null;
  return { productId: match.id, projectId: match.projectId, projectName: match.project.name };
}

// Bulk version for grid/browser pages showing many products at once — one
// query instead of N.
export async function findDuplicatesForProducts(
  products: { id: string; partNumber: string | null; projectId: string }[]
): Promise<Map<string, DuplicateInfo>> {
  const partNumbers = [...new Set(
    products.map((p) => p.partNumber?.trim()).filter((v): v is string => !!v)
  )];
  if (partNumbers.length === 0) return new Map();

  const allMatches = await prisma.productRecord.findMany({
    where: { partNumber: { in: partNumbers }, isArchived: false },
    select: { id: true, partNumber: true, projectId: true, project: { select: { name: true } } },
  });

  const byPartNumber = new Map<string, { productId: string; projectId: string; projectName: string }[]>();
  for (const m of allMatches) {
    if (!m.partNumber) continue;
    if (!byPartNumber.has(m.partNumber)) byPartNumber.set(m.partNumber, []);
    byPartNumber.get(m.partNumber)!.push({ productId: m.id, projectId: m.projectId, projectName: m.project.name });
  }

  const result = new Map<string, DuplicateInfo>();
  for (const p of products) {
    const trimmed = p.partNumber?.trim();
    if (!trimmed) continue;
    const other = (byPartNumber.get(trimmed) ?? []).find((o) => o.projectId !== p.projectId);
    if (other) result.set(p.id, other);
  }
  return result;
}
