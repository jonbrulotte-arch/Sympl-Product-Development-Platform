import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

// Demo accounts with well-known passwords are only created when explicitly
// requested — never by default on a production database.
const SEED_DEMO = process.env.SEED_DEMO_USERS === "true";

async function main() {
  console.log("Seeding database...");

  // ─── Admin user ────────────────────────────────────────────────────────────
  // If no active admin exists, bootstrap one. Password comes from
  // SEED_ADMIN_PASSWORD, or is randomly generated and printed once.
  let pm: { id: string } | null = null;
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true } });
  if (!existingAdmin) {
    const password =
      process.env.SEED_ADMIN_PASSWORD ??
      (SEED_DEMO ? "admin123" : randomBytes(9).toString("base64url"));
    await prisma.user.upsert({
      where: { email: "admin@sympl.dev" },
      update: {},
      create: {
        email: "admin@sympl.dev",
        name: "Sympl Admin",
        passwordHash: await bcrypt.hash(password, 12),
        role: "ADMIN",
      },
    });
    console.log(`Admin account created: admin@sympl.dev / ${password}`);
    console.log("^ Change this password after first login.");
  }

  if (SEED_DEMO) {
    pm = await prisma.user.upsert({
      where: { email: "pm@sympl.dev" },
      update: {},
      create: {
        email: "pm@sympl.dev",
        name: "Product Manager",
        passwordHash: await bcrypt.hash("password123", 12),
        role: "PRODUCT_MANAGER",
      },
    });

    await prisma.user.upsert({
      where: { email: "contributor@sympl.dev" },
      update: {},
      create: {
        email: "contributor@sympl.dev",
        name: "Contributor User",
        passwordHash: await bcrypt.hash("password123", 12),
        role: "CONTRIBUTOR",
      },
    });
    console.log("Demo users created (SEED_DEMO_USERS=true)");
  }

  // ─── Attribute sections ────────────────────────────────────────────────────
  const sections: { name: string; slug: string; sortOrder: number; isCore: boolean }[] = [
    { name: "Core Data", slug: "core-data", sortOrder: 0, isCore: true },
    { name: "Status & Project Info", slug: "status-project-info", sortOrder: 1, isCore: true },
    { name: "Regulatory", slug: "regulatory", sortOrder: 2, isCore: true },
    { name: "Dimensions & Supply Chain", slug: "dimensions-supply-chain", sortOrder: 3, isCore: true },
    { name: "Digital Assets", slug: "digital-assets", sortOrder: 4, isCore: true },
    { name: "Universal Product Data", slug: "universal-product-data", sortOrder: 5, isCore: true },
  ];

  const sectionMap: Record<string, string> = {};
  for (const sec of sections) {
    const existing = await prisma.attributeSection.findUnique({ where: { slug: sec.slug } });
    if (!existing) {
      const s = await prisma.attributeSection.create({ data: sec });
      sectionMap[sec.slug] = s.id;
    } else {
      sectionMap[sec.slug] = existing.id;
    }
  }

  console.log("Sections created");

  // ─── Core attribute definitions ────────────────────────────────────────────
  const coreAttributes = [
    // Core Data — identity fields (stored on ProductRecord model, not EAV)
    { key: "partNumber", label: "Part Number", sectionSlug: "core-data", type: "TEXT", req: "REQUIRED" },
    { key: "modelNumber", label: "Model Number", sectionSlug: "core-data", type: "TEXT", req: "OPTIONAL" },
    { key: "itemName", label: "Item Name", sectionSlug: "core-data", type: "TEXT", req: "REQUIRED" },
    { key: "brand", label: "Brand", sectionSlug: "core-data", type: "TEXT", req: "REQUIRED" },
    { key: "upc", label: "UPC", sectionSlug: "core-data", type: "TEXT", req: "REQUIRED" },
    { key: "productSeries", label: "Product Series", sectionSlug: "core-data", type: "TEXT", req: "CONDITIONAL" },
    { key: "productSubSeries", label: "Product Sub-Series", sectionSlug: "core-data", type: "TEXT", req: "CONDITIONAL", maxValues: 3 },
    // Status & Project Info
    { key: "inventoryStatus", label: "Inventory Status", sectionSlug: "status-project-info", type: "SELECT", req: "REQUIRED" },
    { key: "inventoryStatusErp", label: "Inventory Status (ERP)", sectionSlug: "status-project-info", type: "SELECT", req: "REQUIRED" },
    { key: "projectEngineer", label: "Project Engineer", sectionSlug: "status-project-info", type: "TEXT", req: "CONDITIONAL", maxValues: 3 },
    { key: "vendor", label: "Vendor", sectionSlug: "status-project-info", type: "TEXT", req: "CONDITIONAL", maxValues: 4 },
    { key: "projectFolder", label: "Project Folder", sectionSlug: "status-project-info", type: "URL", req: "REQUIRED" },
    { key: "wrikeUrl", label: "Wrike URL", sectionSlug: "status-project-info", type: "URL", req: "REQUIRED" },
    { key: "productLabels", label: "Product Labels", sectionSlug: "status-project-info", type: "TEXT", req: "CONDITIONAL" },
    { key: "engineeringDrawings", label: "Engineering Drawings", sectionSlug: "status-project-info", type: "URL", req: "CONDITIONAL" },
    { key: "packagingArtwork", label: "Packaging Artwork", sectionSlug: "status-project-info", type: "URL", req: "CONDITIONAL" },
    { key: "warningDescription", label: "Warning Description", sectionSlug: "status-project-info", type: "TEXT", req: "REQUIRED", maxValues: 8 },
    { key: "dimensionalLimitations", label: "Dimensional/Depth/Thickness Limitations", sectionSlug: "status-project-info", type: "TEXT", req: "OPTIONAL" },
    { key: "projectNotes", label: "Project Notes", sectionSlug: "status-project-info", type: "TEXTAREA", req: "OPTIONAL", maxValues: 3 },
    { key: "recommendedMaterials", label: "Recommended Material(s)", sectionSlug: "status-project-info", type: "TEXT", req: "OPTIONAL", maxValues: 3 },
    // Regulatory — core model fields
    { key: "warrantyInfo", label: "Warranty Info", sectionSlug: "regulatory", type: "TEXT", req: "CONDITIONAL" },
    { key: "htsCode", label: "HTS Code", sectionSlug: "regulatory", type: "TEXT", req: "CONDITIONAL" },
    { key: "htsCodeCanada", label: "HTS Code (Canada)", sectionSlug: "regulatory", type: "TEXT", req: "CONDITIONAL" },
    { key: "productComposition", label: "Product Composition", sectionSlug: "regulatory", type: "TEXT", req: "CONDITIONAL" },
    { key: "needsProp65", label: "Needs Prop 65", sectionSlug: "regulatory", type: "BOOLEAN", req: "CONDITIONAL" },
    { key: "batteriesRequired", label: "Batteries Required", sectionSlug: "regulatory", type: "TEXT", req: "CONDITIONAL" },
    { key: "countryOfOrigin", label: "Country of Origin", sectionSlug: "regulatory", type: "SELECT", req: "REQUIRED", maxValues: 4 },
    { key: "prop65Chemicals", label: "Prop 65 Chemicals", sectionSlug: "regulatory", type: "TEXT", req: "CONDITIONAL", maxValues: 6 },
    // Universal Product Data — core model fields
    { key: "packagingType", label: "Packaging Type", sectionSlug: "universal-product-data", type: "SELECT", req: "CONDITIONAL" },
    { key: "packagingLangType", label: "Packaging Language Type", sectionSlug: "universal-product-data", type: "TEXT", req: "OPTIONAL" },
    { key: "packSize", label: "Pack Size", sectionSlug: "universal-product-data", type: "TEXT", req: "CONDITIONAL" },
    { key: "numberOfPieces", label: "Number of Pieces", sectionSlug: "universal-product-data", type: "NUMBER", req: "CONDITIONAL" },
    { key: "individualOrSet", label: "Individual/Set", sectionSlug: "universal-product-data", type: "SELECT", req: "CONDITIONAL" },
    { key: "material", label: "Material", sectionSlug: "universal-product-data", type: "TEXT", req: "CONDITIONAL" },
    { key: "size", label: "Size", sectionSlug: "universal-product-data", type: "TEXT", req: "CONDITIONAL" },
    { key: "jspCategory", label: "JSP Category", sectionSlug: "universal-product-data", type: "TEXT", req: "OPTIONAL" },
    { key: "userManual", label: "User Manual", sectionSlug: "universal-product-data", type: "URL", req: "OPTIONAL" },
    { key: "cutSheets", label: "Cut Sheets", sectionSlug: "universal-product-data", type: "URL", req: "OPTIONAL" },
    { key: "color", label: "Color", sectionSlug: "universal-product-data", type: "SELECT", req: "CONDITIONAL", maxValues: 4 },
    { key: "toolType", label: "Tool Type", sectionSlug: "universal-product-data", type: "SELECT", req: "CONDITIONAL", maxValues: 2 },
    { key: "trades", label: "Trades", sectionSlug: "universal-product-data", type: "SELECT", req: "CONDITIONAL", maxValues: 11 },
    { key: "materialApplication", label: "Material Application", sectionSlug: "universal-product-data", type: "SELECT", req: "CONDITIONAL", maxValues: 27 },
    // Digital Assets
    { key: "packagingLanguagePrimary", label: "Packaging Language (Primary)", sectionSlug: "digital-assets", type: "SELECT", req: "REQUIRED" },
    { key: "packagingLanguageAdditional", label: "Packaging Language (Additional)", sectionSlug: "digital-assets", type: "SELECT", req: "CONDITIONAL", maxValues: 3 },
    // Dimensions & Supply Chain — Selling Unit (core model fields)
    { key: "upcHeight", label: "UPC Height (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "CONDITIONAL" },
    { key: "upcWidth", label: "UPC Width (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "CONDITIONAL" },
    { key: "upcLength", label: "UPC Length (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "CONDITIONAL" },
    { key: "upcWeight", label: "UPC Weight (lbs)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "CONDITIONAL" },
    // Item (Unpackaged)
    { key: "itemHeight", label: "Item Height (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "itemWidth", label: "Item Width (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "itemLength", label: "Item Length (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "itemWeight", label: "Item Weight (lbs)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    // Inner Carton
    { key: "innerCartonGtin", label: "Inner Carton GTIN-14", sectionSlug: "dimensions-supply-chain", type: "TEXT", req: "OPTIONAL" },
    { key: "innerCartonHeight", label: "Inner Carton Height (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "innerCartonWidth", label: "Inner Carton Width (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "innerCartonLength", label: "Inner Carton Length (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "innerCartonWeight", label: "Inner Carton Weight (lbs)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "innerCartonQty", label: "Inner Carton Qty", sectionSlug: "dimensions-supply-chain", type: "NUMBER", req: "OPTIONAL" },
    // Master Carton
    { key: "masterCartonGtin", label: "Master Carton GTIN-14", sectionSlug: "dimensions-supply-chain", type: "TEXT", req: "OPTIONAL" },
    { key: "masterCartonHeight", label: "Master Carton Height (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "masterCartonWidth", label: "Master Carton Width (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "masterCartonLength", label: "Master Carton Length (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "masterCartonWeight", label: "Master Carton Weight (lbs)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "masterCartonQty", label: "Master Carton Qty", sectionSlug: "dimensions-supply-chain", type: "NUMBER", req: "OPTIONAL" },
    // Alt Carton
    { key: "altCartonGtin", label: "Alt Carton GTIN", sectionSlug: "dimensions-supply-chain", type: "TEXT", req: "OPTIONAL" },
    { key: "altCartonType", label: "Alt Carton Type", sectionSlug: "dimensions-supply-chain", type: "TEXT", req: "OPTIONAL" },
    { key: "altCartonHeight", label: "Alt Carton Height (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "altCartonWidth", label: "Alt Carton Width (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "altCartonLength", label: "Alt Carton Length (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "altCartonWeight", label: "Alt Carton Weight (lbs)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "altCartonQty", label: "Alt Carton Qty", sectionSlug: "dimensions-supply-chain", type: "NUMBER", req: "OPTIONAL" },
    // Pallet
    { key: "palletGtin", label: "Pallet GTIN", sectionSlug: "dimensions-supply-chain", type: "TEXT", req: "OPTIONAL" },
    { key: "palletHeight", label: "Pallet Height (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "palletWidth", label: "Pallet Width (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "palletLength", label: "Pallet Length (in)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "palletWeight", label: "Pallet Weight (lbs)", sectionSlug: "dimensions-supply-chain", type: "DECIMAL", req: "OPTIONAL" },
    { key: "palletStackable", label: "Pallet Stackable", sectionSlug: "dimensions-supply-chain", type: "BOOLEAN", req: "OPTIONAL" },
    { key: "layersPerPallet", label: "Layers Per Pallet", sectionSlug: "dimensions-supply-chain", type: "NUMBER", req: "OPTIONAL" },
    { key: "palletQty", label: "Pallet Qty", sectionSlug: "dimensions-supply-chain", type: "NUMBER", req: "OPTIONAL" },
  ];

  for (const attr of coreAttributes) {
    const sectionId = sectionMap[attr.sectionSlug];
    const existing = await prisma.attributeDefinition.findUnique({ where: { key: attr.key } });
    if (!existing) {
      await prisma.attributeDefinition.create({
        data: {
          key: attr.key,
          label: attr.label,
          sectionId,
          attributeType: attr.type as never,
          requirement: attr.req as never,
          maxValues: attr.maxValues ?? 1,
          isCore: true,
        },
      });
    }
  }

  console.log("Core attributes created");

  // ─── LOV data ──────────────────────────────────────────────────────────────
  const lovData: Record<string, string[]> = {
    inventoryStatusErp: ["Sales Inventory", "Inactive", "Discontinued"],
    inventoryStatus: ["Active", "Backshop Only", "Bulk/BOM Component", "Customer Restricted", "Discontinued", "Future", "In-Store", "Limited", "On Hold", "Replacement Part Only"],
    warranty: ["10 Day Limited Warranty", "1 Year Limited Warranty", "2 Year Limited Warranty", "3 Year Limited Warranty", "5 Year Limited Warranty", "30 Day Limited Warranty", "60 Day Limited Warranty", "90 Day Limited Warranty", "Component Specific", "Lifetime Limited Warranty", "No Warranty"],
    color: ["Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink", "Brown", "Black", "White", "Gray", "Light Blue", "Dark Blue", "Light Green", "Dark Green", "Gold", "Silver", "Beige"],
    packagingLanguageType: ["Single Language", "Bilingual", "Trilingual"],
    packagingLanguages: ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Japanese", "Korean", "Arabic"],
    alternateCartonType: ["Half Pallet", "Quarter Pallet", "Tray/Cut Case", "Clip Strip"],
    brand: ["Spyder", "212 Performance", "American Forge & Foundry", "Arrow Pneumatics", "CRAFTSMAN", "DEWALT", "Estwing", "Husky", "Kobalt", "Porter-Cable", "Stanley", "Other (See Notes)"],
    toolType: ["Angle Grinder", "Belt Sander", "Chop Saw (Metal Cutting)", "Circular Saw", "Drill", "Jig Saw", "Oscillating Tool", "Random Orbital Sander", "Reciprocating Saw", "Router"],
    trades: ["Automotive", "Carpentry", "Construction", "Electrical", "HVAC", "Landscaping", "Masonry", "Metalworking", "Painting", "Plumbing", "Roofing"],
    materialApplication: ["Acrylic", "Aluminum", "Brick", "Cast Iron", "Ceramic", "Composites", "Concrete", "Copper", "Drywall", "Fiberglass", "Foam", "Granite", "Hardwood", "Laminate", "Marble", "MDF", "Metal", "OSB", "Plywood", "PVC", "Rubber", "Softwood", "Steel", "Tile", "Vinyl", "Wood", "Other"],
    toothGrind: ["ATB - Alternating Tooth Bevel", "ATB+ - Alternating Tooth Bevel Plus", "ATB+DD - Alternating Tooth Bevel + Demo Drive", "FTG - Flat Top Grind", "Hi-ATB - High Alternating Tooth Bevel", "TCG - Triple Chip Grind"],
    individualSet: ["Individual", "Set"],
    boolean: ["Yes", "No"],
    batteryComposition: ["Does Not Contain a Battery", "Lithium-Ion", "Nickel-Cadmium", "Nickel-Metal Hydride", "Alkaline"],
    countryOfOrigin: ["Cambodia", "Canada", "China", "Germany", "India", "Japan", "Mexico", "South Korea", "Taiwan", "United States", "Vietnam"],
  };

  for (const [key, values] of Object.entries(lovData)) {
    const attrDef = await prisma.attributeDefinition.findUnique({ where: { key } });
    if (!attrDef) continue;
    for (let i = 0; i < values.length; i++) {
      await prisma.lovItem.upsert({
        where: { attributeDefinitionId_value: { attributeDefinitionId: attrDef.id, value: values[i] } },
        update: {},
        create: {
          attributeDefinitionId: attrDef.id,
          value: values[i],
          label: values[i],
          sortOrder: i,
        },
      });
    }
  }

  console.log("LOV data seeded");

  // ─── Categories ────────────────────────────────────────────────────────────
  const categories = [
    { name: "Power Tool Accessories", slug: "power-tool-accessories" },
    { name: "Circular Saw Blades", slug: "circular-saw-blades", parentSlug: "power-tool-accessories" },
    { name: "Reciprocating Saw Blades", slug: "reciprocating-saw-blades", parentSlug: "power-tool-accessories" },
    { name: "Jig Saw Blades", slug: "jig-saw-blades", parentSlug: "power-tool-accessories" },
    { name: "Hole Saws", slug: "hole-saws", parentSlug: "power-tool-accessories" },
    { name: "Drill Bits", slug: "drill-bits", parentSlug: "power-tool-accessories" },
    { name: "Abrasives", slug: "abrasives", parentSlug: "power-tool-accessories" },
    { name: "Oscillating Tool Blades", slug: "oscillating-tool-blades", parentSlug: "power-tool-accessories" },
    { name: "Driver Bits and Extensions", slug: "driver-bits", parentSlug: "power-tool-accessories" },
  ];

  const categoryMap: Record<string, string> = {};
  for (const cat of categories) {
    const existing = await prisma.category.findUnique({ where: { slug: cat.slug } });
    if (!existing) {
      const c = await prisma.category.create({
        data: {
          name: cat.name,
          slug: cat.slug,
          parentId: cat.parentSlug ? categoryMap[cat.parentSlug] : undefined,
        },
      });
      categoryMap[cat.slug] = c.id;
    } else {
      categoryMap[cat.slug] = existing.id;
    }
  }

  // Category-specific attributes for Circular Saw Blades
  const sawBladeAttrs = [
    { key: "toothGrind", label: "Tooth Grind", type: "SELECT", req: "CONDITIONAL", maxValues: 3 },
    { key: "diameterInches", label: "Diameter (Inches)", type: "TEXT", req: "REQUIRED", maxValues: 3 },
    { key: "arborSize", label: "Arbor Size (Inches)", type: "TEXT", req: "REQUIRED", maxValues: 3 },
    { key: "bushingSize", label: "Bushing Size", type: "TEXT", req: "CONDITIONAL", maxValues: 3 },
    { key: "toothCount", label: "Tooth Count", type: "NUMBER", req: "REQUIRED", maxValues: 3 },
    { key: "hookAngle", label: "Hook Angle (Degrees)", type: "DECIMAL", req: "CONDITIONAL", maxValues: 3 },
    { key: "maxSpeedRpm", label: "Maximum Speed (RPM)", type: "NUMBER", req: "REQUIRED", maxValues: 3 },
    { key: "plateThickness", label: "Plate Thickness", type: "TEXT", req: "CONDITIONAL", maxValues: 3 },
    { key: "kerfThickness", label: "Cutting Thickness/Kerf", type: "TEXT", req: "CONDITIONAL", maxValues: 3 },
  ];

  const sawBladeCategoryId = categoryMap["circular-saw-blades"];
  for (const attr of sawBladeAttrs) {
    const existing = await prisma.attributeDefinition.findUnique({ where: { key: attr.key } });
    if (!existing) {
      await prisma.attributeDefinition.create({
        data: {
          key: attr.key,
          label: attr.label,
          categoryId: sawBladeCategoryId,
          attributeType: attr.type as never,
          requirement: attr.req as never,
          maxValues: attr.maxValues ?? 1,
          isCore: false,
        },
      });
    }
  }

  // Attach toothGrind LOV to the category-specific attribute
  const toothGrindAttr = await prisma.attributeDefinition.findUnique({ where: { key: "toothGrind" } });
  if (toothGrindAttr) {
    const grinds = lovData.toothGrind;
    for (let i = 0; i < grinds.length; i++) {
      await prisma.lovItem.upsert({
        where: { attributeDefinitionId_value: { attributeDefinitionId: toothGrindAttr.id, value: grinds[i] } },
        update: {},
        create: { attributeDefinitionId: toothGrindAttr.id, value: grinds[i], label: grinds[i], sortOrder: i },
      });
    }
  }

  console.log("Categories and category-specific attributes seeded");

  // ─── Default workflow template ─────────────────────────────────────────────
  const existingTemplate = await prisma.workflowTemplate.findFirst({ where: { isDefault: true } });
  if (!existingTemplate) {
    const template = await prisma.workflowTemplate.create({
      data: {
        name: "Standard Product Review",
        description: "Default approval workflow for product development projects",
        isDefault: true,
      },
    });

    const stages = [
      { name: "Product Data Review", description: "Review all core product data fields", sortOrder: 0 },
      { name: "Marketing Review", description: "Review marketing copy, names, and descriptions", sortOrder: 1 },
      { name: "Compliance Review", description: "Review regulatory and compliance attributes", sortOrder: 2 },
      { name: "Pricing Review", description: "Review pricing and pack configuration", sortOrder: 3 },
      { name: "Final Approval", description: "Final sign-off before export", sortOrder: 4 },
    ];

    for (const stage of stages) {
      await prisma.workflowStageTemplate.create({
        data: { ...stage, workflowTemplateId: template.id },
      });
    }
  }

  console.log("Workflow template created");

  // ─── Sample project (demo mode only) ───────────────────────────────────────
  const existingProject = await prisma.project.findFirst({ where: { name: "Q2 Saw Blade Launch — Demo" } });
  if (SEED_DEMO && pm && !existingProject) {
    const project = await prisma.project.create({
      data: {
        name: "Q2 Saw Blade Launch — Demo",
        description: "Demo project with sample circular saw blade data",
        brand: "Spyder",
        categoryId: categoryMap["circular-saw-blades"],
        productFamilyName: "Rapid Core Eject",
        status: "IN_PROGRESS",
        ownerId: pm.id,
        targetLaunchDate: new Date("2026-09-01"),
        retailer: "Home Depot",
        tags: ["saw-blades", "Q2-2026", "home-depot"],
      },
    });

    // Sample products
    const sampleProducts = [
      {
        partNumber: "SP-004-008",
        modelNumber: "SP-004-008",
        itemName: "7-1/4 In. 24T Framing Circular Saw Blade",
        brand: "Spyder",
        upc: "804271015003",
        inventoryStatus: "Active",
        warrantyInfo: "1 Year Limited Warranty",
        packSize: "1",
        numberOfPieces: 1,
        individualOrSet: "Individual",
        jspCategory: "Power Tool Accessories|Circular Saw Blades",
        masterCartonQty: 10,
        palletQty: 100,
      },
      {
        partNumber: "SP-004-009",
        modelNumber: "SP-004-009",
        itemName: "7-1/4 In. 40T Fine Finish Circular Saw Blade",
        brand: "Spyder",
        upc: "804271015010",
        inventoryStatus: "Active",
        warrantyInfo: "1 Year Limited Warranty",
        packSize: "1",
        numberOfPieces: 1,
        individualOrSet: "Individual",
        jspCategory: "Power Tool Accessories|Circular Saw Blades",
        masterCartonQty: 10,
        palletQty: 100,
      },
      {
        partNumber: "SP-004-010",
        modelNumber: "SP-004-010",
        itemName: "10 In. 60T Ultra Fine Circular Saw Blade",
        brand: "Spyder",
        upc: "804271015027",
        inventoryStatus: "Future",
        warrantyInfo: "1 Year Limited Warranty",
        packSize: "1",
        numberOfPieces: 1,
        individualOrSet: "Individual",
        jspCategory: "Power Tool Accessories|Circular Saw Blades",
        masterCartonQty: 5,
        palletQty: 60,
      },
    ];

    for (let i = 0; i < sampleProducts.length; i++) {
      await prisma.productRecord.create({
        data: {
          ...sampleProducts[i],
          projectId: project.id,
          createdById: pm.id,
          updatedById: pm.id,
          rowIndex: i,
          categoryId: categoryMap["circular-saw-blades"],
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: pm.id,
        action: "CREATED",
        entityType: "Project",
        entityId: project.id,
        projectId: project.id,
        newValue: project.name,
      },
    });
  }

  console.log("\n✅ Seed complete!");
  if (SEED_DEMO) {
    console.log("\nDemo accounts:");
    console.log("  Admin:  admin@sympl.dev / admin123 (unless SEED_ADMIN_PASSWORD was set)");
    console.log("  PM:     pm@sympl.dev / password123");
    console.log("  User:   contributor@sympl.dev / password123");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
