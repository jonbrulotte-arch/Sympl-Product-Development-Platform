import { CORE_FIELDS, type CoreFieldType } from "@/lib/core-fields";
import type { ProductRecord } from "@prisma/client";

// Salsify-specific glue over the canonical core-field list. Both directions of
// the bridge live here so the push (salsify-sync) and pull (salsify-pull)
// routes can't drift apart on how a column is read or written.
//
// core-fields owns *which* columns exist and what type they are; this module
// owns how a Salsify payload maps onto them.

const CORE_TYPE_BY_KEY = new Map<string, CoreFieldType>(
  CORE_FIELDS.map((f) => [f.key, f.type]),
);

export function isCoreField(key: string): boolean {
  return CORE_TYPE_BY_KEY.has(key);
}

/** The declared type of a core column, for error messages. */
export function coreFieldType(key: string): CoreFieldType | undefined {
  return CORE_TYPE_BY_KEY.get(key);
}

/** Reads a core field off a product row. Returns null for empty/unset. */
export function readCoreField(product: ProductRecord, key: string): unknown {
  if (!isCoreField(key)) return undefined;
  const raw = (product as unknown as Record<string, unknown>)[key];
  if (raw === undefined || raw === "") return null;
  return raw ?? null;
}

/**
 * Coerces a value pulled from Salsify into the shape the column expects.
 * Returns `undefined` when the value can't be represented — the caller should
 * treat that as "leave this field alone" rather than writing a null.
 *
 * This is deliberately not core-fields' own coerceCoreValue: that one takes a
 * spreadsheet cell (always a string, blank means "skip"), whereas Salsify
 * hands back real JSON where an explicit null means "clear this".
 */
export function coerceSalsifyValue(key: string, value: unknown): unknown {
  const type = CORE_TYPE_BY_KEY.get(key);
  if (!type) return undefined;

  // Salsify returns multi-valued properties as arrays; a core column holds one
  // value, so join text and take the first of anything else.
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (type === "string") return value.map((v) => String(v)).join("\n");
    value = value[0];
  }

  if (value === null || value === undefined || value === "") return null;

  switch (type) {
    case "string":
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    case "decimal": {
      const n = Number(String(value).replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : undefined;
    }
    case "int": {
      const n = parseInt(String(value).replace(/,/g, "").trim(), 10);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      return toBoolean(value);
  }
}

/**
 * Parses the many shapes Salsify uses for a yes/no property — real booleans,
 * "Yes"/"No", "true"/"false", 1/0 — into a boolean. Returns `undefined` when
 * the value isn't recognizably boolean, which callers treat as "leave alone".
 */
export function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return undefined;
}

/**
 * Unwraps whatever Salsify returned for a property into a plain value.
 * Localizable properties arrive as `{ "en-US": … }`, so the locale the
 * attribute is configured for has to be peeled off first.
 */
export function unwrapSalsifyValue(raw: unknown, locale: string | null): unknown {
  if (raw === null || raw === undefined) return null;
  if (locale && typeof raw === "object" && !Array.isArray(raw)) {
    const map = raw as Record<string, unknown>;
    // Fall back to the sole entry when the configured locale isn't present —
    // a single-locale org often returns a different tag than it accepts.
    if (locale in map) return map[locale];
    const values = Object.values(map);
    return values.length === 1 ? values[0] : null;
  }
  return raw;
}

/**
 * Reduces a DB value to something comparable and printable.
 *
 * Prisma hands back `Decimal` for every numeric column, and `Decimal` is an
 * object — so without this, JSON.stringify renders it as a quoted `"72"` and
 * it never compares equal to the plain `72` Salsify returns, making every
 * decimal column a guaranteed false positive in the change report.
 */
