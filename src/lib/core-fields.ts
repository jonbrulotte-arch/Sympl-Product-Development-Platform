// Single source of truth for ProductRecord's typed "core" columns.
// Used by export, the import column-mapping UI, and the import route so the
// three stay in sync — previously each kept its own hardcoded list and drifted,
// silently dropping fields like inventoryStatusErp from the whole pipeline.

export type CoreFieldType = "string" | "decimal" | "int" | "boolean";

export const CORE_FIELDS: { key: string; label: string; type: CoreFieldType }[] = [
  { key: "partNumber", label: "Part Number", type: "string" },
  { key: "modelNumber", label: "Model Number", type: "string" },
  { key: "itemName", label: "Item Name", type: "string" },
  { key: "brand", label: "Brand", type: "string" },
  { key: "upc", label: "UPC", type: "string" },
  { key: "masterCartonGtin", label: "Master Carton GTIN-14", type: "string" },
  { key: "innerCartonGtin", label: "Inner Carton GTIN-14", type: "string" },
  { key: "palletGtin", label: "Pallet GTIN", type: "string" },
  { key: "altCartonGtin", label: "Alt Carton GTIN", type: "string" },

  { key: "inventoryStatus", label: "Inventory Status", type: "string" },
  { key: "inventoryStatusErp", label: "Inventory Status (ERP)", type: "string" },
  { key: "projectFolder", label: "Project Folder", type: "string" },
  { key: "wrikeUrl", label: "Wrike URL", type: "string" },

  { key: "warrantyInfo", label: "Warranty", type: "string" },
  { key: "needsProp65", label: "Needs Prop 65", type: "boolean" },
  { key: "htsCode", label: "HTS Code", type: "string" },
  { key: "htsCodeCanada", label: "HTS Code (Canada)", type: "string" },
  { key: "productComposition", label: "Product Composition", type: "string" },
  { key: "batteriesRequired", label: "Batteries Required", type: "string" },

  { key: "packagingType", label: "Packaging Type", type: "string" },
  { key: "packagingLangType", label: "Packaging Language Type", type: "string" },
  { key: "packSize", label: "Pack Size", type: "string" },
  { key: "numberOfPieces", label: "Number of Pieces", type: "int" },
  { key: "individualOrSet", label: "Individual/Set", type: "string" },
  { key: "material", label: "Material", type: "string" },
  { key: "size", label: "Size", type: "string" },
  { key: "jspCategory", label: "JSP Category", type: "string" },
  { key: "userManual", label: "User Manual", type: "string" },
  { key: "cutSheets", label: "Cut Sheets", type: "string" },

  { key: "upcHeight", label: "UPC Height (in)", type: "decimal" },
  { key: "upcWidth", label: "UPC Width (in)", type: "decimal" },
  { key: "upcLength", label: "UPC Length (in)", type: "decimal" },
  { key: "upcWeight", label: "UPC Weight (lbs)", type: "decimal" },

  { key: "itemHeight", label: "Item Height (in)", type: "decimal" },
  { key: "itemWidth", label: "Item Width (in)", type: "decimal" },
  { key: "itemLength", label: "Item Length (in)", type: "decimal" },
  { key: "itemWeight", label: "Item Weight (lbs)", type: "decimal" },

  { key: "innerCartonHeight", label: "Inner Carton Height (in)", type: "decimal" },
  { key: "innerCartonWidth", label: "Inner Carton Width (in)", type: "decimal" },
  { key: "innerCartonLength", label: "Inner Carton Length (in)", type: "decimal" },
  { key: "innerCartonWeight", label: "Inner Carton Weight (lbs)", type: "decimal" },
  { key: "innerCartonQty", label: "Inner Carton Qty", type: "int" },

  { key: "altCartonHeight", label: "Alt Carton Height (in)", type: "decimal" },
  { key: "altCartonWidth", label: "Alt Carton Width (in)", type: "decimal" },
  { key: "altCartonLength", label: "Alt Carton Length (in)", type: "decimal" },
  { key: "altCartonWeight", label: "Alt Carton Weight (lbs)", type: "decimal" },
  { key: "altCartonType", label: "Alt Carton Type", type: "string" },
  { key: "altCartonQty", label: "Alt Carton Qty", type: "int" },

  { key: "masterCartonHeight", label: "Master Carton Height (in)", type: "decimal" },
  { key: "masterCartonWidth", label: "Master Carton Width (in)", type: "decimal" },
  { key: "masterCartonLength", label: "Master Carton Length (in)", type: "decimal" },
  { key: "masterCartonWeight", label: "Master Carton Weight (lbs)", type: "decimal" },
  { key: "masterCartonQty", label: "Master Carton Qty", type: "int" },

  { key: "palletHeight", label: "Pallet Height (in)", type: "decimal" },
  { key: "palletWidth", label: "Pallet Width (in)", type: "decimal" },
  { key: "palletLength", label: "Pallet Length (in)", type: "decimal" },
  { key: "palletWeight", label: "Pallet Weight (lbs)", type: "decimal" },
  { key: "palletStackable", label: "Pallet Stackable", type: "boolean" },
  { key: "layersPerPallet", label: "Layers Per Pallet", type: "int" },
  { key: "palletQty", label: "Pallet Qty", type: "int" },
];

export const CORE_FIELD_KEYS = CORE_FIELDS.map((f) => f.key);

// Keys of product fields that were once core columns but have been fully
// removed from the schema. Excluded from global EAV attribute queries so a
// leftover definition row never renders as an empty "zombie" grid column
// before the admin-page cleanup purges it.
export const REMOVED_CORE_KEYS = ["psir"];

// Converts a raw spreadsheet cell string into the value Prisma expects for a
// given core field type. Returns undefined for blank cells or unparseable
// numbers so the caller can skip the field rather than write a bad value.
export function coerceCoreValue(type: CoreFieldType, raw: string): unknown {
  const trimmed = raw?.toString().trim() ?? "";
  if (trimmed === "") return undefined;
  switch (type) {
    case "decimal": {
      const n = parseFloat(trimmed.replace(/,/g, ""));
      return Number.isFinite(n) ? n : undefined;
    }
    case "int": {
      const n = parseInt(trimmed.replace(/,/g, ""), 10);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean": {
      const lower = trimmed.toLowerCase();
      return ["yes", "true", "1", "y"].includes(lower);
    }
    default:
      return trimmed;
  }
}
