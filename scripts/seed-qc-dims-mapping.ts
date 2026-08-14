// Applies the default QC Dims column mappings to existing attributes.
//
// Idempotent and non-destructive: it only fills a mapping that is currently
// unset, and skips any column another attribute already claims. Safe to re-run.
//
//   npm run db:seed-qc-dims

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" }); // fallback — dotenv skips vars already set
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { QC_DIMS_DEFAULT_MAPPINGS } from "../src/lib/qc-dims";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  let mapped = 0;
  const skipped: string[] = [];
  const missing: string[] = [];

  for (const [key, column] of QC_DIMS_DEFAULT_MAPPINGS) {
    const attr = await prisma.attributeDefinition.findUnique({ where: { key } });
    if (!attr) {
      missing.push(`${key} → ${column}`);
      continue;
    }
    if (attr.qcDimsColumn) {
      skipped.push(`${key} already mapped to "${attr.qcDimsColumn}"`);
      continue;
    }

    // The column is unique, so another attribute holding it means someone
    // remapped deliberately — leave their choice alone.
    const holder = await prisma.attributeDefinition.findUnique({
      where: { qcDimsColumn: column },
    });
    if (holder) {
      skipped.push(`"${column}" already held by ${holder.key}`);
      continue;
    }

    await prisma.attributeDefinition.update({
      where: { id: attr.id },
      data: { qcDimsColumn: column },
    });
    mapped++;
  }

  console.log(`Mapped ${mapped} of ${QC_DIMS_DEFAULT_MAPPINGS.length} QC Dims columns.`);
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
  if (missing.length) {
    console.log(`\nNo such attribute (${missing.length}):`);
    for (const m of missing) console.log(`  - ${m}`);
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