function unwrapScalar(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (typeof (value as { toNumber?: unknown }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Renders a value for the change report. Empty reads as an em dash. */
export function displayValue(value: unknown): string {
  const v = unwrapScalar(value);
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.map((x) => displayValue(x)).join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ─── Outbound payload ───────────────────────────────────────────────────────

export type SyncableProduct = ProductRecord & {
  attributeValues: {
    attributeDefinitionId: string;
    valueIndex: number;
    textValue: string | null;
    numberValue: unknown;
    booleanValue: boolean | null;
  }[];
};

export type SyncableAttribute = {
  id: string;
  key: string;
  salsifyPropertyId: string | null;
  salsifyLocale: string | null;
  categoryId: string | null;
  attributeType: string;
  maxValues: number;
};

/**
 * Builds the flat JSON body Salsify's v1 API expects for one product.
 *
 * Returns the payload *and* the per-attribute values that went into it, so a
 * dry run can diff exactly what a real push would send — a preview built from
 * separate logic would eventually drift from the push and lie to the user.
 *
 * Empty values are sent as null rather than omitted: Salsify clears a property
 * when it receives null, so blanking a field in Sympl clears it there too.
 */
export function buildSalsifyPayload(
  product: SyncableProduct,
  attrs: SyncableAttribute[],
  applicableCategories: Set<string>,
): { payload: Record<string, unknown>; values: Map<string, unknown> } {
  const salsifyId = product.partNumber ?? product.id;
  const payload: Record<string, unknown> = { "salsify:id": salsifyId };
  const values = new Map<string, unknown>();

  for (const attr of attrs) {
    if (!attr.salsifyPropertyId) continue;
    // An attribute tied to a category only applies to products in that
    // category or a descendant. Since blank values clear Salsify data,
    // sending another category's attributes would wipe them.
    if (attr.categoryId && !applicableCategories.has(attr.categoryId)) continue;

    let rawValue: unknown;
    if (isCoreField(attr.key)) {
      rawValue = readCoreField(product, attr.key);
      if (rawValue === undefined || rawValue === "") rawValue = null;
      if (
        typeof rawValue === "string" && rawValue.includes("\n") &&
        (attr.attributeType === "MULTI_SELECT" || attr.maxValues > 1)
      ) {
        rawValue = rawValue.split("\n").map((s) => s.trim()).filter(Boolean);
      }
    } else {
      const vals = product.attributeValues
        .filter((v) => v.attributeDefinitionId === attr.id)
        .sort((a, b) => a.valueIndex - b.valueIndex)
        .map((v) => v.textValue ?? v.numberValue ?? v.booleanValue)
        .filter((v) => v !== null && v !== undefined && v !== "");
      rawValue = vals.length === 0 ? null : vals.length > 1 ? vals : vals[0];
    }

    values.set(attr.key, rawValue);
    // Salsify localizable properties expect a map keyed by locale,
    // e.g. { "en-US": "value" } or { "en-US": ["v1","v2"] }.
    payload[attr.salsifyPropertyId] = attr.salsifyLocale
      ? { [attr.salsifyLocale]: rawValue }
      : rawValue;
  }

  return { payload, values };
}

/** The category chain a product belongs to, for scoping category-bound attributes. */
export function categoryAncestry(
  start: string | null | undefined,
  parentOf: Map<string, string | null>,
): Set<string> {
  const set = new Set<string>();
  let current: string | null | undefined = start;
  while (current && !set.has(current)) {
    set.add(current);
    current = parentOf.get(current);
  }
  return set;
}

/** True when two values are the same as far as the change report cares. */
export function sameValue(a: unknown, b: unknown): boolean {
  const norm = (raw: unknown): string => {
    const v = unwrapScalar(raw);
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) return v.map((x) => norm(x)).join(" ");
    if (typeof v === "object") return JSON.stringify(v);
    // Numeric strings compare by value so "72.00" matches Decimal(72).
    const s = String(v).trim();
    const n = Number(s);
    return Number.isFinite(n) && s !== "" ? String(n) : s;
  };
  return norm(a) === norm(b);
}
