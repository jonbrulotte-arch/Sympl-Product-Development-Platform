import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AttributesClient } from "./attributes-client";

// Core product fields that are typed columns in the product grid.
// These live on ProductRecord directly (not as EAV values) but should be
// visible and configurable in the Attribute Definitions admin page.
const CORE_ATTR_SEEDS = [
  // Core Data
  { key: "partNumber",    label: "Part Number",       attributeType: "TEXT",    requirement: "REQUIRED",    section: "Core Data",    sortOrder: 0,  description: "Internal or manufacturer part number" },
  { key: "modelNumber",   label: "Model Number",      attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Core Data",    sortOrder: 1,  description: null },
  { key: "itemName",      label: "Item Name",         attributeType: "TEXT",    requirement: "REQUIRED",    section: "Core Data",    sortOrder: 2,  description: "Full product display name" },
  { key: "brand",         label: "Brand",             attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Core Data",    sortOrder: 3,  description: null },
  { key: "upc",           label: "UPC",               attributeType: "UPC",     requirement: "CONDITIONAL", section: "Core Data",    sortOrder: 4,  description: "Universal Product Code (12-digit barcode)" },
  // Status / Regulatory
  { key: "inventoryStatus",    label: "Inventory Status",       attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Status",          sortOrder: 0,  description: "Current inventory / availability status" },
  { key: "warrantyInfo",       label: "Warranty Info",          attributeType: "TEXTAREA",requirement: "OPTIONAL",    section: "Regulatory",      sortOrder: 0,  description: null },
  { key: "htsCode",            label: "HTS Code",               attributeType: "TEXT",    requirement: "CONDITIONAL", section: "Regulatory",      sortOrder: 1,  description: "Harmonized Tariff Schedule code for customs" },
  { key: "htsCodeCanada",      label: "HTS Code (Canada)",      attributeType: "TEXT",    requirement: "CONDITIONAL", section: "Regulatory",      sortOrder: 2,  description: "Canadian Harmonized Tariff Schedule code" },
  { key: "productComposition", label: "Product Composition",    attributeType: "TEXT",    requirement: "CONDITIONAL", section: "Regulatory",      sortOrder: 3,  description: "Materials or ingredients list" },
  { key: "needsProp65",        label: "Needs Prop 65",          attributeType: "BOOLEAN", requirement: "CONDITIONAL", section: "Regulatory",      sortOrder: 4,  description: "California Prop 65 warning required" },
  // Product
  { key: "packagingType",      label: "Packaging Type",         attributeType: "SELECT",  requirement: "OPTIONAL",    section: "Product",         sortOrder: 0,  description: null },
  { key: "packSize",           label: "Pack Size",              attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Product",         sortOrder: 1,  description: null },
  { key: "numberOfPieces",     label: "Number of Pieces",       attributeType: "NUMBER",  requirement: "OPTIONAL",    section: "Product",         sortOrder: 2,  description: null },
  { key: "individualOrSet",    label: "Individual/Set",         attributeType: "SELECT",  requirement: "OPTIONAL",    section: "Product",         sortOrder: 3,  description: "Whether sold as individual item or a set" },
  { key: "material",           label: "Material",               attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Product",         sortOrder: 4,  description: null },
  { key: "size",               label: "Size",                   attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Product",         sortOrder: 5,  description: null },
  { key: "jspCategory",        label: "JSP Category",           attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Product",         sortOrder: 6,  description: null },
  { key: "userManual",         label: "User Manual",            attributeType: "URL",     requirement: "OPTIONAL",    section: "Product",         sortOrder: 7,  description: "Link to user manual document" },
  { key: "cutSheets",          label: "Cut Sheets",             attributeType: "URL",     requirement: "OPTIONAL",    section: "Product",         sortOrder: 8,  description: "Link to cut sheet document" },
  // Selling Unit
  { key: "upcHeight",          label: "UPC Height (in)",        attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Selling Unit",    sortOrder: 0,  description: null },
  { key: "upcWidth",           label: "UPC Width (in)",         attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Selling Unit",    sortOrder: 1,  description: null },
  { key: "upcLength",          label: "UPC Length (in)",        attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Selling Unit",    sortOrder: 2,  description: null },
  { key: "upcWeight",          label: "UPC Weight (lbs)",       attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Selling Unit",    sortOrder: 3,  description: null },
  // Item (Unpackaged)
  { key: "itemHeight",         label: "Item Height (in)",       attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Item (Unpackaged)", sortOrder: 0, description: "Unpackaged item height" },
  { key: "itemWidth",          label: "Item Width (in)",        attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Item (Unpackaged)", sortOrder: 1, description: "Unpackaged item width" },
  { key: "itemLength",         label: "Item Length (in)",       attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Item (Unpackaged)", sortOrder: 2, description: "Unpackaged item length" },
  { key: "itemWeight",         label: "Item Weight (lbs)",      attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Item (Unpackaged)", sortOrder: 3, description: "Unpackaged item weight" },
  // Inner Carton
  { key: "innerCartonGtin",    label: "Inner Carton GTIN-14",   attributeType: "GTIN",    requirement: "OPTIONAL",    section: "Inner Carton",    sortOrder: 0,  description: null },
  { key: "innerCartonHeight",  label: "IC Height (in)",         attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Inner Carton",    sortOrder: 1,  description: null },
  { key: "innerCartonWidth",   label: "IC Width (in)",          attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Inner Carton",    sortOrder: 2,  description: null },
  { key: "innerCartonLength",  label: "IC Length (in)",         attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Inner Carton",    sortOrder: 3,  description: null },
  { key: "innerCartonWeight",  label: "IC Weight (lbs)",        attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Inner Carton",    sortOrder: 4,  description: null },
  { key: "innerCartonQty",     label: "IC Qty",                 attributeType: "NUMBER",  requirement: "OPTIONAL",    section: "Inner Carton",    sortOrder: 5,  description: null },
  // Master Carton
  { key: "masterCartonGtin",   label: "MC GTIN-14",             attributeType: "GTIN",    requirement: "OPTIONAL",    section: "Master Carton",   sortOrder: 0,  description: null },
  { key: "masterCartonHeight", label: "MC Height (in)",         attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Master Carton",   sortOrder: 1,  description: null },
  { key: "masterCartonWidth",  label: "MC Width (in)",          attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Master Carton",   sortOrder: 2,  description: null },
  { key: "masterCartonLength", label: "MC Length (in)",         attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Master Carton",   sortOrder: 3,  description: null },
  { key: "masterCartonWeight", label: "MC Weight (lbs)",        attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Master Carton",   sortOrder: 4,  description: null },
  { key: "masterCartonQty",    label: "MC Qty",                 attributeType: "NUMBER",  requirement: "OPTIONAL",    section: "Master Carton",   sortOrder: 5,  description: null },
  // Pallet
  { key: "palletGtin",         label: "Pallet GTIN",            attributeType: "GTIN",    requirement: "OPTIONAL",    section: "Pallet",          sortOrder: 0,  description: null },
  { key: "palletHeight",       label: "Pallet Height (in)",     attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Pallet",          sortOrder: 1,  description: null },
  { key: "palletWidth",        label: "Pallet Width (in)",      attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Pallet",          sortOrder: 2,  description: null },
  { key: "palletLength",       label: "Pallet Length (in)",     attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Pallet",          sortOrder: 3,  description: null },
  { key: "palletWeight",       label: "Pallet Weight (lbs)",    attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Pallet",          sortOrder: 4,  description: null },
  { key: "palletStackable",    label: "Pallet Stackable",       attributeType: "BOOLEAN", requirement: "OPTIONAL",    section: "Pallet",          sortOrder: 5,  description: null },
  { key: "layersPerPallet",    label: "Layers Per Pallet",      attributeType: "NUMBER",  requirement: "OPTIONAL",    section: "Pallet",          sortOrder: 6,  description: null },
  { key: "palletQty",          label: "Pallet Qty",             attributeType: "NUMBER",  requirement: "OPTIONAL",    section: "Pallet",          sortOrder: 7,  description: null },
] as const;

async function seedCoreAttributes() {
  // Build/ensure sections exist
  const sectionNames = [...new Set(CORE_ATTR_SEEDS.map((s) => s.section))];
  const sectionMap = new Map<string, string>(); // name → id

  for (let i = 0; i < sectionNames.length; i++) {
    const name = sectionNames[i];
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const section = await prisma.attributeSection.upsert({
      where: { slug },
      create: { name, slug, sortOrder: i, isCore: true },
      update: {},
    });
    sectionMap.set(name, section.id);
  }

  // Upsert each core attribute definition
  for (const seed of CORE_ATTR_SEEDS) {
    const sectionId = sectionMap.get(seed.section) ?? null;
    await prisma.attributeDefinition.upsert({
      where: { key: seed.key },
      create: {
        key: seed.key,
        label: seed.label,
        attributeType: seed.attributeType as never,
        requirement: seed.requirement as never,
        description: seed.description,
        sortOrder: seed.sortOrder,
        sectionId,
        isCore: true,
        isActive: true,
        maxValues: 1,
      },
      update: {
        // Only fill in section/label if the record has no section set yet
        // (avoid overwriting admin customizations)
        ...(sectionId ? {} : { sectionId }),
      },
    });
  }
}

export default async function AttributesPage() {
  const session = await auth();
  if (!session?.user?.id || !["ADMIN", "PRODUCT_MANAGER"].includes(session.user.role!)) redirect("/dashboard");

  // Seed core attribute definitions (idempotent — safe to run every page load)
  await seedCoreAttributes().catch(() => {});

  const [attributes, sections, categories] = await Promise.all([
    prisma.attributeDefinition.findMany({
      where: { isActive: true },
      include: {
        section: true,
        category: true,
        lovItems: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    prisma.attributeSection.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <AttributesClient
      initialAttributes={attributes as never}
      initialSections={sections}
      categories={categories}
    />
  );
}
