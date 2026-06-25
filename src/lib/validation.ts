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
  partNumber: z.string().nullish(),
  modelNumber: z.string().nullish(),
  itemName: z.string().nullish(),
  brand: z.string().nullish(),
  upc: z
    .string()
    .nullish()
    .refine(
      (v) => !v || /^\d{8,14}$/.test(v),
      "UPC must be 8–14 digits"
    ),
  categoryId: z.string().nullish(),
  inventoryStatus: z.string().nullish(),
  warrantyInfo: z.string().nullish(),
  htsCode: z.string().nullish(),
  htsCodeCanada: z.string().nullish(),
  productComposition: z.string().nullish(),
  needsProp65: z.boolean().optional(),
  packagingType: z.string().nullish(),
  packSize: z.string().nullish(),
  numberOfPieces: optInt,
  individualOrSet: z.string().nullish(),
  material: z.string().nullish(),
  size: z.string().nullish(),
  jspCategory: z.string().nullish(),
  innerCartonGtin: z.string().nullish(),
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
  masterCartonGtin: z.string().nullish(),
  masterCartonHeight: optNum,
  masterCartonWidth: optNum,
  masterCartonLength: optNum,
  masterCartonWeight: optNum,
  masterCartonQty: optInt,
  palletGtin: z.string().nullish(),
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
