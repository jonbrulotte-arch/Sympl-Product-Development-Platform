// One-time migration to the product master model: ProductRecord.projectId /
// rowIndex become ProjectProduct link rows, and part numbers become unique.
//
//   npm run db:migrate-product-master            # migrate (no-op once done)
//   npm run db:migrate-product-master -- --check # report only, change nothing
//   npm run db:migrate-product-master -- --rename-archived-duplicates [--check]
//       Resolve duplicate part numbers whose extra copies are archived by
//       renaming those copies ("19968 (archived a1b2c3)"). Live products are
//       never renamed; aborts if a part number has two live products.
//   npm run db:migrate-product-master -- --recover
//       Repair for a database where `prisma db push` dropped the old columns
//       before this script ran: rebuilds missing product→project links from
//       each product's history. Combine with --check to preview.
//
// Must run BEFORE `prisma db push` on the release that removes
// ProductRecord.projectId (scripts/deploy-prod.sh does this). Everything runs in
// one transaction and is verified before the old columns are dropped; any
// failed check rolls back and exits non-zero so the deploy stops.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import fs from "fs";
import path from "path";
import { Pool, type PoolClient } from "pg";

const CHECK_ONLY = process.argv.includes("--check");
const RECOVER = process.argv.includes("--recover");
// Old-model archived rows (deleted from a grid) kept their part numbers; with
// this flag their copy is renamed so the live product keeps the number.
const RENAME_ARCHIVED = process.argv.includes("--rename-archived-duplicates");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function hasColumn(c: PoolClient, table: string, column: string) {
  const r = await c.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return r.rowCount! > 0;
}

async function hasTable(c: PoolClient, table: string) {
  const r = await c.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`, [table]);
  return r.rowCount! > 0;
}

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n  Nothing was changed.`);
  process.exit(1);
}

// Created here rather than by `prisma db push`, which treats a new unique
// constraint as possible data loss and would stop the deploy. Safe because the
// pre-flight has already proven there are no duplicates.
async function ensurePartNumberUnique(c: PoolClient) {
  const dup = await c.query(`
    SELECT btrim("partNumber") AS pn FROM "ProductRecord"
    WHERE btrim(coalesce("partNumber", '')) <> '' GROUP BY 1 HAVING count(*) > 1 LIMIT 10`);
  if (dup.rowCount) fail(`Duplicate part numbers exist: ${dup.rows.map((r) => r.pn).join(", ")}`);
  // Blank strings would collide with each other; trimmed/blank → NULL first.
  await c.query(`UPDATE "ProductRecord" SET "partNumber" = NULLIF(btrim("partNumber"), '')
                 WHERE "partNumber" IS DISTINCT FROM NULLIF(btrim("partNumber"), '')`);
  await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProductRecord_partNumber_key" ON "ProductRecord"("partNumber")`);
}

// Under the old model a product lived in exactly one project, and every
// product-level ActivityLog row and product comment recorded that projectId.
async function recoverLinks(c: PoolClient) {
  const { rows } = await c.query(`
    WITH unlinked AS (
      SELECT p.id, p."isArchived", p."createdAt", p."createdById", p."partNumber", p."itemName"
      FROM "ProductRecord" p
      WHERE NOT EXISTS (SELECT 1 FROM "ProjectProduct" l WHERE l."productId" = p.id)
    ),
    evidence AS (
      SELECT a."productId", a."projectId", CASE WHEN a.action IN ('CREATED', 'IMPORTED') THEN 0 ELSE 1 END AS pref, a."createdAt", 'history' AS src
      FROM "ActivityLog" a WHERE a."productId" IS NOT NULL AND a."projectId" IS NOT NULL
      UNION ALL
      SELECT cm."productId", cm."projectId", 2, cm."createdAt", 'comment'
      FROM "Comment" cm WHERE cm."productId" IS NOT NULL AND cm."projectId" IS NOT NULL
    ),
    best AS (
      SELECT DISTINCT ON (e."productId") e."productId", e."projectId", e.src
      FROM evidence e JOIN "Project" pr ON pr.id = e."projectId"
      ORDER BY e."productId", e.pref, e."createdAt" DESC
    )
    SELECT u.*, b."projectId", b.src, pr.name AS project_name
    FROM unlinked u
    LEFT JOIN best b ON b."productId" = u.id
    LEFT JOIN "Project" pr ON pr.id = b."projectId"
    ORDER BY b."projectId", u."createdAt"`);

  if (rows.length === 0) {
    console.log("  recover: every product already has a project link — nothing to do.");
    return;
  }
  const found = rows.filter((r) => r.projectId);
  const orphans = rows.filter((r) => !r.projectId);
  console.log(`\n  recover: ${rows.length} product(s) without a project link; project found for ${found.length}.`);
  for (const r of found) console.log(`    ${r.partNumber ?? "(no part number)"} — ${r.itemName ?? ""} → "${r.project_name}" (from ${r.src})${r.isArchived ? " [archived]" : ""}`);
  for (const r of orphans) console.log(`    ${r.partNumber ?? "(no part number)"} — ${r.itemName ?? ""} → no history found; left in the catalog without a project`);

  if (CHECK_ONLY) {
    console.log("\n  --check: no changes made.");
    return;
  }
  await c.query("BEGIN");
  for (const r of found) {
    await c.query(
      `INSERT INTO "ProjectProduct" ("id", "projectId", "productId", "rowIndex", "isArchived", "addedById", "createdAt")
       SELECT gen_random_uuid()::text, $1, $2,
              coalesce((SELECT max("rowIndex") + 1 FROM "ProjectProduct" WHERE "projectId" = $1), 0),
              $3, $4, $5
       ON CONFLICT ("projectId", "productId") DO NOTHING`,
      [r.projectId, r.id, r.isArchived, r.createdById, r.createdAt],
    );
  }
  await c.query("COMMIT");
  console.log(`  ✔ restored ${found.length} link(s).`);
}

