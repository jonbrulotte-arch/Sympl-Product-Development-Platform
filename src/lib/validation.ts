import { z } from "zod";

// Coerce string inputs from grid cells to numbers; empty string → undefined
const optNum = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().optional()
);
const optInt = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Math.round(Number(v))),
  z.number().int().optional()
);

export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  description: z.string().optional(),
  brand: z.string().optional(),
  categoryId: z.string().optional(),
  productFamilyName: z.string().optional(),
  targetLaunchDate: z.string().optional(),
  retailer: z.string().optional(),
  channel: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  status: z.enum(["DRAFT","IN_PROGRESS","NEEDS_REVIEW","CHANGES_REQUESTED","APPROVED","EXPORT_READY","ARCHIVED"]).optional(),
});

export const productSchema = z.object({
  partNumber: z.string().optional(),
  modelNumber: z.string().optional(),
  itemName: z.string().optional(),
  brand: z.string().optional(),
  upc: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{8,14}$/.test(v),
      "UPC must be 8–14 digits"
    ),
  categoryId: z.string().optional(),
  inventoryStatus: z.string().optional(),
  warrantyInfo: z.string().optional(),
  countryOfOrigin: z.string().optional(),
  htsCode: z.string().optional(),
  htsCodeCanada: z.string().optional(),
  productComposition: z.string().optional(),
  needsProp65: z.boolean().optional(),
  packagingType: z.string().optional(),
  packSize: z.string().optional(),
  numberOfPieces: optInt,
  individualOrSet: z.string().optional(),
  material: z.string().optional(),
  size: z.string().optional(),
  jspCategory: z.string().optional(),
  // Dimension fields — coerce strings from grid inputs
  upcHeight: optNum,
  upcWidth: optNum,
  upcLength: optNum,
  upcWeight: optNum,
  itemHeight: optNum,
  itemWidth: optNum,
  itemLength: optNum,
  itemWeight: optNum,
  innerCartonHeight: optNum,
  innerCartonWidth: optNum,
  innerCartonLength: optNum,
  innerCartonWeight: optNum,
  innerCartonQty: optInt,
  masterCartonGtin: z.string().optional(),
  masterCartonHeight: optNum,
  masterCartonWidth: optNum,
  masterCartonLength: optNum,
  masterCartonWeight: optNum,
  masterCartonQty: optInt,
  palletGtin: z.string().optional(),
  palletHeight: optNum,
  palletWidth: optNum,
  palletLength: optNum,
  palletWeight: optNum,
  palletStackable: z.boolean().optional(),
  layersPerPallet: optInt,
  palletQty: optInt,
});

export type ProjectInput = z.infer<typeof projectSchema>;
export type ProductInput = z.infer<typeof productSchema>;

// Business rule validation
export function validateProductRecord(data: Record<string, unknown>): {
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
} {
  const errors: { field: string; message: string }[] = [];
  const warnings: { field: string; message: string }[] = [];

  if (!data.partNumber) {
    errors.push({ field: "partNumber", message: "Part Number is required" });
  }

  if (data.upc && !/^\d{8,14}$/.test(String(data.upc))) {
    errors.push({ field: "upc", message: "UPC must be 8–14 digits" });
  }

  if (!data.itemName) {
    warnings.push({ field: "itemName", message: "Item Name is missing" });
  }

  if (!data.brand) {
    warnings.push({ field: "brand", message: "Brand is missing" });
  }

  if (!data.warrantyInfo) {
    warnings.push({ field: "warrantyInfo", message: "Warranty info is missing" });
  }

  return { errors, warnings };
}
