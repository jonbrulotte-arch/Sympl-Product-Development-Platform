import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

const ATTRS = [
  // Core Data
  { key: "partNumber", label: "Part Number", section: "Core Data", type: "TEXT", req: "REQUIRED", sort: 0 },
  { key: "modelNumber", label: "Model Number", section: "Core Data", type: "TEXT", req: "OPTIONAL", sort: 1 },
  { key: "itemName", label: "Item Name", section: "Core Data", type: "TEXT", req: "REQUIRED", sort: 2 },
  { key: "brand", label: "Brand", section: "Core Data", type: "TEXT", req: "REQUIRED", sort: 3 },
  { key: "upc", label: "UPC", section: "Core Data", type: "TEXT", req: "REQUIRED", sort: 4 },
  // Status
  { key: "inventoryStatus", label: "Inventory Status", section: "Status & Project Info", type: "SELECT", req: "REQUIRED", sort: 0 },
  // Regulatory core model fields
  { key: "warrantyInfo", label: "Warranty Info", section: "Regulatory", type: "TEXT", req: "CONDITIONAL", sort: 10 },
  { key: "htsCode", label: "HTS Code", section: "Regulatory", type: "TEXT", req: "CONDITIONAL", sort: 11 },
  { key: "htsCodeCanada", label: "HTS Code (Canada)", section: "Regulatory", type: "TEXT", req: "CONDITIONAL", sort: 12 },
  { key: "productComposition", label: "Product Composition", section: "Regulatory", type: "TEXT", req: "CONDITIONAL", sort: 13 },
  { key: "needsProp65", label: "Needs Prop 65", section: "Regulatory", type: "BOOLEAN", req: "CONDITIONAL", sort: 14 },
  // Universal Product Data core model fields
  { key: "packagingType", label: "Packaging Type", section: "Universal Product Data", type: "SELECT", req: "CONDITIONAL", sort: 10 },
  { key: "packSize", label: "Pack Size", section: "Universal Product Data", type: "TEXT", req: "CONDITIONAL", sort: 11 },
  { key: "numberOfPieces", label: "Number of Pieces", section: "Universal Product Data", type: "NUMBER", req: "CONDITIONAL", sort: 12 },
  { key: "individualOrSet", label: "Individual/Set", section: "Universal Product Data", type: "SELECT", req: "CONDITIONAL", sort: 13 },
  { key: "material", label: "Material", section: "Universal Product Data", type: "TEXT", req: "CONDITIONAL", sort: 14 },
  { key: "size", label: "Size", section: "Universal Product Data", type: "TEXT", req: "CONDITIONAL", sort: 15 },
  { key: "jspCategory", label: "JSP Category", section: "Universal Product Data", type: "TEXT", req: "OPTIONAL", sort: 16 },
  { key: "userManual", label: "User Manual", section: "Universal Product Data", type: "URL", req: "OPTIONAL", sort: 17 },
  { key: "cutSheets", label: "Cut Sheets", section: "Universal Product Data", type: "URL", req: "OPTIONAL", sort: 18 },
  // Dimensions & Supply Chain — Selling Unit
  { key: "upcHeight", label: "UPC Height (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "CONDITIONAL", sort: 10 },
  { key: "upcWidth", label: "UPC Width (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "CONDITIONAL", sort: 11 },
  { key: "upcLength", label: "UPC Length (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "CONDITIONAL", sort: 12 },
  { key: "upcWeight", label: "UPC Weight (lbs)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "CONDITIONAL", sort: 13 },
  // Item (Unpackaged)
  { key: "itemHeight", label: "Item Height (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 20 },
  { key: "itemWidth", label: "Item Width (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 21 },
  { key: "itemLength", label: "Item Length (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 22 },
  { key: "itemWeight", label: "Item Weight (lbs)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 23 },
  // Inner Carton
  { key: "innerCartonGtin", label: "Inner Carton GTIN-14", section: "Dimensions & Supply Chain", type: "TEXT", req: "OPTIONAL", sort: 30 },
  { key: "innerCartonHeight", label: "Inner Carton Height (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 31 },
  { key: "innerCartonWidth", label: "Inner Carton Width (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 32 },
  { key: "innerCartonLength", label: "Inner Carton Length (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 33 },
  { key: "innerCartonWeight", label: "Inner Carton Weight (lbs)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 34 },
  { key: "innerCartonQty", label: "Inner Carton Qty", section: "Dimensions & Supply Chain", type: "NUMBER", req: "OPTIONAL", sort: 35 },
  // Master Carton
  { key: "masterCartonGtin", label: "Master Carton GTIN-14", section: "Dimensions & Supply Chain", type: "TEXT", req: "OPTIONAL", sort: 40 },
  { key: "masterCartonHeight", label: "Master Carton Height (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 41 },
  { key: "masterCartonWidth", label: "Master Carton Width (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 42 },
  { key: "masterCartonLength", label: "Master Carton Length (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 43 },
  { key: "masterCartonWeight", label: "Master Carton Weight (lbs)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 44 },
  { key: "masterCartonQty", label: "Master Carton Qty", section: "Dimensions & Supply Chain", type: "NUMBER", req: "OPTIONAL", sort: 45 },
  // Pallet
  { key: "palletGtin", label: "Pallet GTIN", section: "Dimensions & Supply Chain", type: "TEXT", req: "OPTIONAL", sort: 50 },
  { key: "palletHeight", label: "Pallet Height (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 51 },
  { key: "palletWidth", label: "Pallet Width (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 52 },
  { key: "palletLength", label: "Pallet Length (in)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 53 },
  { key: "palletWeight", label: "Pallet Weight (lbs)", section: "Dimensions & Supply Chain", type: "DECIMAL", req: "OPTIONAL", sort: 54 },
  { key: "palletStackable", label: "Pallet Stackable", section: "Dimensions & Supply Chain", type: "BOOLEAN", req: "OPTIONAL", sort: 55 },
  { key: "layersPerPallet", label: "Layers Per Pallet", section: "Dimensions & Supply Chain", type: "NUMBER", req: "OPTIONAL", sort: 56 },
  { key: "palletQty", label: "Pallet Qty", section: "Dimensions & Supply Chain", type: "NUMBER", req: "OPTIONAL", sort: 57 },
];

async function main() {
  let created = 0, skipped = 0;

  for (const attr of ATTRS) {
    const existing = await (prisma as any).attributeDefinition.findUnique({ where: { key: attr.key } });
    if (existing) { skipped++; continue; }

    const section = await (prisma as any).attributeSection.findFirst({ where: { name: attr.section } });

    await (prisma as any).attributeDefinition.create({
      data: {
        key: attr.key,
        label: attr.label,
        attributeType: attr.type,
        requirement: attr.req,
        sortOrder: attr.sort,
        isActive: true,
        salsifyEnabled: false,
        ...(section ? { sectionId: section.id } : {}),
      },
    });
    created++;
    console.log(`  Created: ${attr.key}`);
  }

  console.log(`\nDone — created ${created}, skipped ${skipped} (already existed)`);
}

main().catch(console.error).finally(() => pool.end());
