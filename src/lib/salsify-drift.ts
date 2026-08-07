// Field-level Salsify drift.
//
// A product is "out of sync" when it was edited after its last full push.
// Per-field pushes from the Out-of-Sync report narrow that down: each one is
// recorded as an EXPORTED activity entry tagged with SALSIFY_FIELD_SYNC, so a
// field counts as resolved once it has been pushed more recently than it was
// last edited. When nothing is left unresolved the product is fully in sync
// again, even though no full push ever happened.

import { prisma } from "@/lib/prisma";

/** ActivityLog.source marking a single-field push to Salsify. */
export const SALSIFY_FIELD_SYNC = "Salsify Field Sync";

export type DriftEntry = {
  fieldKey: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: Date;
  source: string | null;
  edits: number;
};

type LogRow = {
  productId: string | null;
  action: string;
  fieldKey: string | null;
  oldValue: string | null;
  newValue: string | null;
  source: string | null;
  createdAt: Date;
  user: { name: string | null; email: string };
};

/**
 * Unresolved field changes per product, newest edit first.
 *
 * `syncedAt` is each product's salsifyLastSyncedAt; edits at or before it are
 * already covered by that push. Products absent from the result have no
 * outstanding drift.
 */
export async function unresolvedDrift(
  syncedAt: Map<string, Date | null>
): Promise<Map<string, DriftEntry[]>> {
  const productIds = [...syncedAt.keys()];
  const result = new Map<string, DriftEntry[]>();
  if (productIds.length === 0) return result;

  const logs = await prisma.activityLog.findMany({
    where: {
      productId: { in: productIds },
      entityType: "ProductRecord",
      fieldKey: { not: null },
    },
    select: {
      productId: true,
      action: true,
      fieldKey: true,
      oldValue: true,
      newValue: true,
      source: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // productId -> fieldKey -> most recent per-field push
  const pushedAt = new Map<string, Map<string, Date>>();
  for (const log of logs as LogRow[]) {
    if (log.action !== "EXPORTED" || log.source !== SALSIFY_FIELD_SYNC) continue;
    if (!log.productId || !log.fieldKey) continue;
    const perField = pushedAt.get(log.productId) ?? new Map<string, Date>();
    // logs are newest-first, so the first hit for a field is the latest push
    if (!perField.has(log.fieldKey)) perField.set(log.fieldKey, log.createdAt);
    pushedAt.set(log.productId, perField);
  }

  for (const log of logs as LogRow[]) {
    if (!log.productId || !log.fieldKey) continue;
    if (log.action === "EXPORTED" && log.source === SALSIFY_FIELD_SYNC) continue;

    const since = syncedAt.get(log.productId);
    if (since && log.createdAt <= since) continue;

    const pushed = pushedAt.get(log.productId)?.get(log.fieldKey);
    if (pushed && pushed >= log.createdAt) continue; // pushed after this edit

    const entries = result.get(log.productId) ?? [];
    const existing = entries.find((e) => e.fieldKey === log.fieldKey);
    if (existing) {
      // older edit of a field already seen — extend the "was" side of the diff
      existing.oldValue = log.oldValue;
      existing.edits++;
    } else {
      entries.push({
        fieldKey: log.fieldKey,
        oldValue: log.oldValue,
        newValue: log.newValue,
        changedBy: log.user.name ?? log.user.email,
        changedAt: log.createdAt,
        source: log.source,
        edits: 1,
      });
    }
    result.set(log.productId, entries);
  }

  return result;
}

/** Convenience wrapper for a single product. */
export async function unresolvedDriftForProduct(
  productId: string,
  syncedAt: Date | null
): Promise<DriftEntry[]> {
  const map = await unresolvedDrift(new Map([[productId, syncedAt]]));
  return map.get(productId) ?? [];
}