async function main() {
  const c = await pool.connect();
  try {
    if (!(await hasColumn(c, "ProductRecord", "projectId"))) {
      console.log("Product master migration: already applied (ProductRecord.projectId no longer exists).");
      if (!CHECK_ONLY) await ensurePartNumberUnique(c);
      else {
        const d = await c.query(`SELECT btrim("partNumber") AS pn FROM "ProductRecord" WHERE btrim(coalesce("partNumber", '')) <> '' GROUP BY 1 HAVING count(*) > 1`);
        if (d.rowCount) console.warn(`  warning: duplicate part numbers must be resolved first: ${d.rows.map((r) => r.pn).join(", ")}`);
      }
      if (await hasTable(c, "ProjectProduct")) {
        const { rows } = await c.query(`
          SELECT (SELECT count(*) FROM "ProductRecord")::int AS products,
                 (SELECT count(*) FROM "ProjectProduct")::int AS links,
                 (SELECT count(*) FROM "ProductRecord" p WHERE NOT EXISTS (SELECT 1 FROM "ProjectProduct" l WHERE l."productId" = p.id))::int AS unlinked`);
        console.log(`  products=${rows[0].products} links=${rows[0].links} products-without-project=${rows[0].unlinked}`);
        if (RECOVER) await recoverLinks(c);
        else if (rows[0].unlinked > 0 && rows[0].links === 0) {
          console.warn("  warning: no product is linked to any project. If the old columns were dropped by `prisma db push`,");
          console.warn("  run with --recover to rebuild the links from product history.");
        }
      }
      return;
    }

    // ── Pre-flight ────────────────────────────────────────────────────────────
    const { rows: [totals] } = await c.query(`
      SELECT count(*)::int AS products,
             count(*) FILTER (WHERE "isArchived")::int AS archived,
             count(DISTINCT "projectId")::int AS projects,
             count(*) FILTER (WHERE "partNumber" IS NULL OR btrim("partNumber") = '')::int AS blank_part_numbers
      FROM "ProductRecord"`);
    console.log("Product master migration — pre-flight");
    console.log(`  products: ${totals.products} (${totals.archived} archived) across ${totals.projects} projects`);
    console.log(`  products without a part number: ${totals.blank_part_numbers}`);

    const dupes = await c.query(`
      SELECT btrim("partNumber") AS pn, count(*)::int AS n,
             string_agg(p.id || ' in "' || pr.name || '"' || CASE WHEN p."isArchived" THEN ' (archived)' ELSE '' END, '; ') AS rows
      FROM "ProductRecord" p JOIN "Project" pr ON pr.id = p."projectId"
      WHERE btrim(coalesce("partNumber", '')) <> ''
      GROUP BY btrim("partNumber") HAVING count(*) > 1 ORDER BY 1`);
    const renames: { id: string; from: string; to: string }[] = [];
    if (dupes.rowCount) {
      console.error(`\n  ${dupes.rowCount} part number(s) are used by more than one product record:`);
      for (const d of dupes.rows) console.error(`    ${d.pn} ×${d.n}: ${d.rows}`);
      if (!RENAME_ARCHIVED) {
        fail("Part numbers must be unique in the product master. Merge or renumber the records above,\n  or re-run with --rename-archived-duplicates to rename the archived copies.");
      }
      const { rows: members } = await c.query(`
        SELECT id, btrim("partNumber") AS pn, "partNumber" AS raw, "isArchived", "updatedAt"
        FROM "ProductRecord"
        WHERE btrim("partNumber") IN (
          SELECT btrim("partNumber") FROM "ProductRecord" WHERE btrim(coalesce("partNumber", '')) <> ''
          GROUP BY 1 HAVING count(*) > 1)
        ORDER BY btrim("partNumber"), "isArchived", "updatedAt" DESC`);
      const groups = new Map<string, typeof members>();
      for (const m of members) groups.set(m.pn, [...(groups.get(m.pn) ?? []), m]);
      const blocked: string[] = [];
      for (const [pn, rows] of groups) {
        const live = rows.filter((r) => !r.isArchived);
        if (live.length > 1) { blocked.push(pn); continue; }
        // Keep the live product (or, if all are archived, the most recently updated one).
        const keep = live[0] ?? rows[0];
        for (const r of rows) if (r.id !== keep.id) renames.push({ id: r.id, from: r.raw, to: `${pn} (archived ${r.id.slice(-6)})` });
      }
      if (blocked.length) {
        fail(`These part numbers are used by more than one LIVE product, which can't be resolved automatically: ${blocked.join(", ")}`);
      }
      console.log(`\n  --rename-archived-duplicates: ${renames.length} archived cop${renames.length === 1 ? "y" : "ies"} will be renamed:`);
      for (const r of renames) console.log(`    ${r.from} → ${r.to}`);
    }
    const caseDupes = await c.query(`
      SELECT lower(btrim("partNumber")) AS pn, string_agg(DISTINCT btrim("partNumber"), ', ') AS variants
      FROM "ProductRecord" WHERE btrim(coalesce("partNumber", '')) <> ''
      GROUP BY lower(btrim("partNumber")) HAVING count(DISTINCT btrim("partNumber")) > 1`);
    for (const d of caseDupes.rows) console.warn(`  warning: part numbers differ only by case: ${d.variants} (kept as separate products)`);
    if (!renames.length) console.log("  duplicate part numbers: none ✓");

    if (CHECK_ONLY) {
      console.log("\n--check: pre-flight passed; no changes made.");
      return;
    }

    // ── Backup of what is about to change ───────────────────────────────────
    const snapshot = await c.query(`SELECT id, "projectId", "rowIndex", "isArchived", "partNumber" FROM "ProductRecord" ORDER BY "projectId", "rowIndex"`);
    const dir = path.join(process.cwd(), "backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `product-master-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(file, JSON.stringify(snapshot.rows, null, 1));
    console.log(`  backup of product→project assignments: ${file}`);

    // ── Migrate (single transaction) ────────────────────────────────────────
    await c.query("BEGIN");
    for (const r of renames) {
      await c.query(`UPDATE "ProductRecord" SET "partNumber" = $1 WHERE id = $2`, [r.to, r.id]);
    }
    await c.query(`
      CREATE TABLE IF NOT EXISTS "ProjectProduct" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "rowIndex" INTEGER NOT NULL DEFAULT 0,
        "isArchived" BOOLEAN NOT NULL DEFAULT false,
        "addedById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProjectProduct_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "ProjectProduct_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ProjectProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectProduct_projectId_productId_key" ON "ProjectProduct"("projectId", "productId")`);
    await c.query(`CREATE INDEX IF NOT EXISTS "ProjectProduct_productId_idx" ON "ProjectProduct"("productId")`);
    await c.query(`CREATE INDEX IF NOT EXISTS "ProjectProduct_projectId_isArchived_rowIndex_idx" ON "ProjectProduct"("projectId", "isArchived", "rowIndex")`);

    // A product archived under the old model had been deleted from its project's
    // grid, so its link is archived too; the product stays archived in the catalog.
    const inserted = await c.query(`
      INSERT INTO "ProjectProduct" ("id", "projectId", "productId", "rowIndex", "isArchived", "addedById", "createdAt")
      SELECT gen_random_uuid()::text, p."projectId", p.id, p."rowIndex", p."isArchived", p."createdById", p."createdAt"
      FROM "ProductRecord" p
      ON CONFLICT ("projectId", "productId") DO NOTHING`);
    const trimmed = await c.query(`
      UPDATE "ProductRecord" SET "partNumber" = NULLIF(btrim("partNumber"), '')
      WHERE "partNumber" IS DISTINCT FROM NULLIF(btrim("partNumber"), '')`);

    // ── Verify before dropping anything ──────────────────────────────────────
    const { rows: [v] } = await c.query(`
      SELECT
        (SELECT count(*) FROM "ProductRecord")::int AS products,
        (SELECT count(*) FROM "ProjectProduct")::int AS links,
        (SELECT count(*) FROM "ProductRecord" p
           WHERE NOT EXISTS (SELECT 1 FROM "ProjectProduct" l
             WHERE l."productId" = p.id AND l."projectId" = p."projectId"
               AND l."rowIndex" = p."rowIndex" AND l."isArchived" = p."isArchived"))::int AS mismatched,
        (SELECT count(*) FROM (SELECT "productId" FROM "ProjectProduct" GROUP BY 1 HAVING count(*) > 1) x)::int AS multi_linked`);
    console.log(`\n  links created: ${inserted.rowCount}  part numbers trimmed/blank→null: ${trimmed.rowCount}`);
    console.log(`  verify: products=${v.products} links=${v.links} mismatched=${v.mismatched} multi-linked=${v.multi_linked}`);
    if (v.links !== v.products || v.mismatched !== 0 || v.multi_linked !== 0) {
      await c.query("ROLLBACK");
      fail("Verification failed — the migration was rolled back.");
    }

    await c.query(`ALTER TABLE "ProductRecord" DROP COLUMN "projectId", DROP COLUMN "rowIndex"`);
    await ensurePartNumberUnique(c);
    await c.query("COMMIT");
    console.log("\n✔ Product master migration complete. Run `npx prisma db push` next (the deploy script does this).");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
