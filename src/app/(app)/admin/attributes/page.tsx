import { can } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AttributesClient } from "./attributes-client";
import { CORE_FIELDS, CORE_FIELD_KEYS, REMOVED_CORE_KEYS } from "@/lib/core-fields";

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
  { key: "inventoryStatusErp", label: "Inventory Status (ERP)", attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Status",          sortOrder: 1,  description: "Inventory status as reported by the ERP system" },
  { key: "projectFolder",      label: "Project Folder",         attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Status",          sortOrder: 2,  description: null },
  { key: "wrikeUrl",           label: "Wrike URL",              attributeType: "URL",     requirement: "OPTIONAL",    section: "Status",          sortOrder: 3,  description: "Link to the Wrike task/project" },
  { key: "warrantyInfo",       label: "Warranty Info",          attributeType: "TEXTAREA",requirement: "OPTIONAL",    section: "Regulatory",      sortOrder: 0,  description: null },
  { key: "htsCode",            label: "HTS Code",               attributeType: "TEXT",    requirement: "CONDITIONAL", section: "Regulatory",      sortOrder: 1,  description: "Harmonized Tariff Schedule code for customs" },
  { key: "htsCodeCanada",      label: "HTS Code (Canada)",      attributeType: "TEXT",    requirement: "CONDITIONAL", section: "Regulatory",      sortOrder: 2,  description: "Canadian Harmonized Tariff Schedule code" },
  { key: "productComposition", label: "Product Composition",    attributeType: "TEXT",    requirement: "CONDITIONAL", section: "Regulatory",      sortOrder: 3,  description: "Materials or ingredients list" },
  { key: "needsProp65",        label: "Needs Prop 65",          attributeType: "BOOLEAN", requirement: "CONDITIONAL", section: "Regulatory",      sortOrder: 4,  description: "California Prop 65 warning required" },
  { key: "batteriesRequired",  label: "Batteries Required",     attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Regulatory",      sortOrder: 5,  description: null },
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
  { key: "packagingLangType",  label: "Packaging Language Type",attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Product",         sortOrder: 9,  description: null },
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
  // Alt Carton
  { key: "altCartonGtin",      label: "Alt Carton GTIN",        attributeType: "GTIN",    requirement: "OPTIONAL",    section: "Alt Carton",      sortOrder: 0,  description: null },
  { key: "altCartonHeight",    label: "Alt Carton Height (in)", attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Alt Carton",      sortOrder: 1,  description: null },
  { key: "altCartonWidth",     label: "Alt Carton Width (in)",  attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Alt Carton",      sortOrder: 2,  description: null },
  { key: "altCartonLength",    label: "Alt Carton Length (in)", attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Alt Carton",      sortOrder: 3,  description: null },
  { key: "altCartonWeight",    label: "Alt Carton Weight (lbs)",attributeType: "DECIMAL", requirement: "OPTIONAL",    section: "Alt Carton",      sortOrder: 4,  description: null },
  { key: "altCartonType",      label: "Alt Carton Type",        attributeType: "TEXT",    requirement: "OPTIONAL",    section: "Alt Carton",      sortOrder: 5,  description: null },
  { key: "altCartonQty",       label: "Alt Carton Qty",         attributeType: "NUMBER",  requirement: "OPTIONAL",    section: "Alt Carton",      sortOrder: 6,  description: null },
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

// Safety net against drift between CORE_FIELDS (the authoritative typed-column
// list) and the richer seed metadata above: any core field missing from
// CORE_ATTR_SEEDS still gets a basic definition so it stays admin-manageable.
// This drift is exactly what previously let core fields (e.g. psir) lose their
// isCore flag and be deleted while their grid column lived on.
const SEED_TYPE_FOR_CORE_TYPE: Record<string, string> = {
  string: "TEXT",
  decimal: "DECIMAL",
  int: "NUMBER",
  boolean: "BOOLEAN",
};
const seededKeys = new Set<string>(CORE_ATTR_SEEDS.map((s) => s.key));
const ALL_CORE_SEEDS = [
  ...CORE_ATTR_SEEDS.map((s) => ({ ...s, section: s.section as string | null })),
  ...CORE_FIELDS.filter((f) => !seededKeys.has(f.key)).map((f, i) => ({
    key: f.key,
    label: f.label,
    attributeType: SEED_TYPE_FOR_CORE_TYPE[f.type] ?? "TEXT",
    requirement: "OPTIONAL",
    section: null as string | null,
    sortOrder: 100 + i,
    description: null as string | null,
  })),
];

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
      update: { sortOrder: i },
    });
    sectionMap.set(name, section.id);
  }

  // Upsert each core attribute definition
  for (const seed of ALL_CORE_SEEDS) {
    const sectionId = seed.section ? sectionMap.get(seed.section) ?? null : null;
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
      // Existing definitions keep their admin-configured section, label, and
      // visibility — the seed only guarantees the isCore flag stays correct
      update: {
        isCore: true,
      },
    });
  }

  // Fix any non-core attributes that were incorrectly flagged as core
  // (caused by the old schema default of isCore=true). Judged against the
  // full CORE_FIELD_KEYS list — using a partial list here previously
  // un-flagged real core fields, making them deletable.
  await prisma.attributeDefinition.updateMany({
    where: { key: { notIn: CORE_FIELD_KEYS }, isCore: true },
    data: { isCore: false },
  });

  // Purge definitions (and any stray values) for core fields that have been
  // fully removed from the schema. Without this their old definition rows
  // linger and, since their keys are no longer core, get treated as zombie
  // global EAV attributes — rendering empty columns on every project grid.
  if (REMOVED_CORE_KEYS.length > 0) {
    await prisma.productAttributeValue.deleteMany({
      where: { attributeDefinition: { key: { in: REMOVED_CORE_KEYS } } },
    });
    await prisma.attributeDefinition.deleteMany({ where: { key: { in: REMOVED_CORE_KEYS } } });
  }
}

export default async function AttributesPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) redirect("/dashboard");

  // Seed core attribute definitions (idempotent — safe to run every page load)
  await seedCoreAttributes().catch(() => {});

  const [attributes, sections, categories] = await Promise.all([
    // Include inactive (hidden) definitions so admins can re-enable them —
    // hiding is the supported way to remove a core column from grids/exports
    prisma.attributeDefinition.findMany({
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
