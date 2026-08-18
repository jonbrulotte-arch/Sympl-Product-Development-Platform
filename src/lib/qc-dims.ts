// Single source of truth for the QC Dims export sheet.
//
// The receiving system expects one exact layout: 39 columns, fixed order,
// styled header. The header itself lives in lib/templates/qc-dims-template.xlsx
// (see api/projects/[id]/export-qc-dims/route.ts); this file defines what goes
// underneath it and where each value comes from.
//
// Column order here IS the sheet's column order. Do not reorder.

export type QcDimsFormat = "text" | "number" | "auto";

export type QcDimsColumn = {
  /** Exact header text, matching the template's row 1 verbatim. */
  column: string;
  /**
   * "mappable" columns draw from whichever AttributeDefinition claims them.
   * "constant" columns always emit constantValue and are never offered for mapping.
   */
  kind: "mappable" | "constant";
  constantValue?: string;
  /**
   * Controls the emitted cell type:
   *  - "text"   forces a string cell. Mandatory for UPC/GTIN, whose leading
   *             zeros Excel silently eats if the value arrives as a number.
   *  - "number" emits a numeric cell so dimensions stay usable in formulas.
   *  - "auto"   numeric-looking values become numbers, everything else stays
   *             text — for identifiers that are usually but not always numeric.
   */
  format: QcDimsFormat;
  /** Attribute key pre-mapped by scripts/seed-qc-dims-mapping.ts. */
  defaultKey?: string;
  /** When this column resolves empty, fall back to the value of this column. */
  fallbackColumn?: string;
};

export const QC_DIMS_COLUMNS: QcDimsColumn[] = [
  { column: "JS Item Number", kind: "mappable", format: "auto", defaultKey: "partNumber" },
  // "Model Number ELSE Part Number" per the mapping rules.
  { column: "Customer Item Number", kind: "mappable", format: "text", defaultKey: "modelNumber", fallbackColumn: "JS Item Number" },
  { column: "Discontinued Item", kind: "constant", constantValue: "FALSE", format: "text" },
  { column: "Item Description", kind: "mappable", format: "text", defaultKey: "itemName" },
  { column: "Package Type", kind: "mappable", format: "text", defaultKey: "packagingType" },
  // Present but unmapped by default — kept mappable so it can be wired up later.
  { column: "Packaging Description", kind: "mappable", format: "text" },
  { column: "Item Length", kind: "mappable", format: "number", defaultKey: "itemLength" },
  { column: "Item Width", kind: "mappable", format: "number", defaultKey: "itemWidth" },
  { column: "Item Height", kind: "mappable", format: "number", defaultKey: "itemHeight" },
  { column: "Item Weight", kind: "mappable", format: "number", defaultKey: "itemWeight" },
  { column: "UPC", kind: "mappable", format: "text", defaultKey: "upc" },
  { column: "UPC Length", kind: "mappable", format: "number", defaultKey: "upcLength" },
  { column: "UPC Width", kind: "mappable", format: "number", defaultKey: "upcWidth" },
  { column: "UPC Height", kind: "mappable", format: "number", defaultKey: "upcHeight" },
  { column: "UPC Weight", kind: "mappable", format: "number", defaultKey: "upcWeight" },
  { column: "Shipping Package Type", kind: "mappable", format: "text" },
  { column: "Shipping Length", kind: "mappable", format: "number" },
  { column: "Shipping Width", kind: "mappable", format: "number" },
  { column: "Shipping Height", kind: "mappable", format: "number" },
  { column: "Shipping Weight", kind: "mappable", format: "number" },
  { column: "Master Carton Qty", kind: "mappable", format: "number", defaultKey: "masterCartonQty" },
  { column: "Master Carton GTIN-14", kind: "mappable", format: "text", defaultKey: "masterCartonGtin" },
  { column: "Master Carton Length", kind: "mappable", format: "number", defaultKey: "masterCartonLength" },
  { column: "Master Carton Width", kind: "mappable", format: "number", defaultKey: "masterCartonWidth" },
  { column: "Master Carton Height", kind: "mappable", format: "number", defaultKey: "masterCartonHeight" },
  { column: "Master Carton Weight", kind: "mappable", format: "number", defaultKey: "masterCartonWeight" },
  { column: "Inner Carton Qty", kind: "mappable", format: "number", defaultKey: "innerCartonQty" },
  { column: "Inner Carton GTIN", kind: "mappable", format: "text", defaultKey: "innerCartonGtin" },
  { column: "Inner Carton Length", kind: "mappable", format: "number", defaultKey: "innerCartonLength" },
  { column: "Inner Carton Width", kind: "mappable", format: "number", defaultKey: "innerCartonWidth" },
  { column: "Inner Carton Height", kind: "mappable", format: "number", defaultKey: "innerCartonHeight" },
  { column: "Inner Carton Weight", kind: "mappable", format: "number", defaultKey: "innerCartonWeight" },
  { column: "Pallet Quantity", kind: "mappable", format: "number", defaultKey: "palletQty" },
  { column: "Pallet GTIN", kind: "mappable", format: "text", defaultKey: "palletGtin" },
  { column: "Pallet Length", kind: "mappable", format: "number", defaultKey: "palletLength" },
  { column: "Pallet Width", kind: "mappable", format: "number", defaultKey: "palletWidth" },
  { column: "Pallet Height", kind: "mappable", format: "number", defaultKey: "palletHeight" },
  { column: "Pallet Weight", kind: "mappable", format: "number", defaultKey: "palletWeight" },
  { column: "No Inventory", kind: "constant", constantValue: "NULL", format: "text" },
];

