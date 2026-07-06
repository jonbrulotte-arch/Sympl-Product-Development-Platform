import { prisma } from "@/lib/prisma";

// Returns a category's id plus all of its ancestor ids (parent, grandparent, …).
// Used so a project/product on a nested category inherits attributes scoped to
// any category above it in the tree, not just an exact match. Guards against
// cycles with a visited set.
export async function getCategoryAndAncestorIds(categoryId: string | null | undefined): Promise<string[]> {
  if (!categoryId) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  let current: string | null = categoryId;

  while (current && !seen.has(current)) {
    seen.add(current);
    ids.push(current);
    const cat: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = cat?.parentId ?? null;
  }
  return ids;
}
