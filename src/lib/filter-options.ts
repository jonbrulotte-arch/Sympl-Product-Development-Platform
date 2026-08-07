// Values that populate filter dropdowns.
//
// The inventory-status lists are DISTINCT scans over ProductRecord — cheap per
// row but proportional to the table, and they used to run on every render of
// the products browser before anything appeared on screen. They change only
// when someone edits a product's status, so a short server-side cache removes
// them from the critical path without going stale in any way a user notices.

import { prisma } from "@/lib/prisma";

const TTL_MS = 5 * 60 * 1000;

let cache: { values: string[]; expiresAt: number } | null = null;

/** Distinct inventory statuses across both the Sympl and ERP status fields. */
export async function getInventoryStatuses(): Promise<string[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.values;

  const [statusRows, erpStatusRows] = await Promise.all([
    prisma.productRecord.findMany({
      where: { isArchived: false, inventoryStatus: { not: null } },
      select: { inventoryStatus: true },
      distinct: ["inventoryStatus"],
    }),
    prisma.productRecord.findMany({
      where: { isArchived: false, inventoryStatusErp: { not: null } },
      select: { inventoryStatusErp: true },
      distinct: ["inventoryStatusErp"],
    }),
  ]);

  // Stored values can hold several comma/newline-separated statuses per row.
  const split = (v: string) => v.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const values = [...new Set([
    ...statusRows.flatMap((r) => split(r.inventoryStatus!)),
    ...erpStatusRows.flatMap((r) => split(r.inventoryStatusErp!)),
  ])].sort();

  cache = { values, expiresAt: Date.now() + TTL_MS };
  return values;
}

/** Called after imports, which can introduce statuses that weren't there before. */
export function invalidateInventoryStatuses() {
  cache = null;
}
