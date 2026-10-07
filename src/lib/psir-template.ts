// Pure helpers shared by the PSIR Generator client and server. No Prisma here.

export type PsirSheetKey = "PSIR_DATA" | "PRODUCT_MEASUREMENTS" | "FUNCTIONAL_INSPECTIONS";

export const PSIR_SHEETS: { key: PsirSheetKey; label: string; nameLabel: string; requirementLabel: string; findingsLabel: string }[] = [
  { key: "PSIR_DATA", label: "PSIR Data", nameLabel: "Inspection Category", requirementLabel: "Requirements", findingsLabel: "Actual Findings" },
  { key: "PRODUCT_MEASUREMENTS", label: "Product Measurements", nameLabel: "Dimensional Inspection", requirementLabel: "Required", findingsLabel: "Actual (method)" },
  { key: "FUNCTIONAL_INSPECTIONS", label: "Functional Inspections", nameLabel: "Testing Performed", requirementLabel: "Required", findingsLabel: "Actual (method)" },
];

export const OVERRIDABLE_FIELDS = ["requirement", "actualFindings", "samplingLevel", "aql"] as const;
export type OverridableField = (typeof OVERRIDABLE_FIELDS)[number];

export type PsirOverride = {
  hidden: boolean | null;
  requirement: string | null;
  actualFindings: string | null;
  samplingLevel: string | null;
  aql: string | null;
};

export type ResolvedPsirLine = {
  id: string;
  sheet: PsirSheetKey;
  sectionId: string | null;
  sectionName: string | null;
  sectionSort: number;
  name: string;
  requirement: string | null;
  actualFindings: string | null;
  samplingLevel: string | null;
  aql: string | null;
  sortOrder: number;
  hidden: boolean;
  /** null = Global line */
  originCategoryId: string | null;
  originName: string;
  /** Fields whose value came from an override somewhere in the chain. */
  overriddenFields: OverridableField[];
  /** The override row owned by the category being viewed, if any. */
  ownOverride: PsirOverride | null;
};

const TOKEN_RE = /\{([^{}\n]{1,80})\}/g;

export function extractTokens(texts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(TOKEN_RE)) seen.add(m[1].trim());
  }
  return [...seen];
}

/** Unfilled tokens stay as `{Token}` so blanks are obvious in the export. */
export function applyTokens(text: string | null | undefined, values: Record<string, string>): string {
  if (!text) return "";
  return text.replace(TOKEN_RE, (raw, name: string) => {
    const v = values[name.trim()];
    return v && v.trim() ? v.trim() : raw;
  });
}

export type NumberedSection = {
  number: string;
  name: string;
  lines: (ResolvedPsirLine & { number: string })[];
};

/** Groups visible PSIR Data lines by section and numbers them 1, 1.1, 1.2 … as text. */
export function numberPsirDataLines(lines: ResolvedPsirLine[]): NumberedSection[] {
  const groups = new Map<string, { name: string; sort: number; lines: ResolvedPsirLine[] }>();
  for (const l of lines) {
    if (l.hidden || l.sheet !== "PSIR_DATA") continue;
    const key = l.sectionId ?? "__none__";
    if (!groups.has(key)) groups.set(key, { name: l.sectionName ?? "Other", sort: l.sectionId ? l.sectionSort : Number.MAX_SAFE_INTEGER, lines: [] });
    groups.get(key)!.lines.push(l);
  }
  return [...groups.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((g, i) => ({
      number: String(i + 1),
      name: g.name,
      lines: g.lines.map((l, j) => ({ ...l, number: `${i + 1}.${j + 1}` })),
    }));
}