/** Columns an attribute can be mapped to — drives the admin dropdown. */
export const QC_DIMS_MAPPABLE = QC_DIMS_COLUMNS.filter((c) => c.kind === "mappable");

const MAPPABLE_NAMES = new Set(QC_DIMS_MAPPABLE.map((c) => c.column));

/** Guards the API against a mapping value that isn't a real column. */
export function isQcDimsColumn(value: unknown): value is string {
  return typeof value === "string" && MAPPABLE_NAMES.has(value);
}

/** Seed pairs: [attribute key, QC column]. */
export const QC_DIMS_DEFAULT_MAPPINGS: [string, string][] = QC_DIMS_COLUMNS
  .filter((c) => c.defaultKey)
  .map((c) => [c.defaultKey!, c.column]);

// ─── Row building ────────────────────────────────────────────────────────────

export type QcDimsCell = string | number | null;

/**
 * Formats one resolved value for its column.
 *
 * Everything arrives as a string because that's how both core fields
 * (readCoreField) and EAV values (textValue) are stored. The column's format
 * decides what it becomes in the sheet.
 */
function formatCell(raw: string, format: QcDimsFormat): QcDimsCell {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (format === "text") return trimmed;

  // A value is only safe to emit as a number if it round-trips unchanged.
  // "099198568294" parses to 99198568294 — a different value — so it stays text.
  const asNumber = Number(trimmed);
  const roundTrips = Number.isFinite(asNumber) && String(asNumber) === trimmed;

  if (format === "number") return roundTrips ? asNumber : trimmed;
  return roundTrips ? asNumber : trimmed; // "auto"
}

/** A product reduced to "QC column name → raw string value". */
export type QcDimsSource = Record<string, string>;

/**
 * Turns per-product resolved values into the ordered cell array for one sheet row.
 * Applies constants and fallbacks, so the caller only has to supply what it read
 * from the database.
 */
export function buildQcDimsRow(source: QcDimsSource): QcDimsCell[] {
  // Fallbacks reference other columns by name, so resolve raw strings first and
  // format afterwards — otherwise a fallback would read an already-typed cell.
  const resolved: Record<string, string> = {};

  for (const col of QC_DIMS_COLUMNS) {
    if (col.kind === "constant") {
      resolved[col.column] = col.constantValue ?? "";
      continue;
    }
    resolved[col.column] = (source[col.column] ?? "").trim();
  }

  for (const col of QC_DIMS_COLUMNS) {
    if (col.fallbackColumn && !resolved[col.column]) {
      resolved[col.column] = resolved[col.fallbackColumn] ?? "";
    }
  }

  return QC_DIMS_COLUMNS.map((col) => formatCell(resolved[col.column], col.format));
}
