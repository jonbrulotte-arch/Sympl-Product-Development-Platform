// Seeds the PSIR Generator library from the CTQ PSIR blank template.
//
//   npm run db:seed-psir                         # global sections, lines, sampling levels
//   npm run db:seed-psir -- "Circular Saw Blades" # also seed that existing category from the sample PSIR
//
// Idempotent: global data is only inserted when no global lines exist yet, and
// the category seed is skipped if that category already has PSIR lines or overrides.
// Categories are never created here; the named category must already exist.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient, type PsirSheet } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never);

// [name, requirement, actualFindings, samplingLevel, aql]
type L = [string, string | null, string | null, string, string];

const CARTON_DROP =
  "Drop carton from designated height by weight per ISTA 2A standards (see Product Information tab). \n10 drops total, no less than once on each face of carton and on corner.\nVerify no cracks or breakage of packaged product.";

const dims = (prefix: string, label: string): L[] => [
  [`${label} Length`, `Length: {${prefix} Length (cm)} ± 3% cm / {${prefix} Length (in)} ± 3% in`, "Ruler / Tape Measure", "S-2", "2.5"],
  [`${label} Width`, `Width: {${prefix} Width (cm)} ± 3% cm / {${prefix} Width (in)} ± 3% in`, "Ruler / Tape Measure", "S-2", "2.5"],
  [`${label} Height`, `Height: {${prefix} Height (cm)} ± 3% cm / {${prefix} Height (in)} ± 3% in`, "Ruler / Tape Measure", "S-2", "2.5"],
  [`${label} Weight`, `Weight: {${prefix} Weight (kg)} ± 3% kg / {${prefix} Weight (lbs)} ± 3% lbs`, "Scale", "S-2", "2.5"],
];

const GLOBAL: { section: string; lines: L[] }[] = [
  {
    section: "Pallet / Slipsheet Packaging",
    lines: [
      ["Packaging Type", "Product is Palletized on a GMA Wood Pallet", "Visual", "S-2", "2.5"],
      ["Pallet Length", "Length: {Pallet Length}", "Ruler / Tape Measure", "S-2", "2.5"],
      ["Pallet Width", "Width: {Pallet Width}", "Ruler / Tape Measure", "S-2", "2.5"],
      ["Loaded Pallet Height", "Height: Do not exceed {Max Pallet Height}", "Ruler / Tape Measure", "S-2", "2.5"],
      ["Loaded Pallet Weight", "Weight: Do not exceed {Max Pallet Weight}", "Scale", "S-2", "2.5"],
      ["Pallet Qty.", "Verify product quantity per packing slip.", "Visual / Document Check", "S-2", "2.5"],
      ["Characteristics of Pallet Load", "Product is shrink wrapped securely with at least 80% of the top of the load free from shrink wrap.", "Visual", "S-2", "2.5"],
      ["IPPC Stamp", "Pallet is stamped and meets ISPM 15 HT standards", "Visual", "S-2", "2.5"],
      ["Pallet Loading Condition", "Pallet load has heaviest product at the bottom and lightest product at the top. The load is evenly distributed. Corners are aligned to allow safe double stacking. Straps and/or corner supports are used when needed.", "Visual", "S-2", "2.5"],
    ],
  },
  {
    section: "Master Carton Packaging",
    lines: [
      ...dims("Master Carton", "Master Carton"),
      ["Quantity in Carton", "Number of units packed into master carton: {Master Carton Qty}", "Visual", "S-2", "2.5"],
      ["Master Carton Label", "Verify Label Information", "Visual", "S-2", "2.5"],
      ["Master Carton Barcode", "Check barcode scanned output and printed barcode number match: {Master Carton GTIN}", "Visual and Barcode Scanner", "S-2", "2.5"],
      ["Corrugate Box Condition", "Verify box is free from holes through corrugate, damage to corrugate, wetness, grease, mold, or other biologic / chemical contaminants", "Visual", "S-2", "2.5"],
      ["Carton durability", CARTON_DROP, "ISTA 2A", "S-2", "2.5"],
    ],
  },
  {
    section: "Inner Carton Packaging",
    lines: [
      ...dims("Inner Carton", "Inner Carton"),
      ["Quantity in Carton", "Number of units packed into inner carton: {Inner Carton Qty}", "Visual", "S-2", "2.5"],
      ["Inner Carton Label", "Verify Label Information", "Visual", "S-2", "2.5"],
      ["Inner Carton Barcode", "Check barcode scanned output and printed barcode number match: {Inner Carton GTIN}", "Visual and Barcode Scanner", "S-2", "2.5"],
      ["Carton Condition", "Verify carton is free from holes, damage, wetness, grease, mold, or other biologic / chemical contaminants", "Visual", "S-2", "2.5"],
      ["Carton durability", CARTON_DROP, "ISTA 2A", "S-2", "2.5"],
    ],
  },
  {
    section: "Product Level Packaging",
    lines: [
      ["Packaging Type", "{Packaging Type}", "Visual", "S-2", "2.5"],
      ...dims("Packaging", "Packaging"),
      ["Quantity per Sellable Unit", "Number of pieces per sellable unit: {Pieces per Sellable Unit}", "Visual", "S-2", "2.5"],
      ["Product Barcode", "Check barcode scanned output and printed barcode number match: {UPC}", "Visual and Barcode Scanner", "S-2", "2.5"],
      ["Packaging condition", "Verify Package is in good condition with no damage or contaminates.", "Visual", "S-2", "2.5"],
      ["Packaging Artwork Present", "See Product Information Tab", "Visual", "S-2", "2.5"],
      ["Anti-theft Tag Present", "Anti-theft tag is present, in outlined location, and functioning properly", "Visual and EAS Tester", "S-2", "2.5"],
    ],
  },
  {
    section: "General Batch Inspection",
    lines: [["Product Materials", "{Product Materials}", "Document Check", "1 per Batch", "0"]],
  },
  {
    section: "Product Appearance (as inspected with primary packaging such as shrink film removed)",
    lines: [
      ["Product Finish", "{Product Finish}", "Visual", "S-3", "4"],
      ["Product Color", "{Product Color}", "Visual", "S-3", "2.5"],
      ["Markings", "{Markings}", "Visual", "S-3", "2.5"],
      ["Cosmetic Condition", "Free of any visible rust. Free of pitting, discoloration, scratches, chips, or other imperfections visible when held at arm's length (18 - 24 in / 45 - 60 cm from eyes)", "Visual", "S-3", "2.5"],
      ["Cosmetic Condition", "Free from excess oil, grease, metal chips, dirt, or other foreign debris", "Visual", "S-3", "2.5"],
    ],
  },
];

