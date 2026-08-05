import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Diagnoses attribute definition/value mismatches that make stored values
// invisible in the grid: duplicate definitions sharing a label, values
// attached to inactive or orphaned definitions, and category scoping.
//
// Usage:
//   npx tsx scripts/diagnose-attributes.ts "Drive Size" "Socket Size"
// (no args = report every attribute definition that shares a label with another)

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL environment variable is not set");
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  const terms = process.argv.slice(2);

  const allDefs = await prisma.attributeDefinition.findMany({
    include: { category: { select: { id: true, name: true } }, _count: { select: { values: true } } },
    orderBy: { label: "asc" },
  });

  const matching = terms.length
    ? allDefs.filter((d) => terms.some((t) => d.label.toLowerCase().includes(t.toLowerCase()) || d.key.toLowerCase().includes(t.toLowerCase())))
    : allDefs;

  console.log(`\n=== Attribute definitions ${terms.length ? `matching ${JSON.stringify(terms)}` : "(all)"} ===`);
  for (const d of matching) {
    console.log(
      `  label="${d.label}"  key=${d.key}  id=${d.id}\n` +
      `    type=${d.attributeType}  maxValues=${d.maxValues}  isActive=${d.isActive}  isCore=${d.isCore}\n` +
      `    category=${d.category ? `${d.category.name} (${d.category.id})` : "GLOBAL (null)"}  storedValues=${d._count.values}`
    );
  }

  // Duplicate labels across the WHOLE table — the classic cause of values
  // living under one definition while the grid column is bound to another.
  const byLabel = new Map<string, typeof allDefs>();
  for (const d of allDefs) {
    const k = d.label.trim().toLowerCase();
    if (!byLabel.has(k)) byLabel.set(k, []);
    byLabel.get(k)!.push(d);
  }
  const dupes = [...byLabel.values()].filter((v) => v.length > 1);
  console.log(`\n=== Definitions sharing a label (${dupes.length} label${dupes.length === 1 ? "" : "s"}) ===`);
  for (const group of dupes) {
    console.log(`  "${group[0].label}":`);
    for (const d of group) {
      console.log(`    key=${d.key}  id=${d.id}  active=${d.isActive}  category=${d.category?.name ?? "GLOBAL"}  storedValues=${d._count.values}`);
    }
  }
  if (dupes.length === 0) console.log("  none");

  // Every stored value for the matching definitions, with its product.
  const defIds = matching.map((d) => d.id);
  if (defIds.length) {
    const values = await prisma.productAttributeValue.findMany({
      where: { attributeDefinitionId: { in: defIds } },
      include: {
        attributeDefinition: { select: { key: true, label: true, isActive: true } },
        product: { select: { partNumber: true, isArchived: true, projectId: true, categoryId: true } },
      },
      orderBy: [{ attributeDefinitionId: "asc" }, { valueIndex: "asc" }],
    });
    console.log(`\n=== Stored values for matching definitions (${values.length}) ===`);
    for (const v of values) {
      console.log(
        `  part=${v.product.partNumber}  attr=${v.attributeDefinition.key} [${v.valueIndex}]  ` +
        `value=${JSON.stringify(v.textValue ?? v.numberValue?.toString() ?? v.booleanValue)}  ` +
        `defActive=${v.attributeDefinition.isActive}  productArchived=${v.product.isArchived}  productCategory=${v.product.categoryId}`
      );
    }
    if (values.length === 0) console.log("  none");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
