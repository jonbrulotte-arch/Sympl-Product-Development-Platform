import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Merges one attribute definition into another: moves every stored
// ProductAttributeValue from the source definition to the target, copies any
// LOV items the target is missing, then deactivates the source. Used to
// repair duplicate definitions (same label, different keys) where values
// were written under one definition while grids bind to the other.
//
// Dry run (default — writes nothing):
//   npx tsx scripts/merge-duplicate-attribute.ts <sourceKey> <targetKey>
// Apply:
//   npx tsx scripts/merge-duplicate-attribute.ts <sourceKey> <targetKey> --apply
// Keep the source definition active (when it legitimately serves another
// category and only misdirected values are being moved):
//   npx tsx scripts/merge-duplicate-attribute.ts <sourceKey> <targetKey> --apply --keep-source-active

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL environment variable is not set");
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  const [sourceKey, targetKey] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  const keepSourceActive = process.argv.includes("--keep-source-active");
  if (!sourceKey || !targetKey) {
    console.error("Usage: merge-duplicate-attribute.ts <sourceKey> <targetKey> [--apply]");
    process.exit(1);
  }

  const source = await prisma.attributeDefinition.findUnique({
    where: { key: sourceKey },
    include: { lovItems: true, _count: { select: { values: true } } },
  });
  const target = await prisma.attributeDefinition.findUnique({
    where: { key: targetKey },
    include: { lovItems: true, _count: { select: { values: true } } },
  });
  if (!source) throw new Error(`Source attribute "${sourceKey}" not found`);
  if (!target) throw new Error(`Target attribute "${targetKey}" not found`);
  if (source.id === target.id) throw new Error("Source and target are the same definition");

  console.log(`Source: "${source.label}" key=${source.key} active=${source.isActive} storedValues=${source._count.values}`);
  console.log(`Target: "${target.label}" key=${target.key} active=${target.isActive} storedValues=${target._count.values}`);
  console.log(apply ? "\nAPPLY mode — writing changes.\n" : "\nDRY RUN — nothing will be written. Re-run with --apply to execute.\n");

  // Move values product-by-product. If the target already has values for a
  // product, the target wins and the source rows for that product are
  // reported (and deleted on apply) rather than merged, to avoid mixing
  // values from two definitions on one product.
  const sourceValues = await prisma.productAttributeValue.findMany({
    where: { attributeDefinitionId: source.id },
    include: { product: { select: { partNumber: true } } },
    orderBy: [{ productId: "asc" }, { valueIndex: "asc" }],
  });
  const targetValueProducts = new Set(
    (await prisma.productAttributeValue.findMany({
      where: { attributeDefinitionId: target.id },
      select: { productId: true },
    })).map((v) => v.productId)
  );

  let moved = 0;
  let dropped = 0;
  for (const v of sourceValues) {
    const val = v.textValue ?? v.numberValue?.toString() ?? String(v.booleanValue);
    if (targetValueProducts.has(v.productId)) {
      dropped++;
      console.log(`  CONFLICT part=${v.product.partNumber} [${v.valueIndex}] ${JSON.stringify(val)} — target already has values for this product; source row will be deleted`);
      if (apply) await prisma.productAttributeValue.delete({ where: { id: v.id } });
    } else {
      moved++;
      console.log(`  MOVE     part=${v.product.partNumber} [${v.valueIndex}] ${JSON.stringify(val)}`);
      if (apply) {
        await prisma.productAttributeValue.update({
          where: { id: v.id },
          data: { attributeDefinitionId: target.id },
        });
      }
    }
  }

  // Copy LOV items the target lacks so moved values still resolve to options.
  const targetLov = new Set(target.lovItems.map((l) => l.value.toLowerCase()));
  for (const lov of source.lovItems) {
    if (targetLov.has(lov.value.toLowerCase())) continue;
    console.log(`  LOV copy "${lov.value}" -> ${target.key}`);
    if (apply) {
      await prisma.lovItem.create({
        data: {
          attributeDefinitionId: target.id,
          value: lov.value,
          label: lov.label,
          sortOrder: lov.sortOrder,
          isActive: lov.isActive,
        },
      });
    }
  }

  if (apply && source.isActive && !keepSourceActive) {
    await prisma.attributeDefinition.update({ where: { id: source.id }, data: { isActive: false } });
    console.log(`\nDeactivated source definition "${source.key}".`);
  } else if (source.isActive && keepSourceActive) {
    console.log(`\nSource definition "${source.key}" stays active (--keep-source-active).`);
  }

  console.log(`\n${apply ? "Done" : "Would move"}: ${moved} value(s) moved, ${dropped} conflicting source row(s) ${apply ? "deleted" : "to delete"}.`);
  if (!apply) console.log("Re-run with --apply to execute.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
