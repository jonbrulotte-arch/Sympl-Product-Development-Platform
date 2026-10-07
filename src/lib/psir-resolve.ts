import { prisma } from "@/lib/prisma";
import {
  OVERRIDABLE_FIELDS,
  type OverridableField,
  type PsirOverride,
  type ResolvedPsirLine,
} from "@/lib/psir-template";

export type CategoryLink = { id: string; name: string };

/** Root-first ancestor chain ending at categoryId. */
export async function categoryChain(categoryId: string): Promise<CategoryLink[]> {
  const chain: CategoryLink[] = [];
  const seen = new Set<string>();
  let id: string | null = categoryId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const cat: { id: string; name: string; parentId: string | null } | null =
      await prisma.category.findUnique({ where: { id }, select: { id: true, name: true, parentId: true } });
    if (!cat) break;
    chain.unshift({ id: cat.id, name: cat.name });
    id = cat.parentId;
  }
  return chain;
}

/**
 * Global lines + lines added by each category in the chain, with overrides
 * applied root→leaf so the most specific non-null value wins per field.
 * Pass categoryId = null for the Global view.
 */
export async function resolvePsirLines(categoryId: string | null): Promise<{ chain: CategoryLink[]; lines: ResolvedPsirLine[] }> {
  const chain = categoryId ? await categoryChain(categoryId) : [];
  const chainIds = chain.map((c) => c.id);
  const depth = new Map(chainIds.map((id, i) => [id, i]));
  const nameById = new Map(chain.map((c) => [c.id, c.name]));

  const rows = await prisma.psirTemplateLine.findMany({
    where: {
      isActive: true,
      OR: [{ categoryId: null }, { categoryId: { in: chainIds } }],
    },
    include: {
      section: true,
      overrides: { where: { categoryId: { in: chainIds } } },
    },
  });

  const leafId = chainIds[chainIds.length - 1] ?? null;

  const lines: ResolvedPsirLine[] = rows
    .filter((r) => !r.section || r.section.isActive)
    .map((r) => {
      const eff: Record<OverridableField, string | null> = {
        requirement: r.requirement,
        actualFindings: r.actualFindings,
        samplingLevel: r.samplingLevel,
        aql: r.aql,
      };
      let hidden = false;
      const overridden = new Set<OverridableField>();
      let ownOverride: PsirOverride | null = null;
      const ordered = [...r.overrides].sort((a, b) => (depth.get(a.categoryId) ?? 0) - (depth.get(b.categoryId) ?? 0));
      for (const o of ordered) {
        for (const f of OVERRIDABLE_FIELDS) {
          if (o[f] !== null) { eff[f] = o[f]; overridden.add(f); }
        }
        if (o.hidden !== null) hidden = o.hidden;
        if (o.categoryId === leafId) {
          ownOverride = { hidden: o.hidden, requirement: o.requirement, actualFindings: o.actualFindings, samplingLevel: o.samplingLevel, aql: o.aql };
        }
      }
      return {
        id: r.id,
        sheet: r.sheet,
        sectionId: r.sectionId,
        sectionName: r.section?.name ?? null,
        sectionSort: r.section?.sortOrder ?? 0,
        name: r.name,
        ...eff,
        sortOrder: r.sortOrder,
        hidden,
        originCategoryId: r.categoryId,
        originName: r.categoryId ? nameById.get(r.categoryId) ?? "Category" : "Global",
        overriddenFields: [...overridden],
        ownOverride,
      };
    });

  lines.sort((a, b) =>
    a.sheet.localeCompare(b.sheet) ||
    a.sectionSort - b.sectionSort ||
    a.sortOrder - b.sortOrder ||
    (a.originCategoryId ? (depth.get(a.originCategoryId) ?? 0) + 1 : 0) - (b.originCategoryId ? (depth.get(b.originCategoryId) ?? 0) + 1 : 0) ||
    a.name.localeCompare(b.name),
  );

  return { chain, lines };
}