const SAMPLING_LEVELS = ["S-1", "S-2", "S-3", "S-4", "I", "II", "III", "1 per Batch", "Tested each Quarter"];

// ── Circular Saw Blades, from "CTQ PSIR Template - Circular Saw Blades.xlsx" ──
type Ovr = { section: string; name: string; nth?: number; hidden?: boolean; requirement?: string };
const SAW_OVERRIDES: Ovr[] = [
  { section: "Master Carton Packaging", name: "Master Carton Label", requirement: "Artwork is applied with 2 sticker labels placed on adjacent sides of carton." },
  { section: "Inner Carton Packaging", name: "Inner Carton Label", requirement: "Artwork is applied with 2 sticker labels placed on adjacent sides of carton." },
  { section: "Product Level Packaging", name: "Packaging Type", requirement: "Printed Taco Card with edge shrink and hang tag" },
  { section: "Product Level Packaging", name: "Packaging condition", requirement: "Packaging is clear and defined. No cracking or flaking present. Verify no holes, scratches, wetness, grease, dirt, or other contaminants are visible when viewed from arm's length (18 - 24 in / 45 - 60 cm from eyes)\nPrinting is legible and free of skips, smears and ghosting (off- registration)." },
  { section: "Product Level Packaging", name: "Anti-theft Tag Present", requirement: "Anti-theft tag is present, in outlined location, and functioning properly (only applicable in kit configurations)" },
  { section: "General Batch Inspection", name: "Product Materials", hidden: true },
  { section: "Product Appearance (as inspected with primary packaging such as shrink film removed)", name: "Product Finish", requirement: "Logo Color: {Logo Color}  Finish: Semi Matte\nBlade Color: {Blade Color} Finish: Semi Matte\nAccent Colors: {Accent Colors} Finish: Semi Matte" },
  { section: "Product Appearance (as inspected with primary packaging such as shrink film removed)", name: "Product Color", hidden: true },
  { section: "Product Appearance (as inspected with primary packaging such as shrink film removed)", name: "Markings", hidden: true },
  { section: "Product Appearance (as inspected with primary packaging such as shrink film removed)", name: "Cosmetic Condition", nth: 0, hidden: true },
  { section: "Product Appearance (as inspected with primary packaging such as shrink film removed)", name: "Cosmetic Condition", nth: 1, hidden: true },
];

