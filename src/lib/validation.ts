import { z } from "zod";

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
  numberOfPieces: z.number().int().optional(),
  individualOrSet: z.string().optional(),
  material: z.string().optional(),
  size: z.string().optional(),
  jspCategory: z.string().optional(),
  // Dimension fields
  upcHeight: z.number().optional(),
  upcWidth: z.number().optional(),
  upcLength: z.number().optional(),
  upcWeight: z.number().optional(),
  itemHeight: z.number().optional(),
  itemWidth: z.number().optional(),
  itemLength: z.number().optional(),
  itemWeight: z.number().optional(),
  innerCartonHeight: z.number().optional(),
  innerCartonWidth: z.number().optional(),
  innerCartonLength: z.number().optional(),
  innerCartonWeight: z.number().optional(),
  innerCartonQty: z.number().int().optional(),
  masterCartonGtin: z.string().optional(),
  masterCartonHeight: z.number().optional(),
  masterCartonWidth: z.number().optional(),
  masterCartonLength: z.number().optional(),
  masterCartonWeight: z.number().optional(),
  masterCartonQty: z.number().int().optional(),
  palletGtin: z.string().optional(),
  palletHeight: z.number().optional(),
  palletWidth: z.number().optional(),
  palletLength: z.number().optional(),
  palletWeight: z.number().optional(),
  palletStackable: z.boolean().optional(),
  layersPerPallet: z.number().int().optional(),
  palletQty: z.number().int().optional(),
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
