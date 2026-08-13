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
    case "boolean": {
      if (typeof value === "boolean") return value;
      const s = String(value).trim().toLowerCase();
      if (["true", "yes", "y", "1"].includes(s)) return true;
      if (["false", "no", "n", "0"].includes(s)) return false;
      return undefined;
    }
  }
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

/** Renders a value for the change report. Empty reads as an em dash. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** True when two values are the same as far as the change report cares. */
export function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) return v.map(String).join(" ");
    if (typeof v === "object") return JSON.stringify(v);
    // Numeric strings compare by value so "1.50" matches Decimal(1.5).
    const s = String(v).trim();
    const n = Number(s);
    return Number.isFinite(n) && s !== "" ? String(n) : s;
  };
  return norm(a) === norm(b);
}