const SAW_PSIR_DATA: { section: string; sortOrder: number; line: L }[] = [
  { section: "Product Level Packaging", sortOrder: 7, line: ["Package color printing", "Review against artwork and color check against Pantone codes", "Visual", "S-2", "2.5"] },
  ...([
    ["Body Material", "{Body Material}", "Document Check", "1 per Batch", "0"],
    ["Teeth Material", "{Teeth Material}", "Document Check", "1 per Batch", "0"],
    ["Polymer Filler", "{Polymer Filler}", "Document Check", "1 per Batch", "0"],
    ["Non-stick Coating", "{Non-stick Coating}", "Visual", "1 per Batch", "0"],
    ["Paint RoHS Compliance", "RoHS standard compliance test reports", "Lab Test / Document Check", "Tested each Quarter", "0"],
    ["PFAS Compliance", "Confirm all coating, paint, ink, and materials do not have PFAS", "Lab Test / Document Check", "Tested each Quarter", "0"],
    ["Blade Print Adhesion", "Review adhesion testing document for each shift during production of item. {Factory} will follow the same test performed with 3M 600 tape. \nNote: Cure time for printing is 24hrs. Blades printed the day before will be tested.\n\n*JSP Team will randomly conduct this check every quarter.", "JSP Random Quarterly Checks / Document Check of Factory's Running Log", "Adhesion test twice per shift", "0"],
  ] as L[]).map((line, i) => ({ section: "General Batch Inspection", sortOrder: 10 + i, line })),
  ...([
    ["Specification Markings", "See Product Information Tab", "Visual", "S-3", "1"],
    ["Cosmetic Condition - 1", "All surfaces shall have no oxide, no rust or grinding marks, no scratches, burrs, or weld splatters on outside or inside when inspected at arm's length (18 - 24 in / 45 - 60 cm from eyes).", "Visual", "S-3", "2.5"],
    ["Cosmetic Condition - 2", "Printed logo or markings should not be translucent (substrate color should not be visible). Paint should be free of fingerprints or grinding marks. All characters or letters should look sharp, even, and without air pockets.", "Visual", "S-3", "2.5"],
    ["Cosmetic Condition - 3", "IF APPLICABLE: Diamond knock out is cut cleanly with a consistent line and is free of excess material or burrs.", "Visual", "S-3", "2.5"],
    ["Cosmetic Condition - 4", "All carbide teeth are present, appear to be sharp and not blunt or chipped.", "Visual", "S-3", "2.5"],
  ] as L[]).map((line, i) => ({ section: "Product Appearance (as inspected with primary packaging such as shrink film removed)", sortOrder: 10 + i, line })),
];

const SAW_MEASUREMENTS: L[] = [
  ["Overall Dimension -\nSaw OD", "{Saw OD}", "Vernier Caliper", "S-2", "1"],
  ["Material Thickness -\nCoated Saw Body", "{Body Thickness}", "Vernier Caliper", "S-2", "1"],
  ["Arbor Hole Diameter Round - Saw Body", "{Arbor Hole Diameter}", "Vernier Caliper", "S-2", "1"],
  ["Diamond Knock Out", "Height: {Diamond Knock Out Height}", "Vernier Caliper", "S-2", "1"],
  ["Diamond Knock Out", "Width: {Diamond Knock Out Width}", "Vernier Caliper", "S-2", "1"],
  ["Diamond Knock Out", "Flat to Flat: {Diamond Knock Out Flat to Flat}", "Vernier Caliper", "S-2", "1"],
  ["Tooth - Kerf", "{Kerf}", "Vernier Caliper", "S-2", "1"],
  ["Tooth - Hook Angle", "{Hook Angle}", "Optical Comparator / CMM", "S-2", "1"],
  ["Vent Placement and Overall Size", "See Product Information Tab", "Vernier Caliper / Visual", "S-2", "1"],
  ["Steel Body Hardness", "HRc: {Steel Body Hardness}", "Rockwell Tester", "S-2", "1"],
  ["Tooth Hardness - Carbide", "HRa: {Tooth Hardness}", "Mohs Hardness Test Kit", "S-2", "1"],
];

