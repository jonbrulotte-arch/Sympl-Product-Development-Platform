import { prisma } from "@/lib/prisma";

// Returns a category's id plus all of its ancestor ids (parent, grandparent, …).
// Used so a project/product on a nested category inherits attributes scoped to
// any category above it in the tree, not just an exact match.
export async function getCategoryAndAncestorIds(categoryId: string | null | undefined): Promise<string[]> {
  return expandWithAncestors([categoryId]);
}

// Same as getCategoryAndAncestorIds but for many starting categories at once
// (e.g. a project's category plus each product's own category). Loads the
// category table once and walks parent chains in memory; cycle-guarded.
export async function expandWithAncestors(categoryIds: (string | null | undefined)[]): Promise<string[]> {
  const starts = [...new Set(categoryIds.filter((id): id is string => !!id))];
  if (starts.length === 0) return [];

  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const parentOf = new Map(all.map((c) => [c.id, c.parentId]));

  const result = new Set<string>();
  for (const start of starts) {
    let current: string | null | undefined = start;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      result.add(current);
      current = parentOf.get(current);
    }
  }
  return [...result];
}
