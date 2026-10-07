export type CategoryOption = { id: string; name: string; parentId: string | null };

/** Depth-first list with "Parent > Child" labels, for scope/category pickers. */
export function categoryPaths(categories: CategoryOption[]): { id: string; label: string; depth: number }[] {
  const byParent = new Map<string | null, CategoryOption[]>();
  const ids = new Set(categories.map((c) => c.id));
  for (const c of categories) {
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (parent: string | null, prefix: string, depth: number, seen: Set<string>) => {
    for (const c of byParent.get(parent) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const label = prefix ? `${prefix} > ${c.name}` : c.name;
      out.push({ id: c.id, label, depth });
      walk(c.id, label, depth + 1, seen);
    }
  };
  walk(null, "", 0, new Set());
  return out;
}