const SAW_FUNCTIONAL: L[] = [
  ["Arbor Hole Diameter and Diamond Knock Out - Saw Body", "Arbor - {Arbor Size}", "Functional Check and measurement", "S-2", "1"],
  ["Bonding of Carbide Tooth to Saw Body", "Review {Factory} Documents", "Factory Review and Documentation", "S-2", "1"],
  ["Diamond Knock Out - Removal", "Validate that the diamond knock out can be removed easily and does not leave behind excess saw body", "Twisting Action to remove", "S-2", "1"],
  ["Diamond Knock Out Fitment Check", "Verify that the cutout of the diamond knock out fits the diamond arbor correctly", "Fitment check", "S-2", "1"],
  ["Flatness Verification", "Lay saw blade flat on table, place edge ruler on body making sure ruler is not laying on the diamond areas but rather in the relief holes, verify flatness on both sides measuring any uneven areas. (see Product Information tab)\nMust be below 0.3 mm / 0.011 in", "Edge Ruler", "S-2", "1"],
  ["Verify Tooth Grind Type", "{Tooth Grind}", "Visual", "S-2", "1"],
  ["Blade Print Adhesion", "ADHESION TEST - 3M 600 tape used, 1/2in wide tape across full face of blade applied to full face of blade at 270 degrees across to 90 degree and pulled perpendicular to blade quickly. Work out air bubbles and tape must be pulled before 1 minute. Perform test on front and back of blade. No print can come up. \n** Important to have tape cover many different sizes of text and icons. Single printed blades need to have the warning section of small text tested towards the bottom of the blade", "Function Check and Visual", "S-3", "2.5"],
];

const lineData = ([name, requirement, actualFindings, samplingLevel, aql]: L) => ({ name, requirement, actualFindings, samplingLevel, aql });

async function seedGlobal() {
  for (const [i, label] of SAMPLING_LEVELS.entries()) {
    await prisma.psirSamplingLevel.upsert({ where: { label }, update: {}, create: { label, sortOrder: i } });
  }
  if (await prisma.psirTemplateLine.count({ where: { categoryId: null } })) {
    console.log("Global PSIR lines already exist — skipping global seed.");
    return;
  }
  for (const [si, s] of GLOBAL.entries()) {
    const section = await prisma.psirTemplateSection.create({ data: { name: s.section, sortOrder: (si + 1) * 10 } });
    await prisma.psirTemplateLine.createMany({
      data: s.lines.map((l, li) => ({ ...lineData(l), sheet: "PSIR_DATA" as PsirSheet, sectionId: section.id, sortOrder: li })),
    });
  }
  console.log(`Seeded ${GLOBAL.length} sections and ${GLOBAL.reduce((n, s) => n + s.lines.length, 0)} global lines.`);
}

async function seedSawBlades(categoryName: string) {
  const cat = await prisma.category.findFirst({ where: { name: { equals: categoryName, mode: "insensitive" } } });
  if (!cat) {
    console.log(`Category "${categoryName}" not found — create it in Admin > Categories, then re-run.`);
    return;
  }
  const existing = await prisma.psirTemplateLine.count({ where: { categoryId: cat.id } })
    + await prisma.psirTemplateLineOverride.count({ where: { categoryId: cat.id } });
  if (existing) {
    console.log(`"${cat.name}" already has PSIR lines/overrides — skipping.`);
    return;
  }
  const sections = new Map((await prisma.psirTemplateSection.findMany()).map((s) => [s.name, s.id]));

  for (const o of SAW_OVERRIDES) {
    const matches = await prisma.psirTemplateLine.findMany({
      where: { categoryId: null, sectionId: sections.get(o.section), name: o.name },
      orderBy: { sortOrder: "asc" },
    });
    const line = matches[o.nth ?? 0];
    if (!line) { console.warn(`  ! no global line "${o.section} / ${o.name}"`); continue; }
    await prisma.psirTemplateLineOverride.create({
      data: { lineId: line.id, categoryId: cat.id, hidden: o.hidden ?? null, requirement: o.requirement ?? null },
    });
  }
  await prisma.psirTemplateLine.createMany({
    data: [
      ...SAW_PSIR_DATA.map((x) => ({ ...lineData(x.line), sheet: "PSIR_DATA" as PsirSheet, sectionId: sections.get(x.section) ?? null, sortOrder: x.sortOrder, categoryId: cat.id })),
      ...SAW_MEASUREMENTS.map((l, i) => ({ ...lineData(l), sheet: "PRODUCT_MEASUREMENTS" as PsirSheet, sortOrder: i, categoryId: cat.id })),
      ...SAW_FUNCTIONAL.map((l, i) => ({ ...lineData(l), sheet: "FUNCTIONAL_INSPECTIONS" as PsirSheet, sortOrder: i, categoryId: cat.id })),
    ],
  });
  console.log(`Seeded PSIR template for "${cat.name}".`);
}

async function main() {
  await seedGlobal();
  const categoryName = process.argv[2];
  if (categoryName) await seedSawBlades(categoryName);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
