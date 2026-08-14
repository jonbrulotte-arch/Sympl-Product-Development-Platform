"use client";

import { useState, useEffect } from "react";
import {
  Zap, RefreshCw, X, CheckSquare, Square, AlertTriangle, ChevronRight,
  Loader2, ArrowRight, Eraser, PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Push counterpart to the pull change report: before overwriting Salsify, show
// exactly which properties change, what they change from, and which go blank.

type Change = {
  productId: string;
  partNumber: string | null;
  itemName: string | null;
  current: string;
  incoming: string;
  clearing: boolean;
  creating: boolean;
};

type SyncAttribute = {
  key: string;
  label: string;
  salsifyPropertyId: string | null;
  section: string;
  changes: Change[];
  changeCount: number;
  clearingCount: number;
};

type ProductResult = {
  partNumber: string | null;
  status: "found" | "will_create" | "error";
  httpStatus?: number;
  detail?: string;
  changeCount: number;
  clearingCount: number;
};

type SyncSummary = {
  productsInGrid: number;
  productsFoundInSalsify: number;
  productsToCreate: number;
  totalChanges: number;
  totalClearing: number;
  products: ProductResult[];
  salsifyAttrCount: number;
  errors?: string[];
};

const PRODUCT_STATUS: Record<ProductResult["status"], { label: string; cls: string }> = {
  found:       { label: "In Salsify",        cls: "bg-green-50 text-green-700" },
  will_create: { label: "New — will create", cls: "bg-blue-50 text-blue-700" },
  error:       { label: "Lookup failed",     cls: "bg-red-50 text-red-700" },
};

type Props = {
  /** "project" syncs all products in the project; "product" syncs a single product */
  mode: "project" | "product";
  projectId: string;
  /** Scopes the preview to a row selection, or a single product on its edit page. */
  productIds?: string[];
  onConfirm: (skipKeys: string[]) => void;
  onClose: () => void;
  syncing: boolean;
};

export function SalsifySyncModal({ mode, projectId, productIds, onConfirm, onClose, syncing }: Props) {
  const [attrs, setAttrs] = useState<SyncAttribute[]>([]);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Callers pass array literals, which change identity on every render — key
  // the fetch on a stable string so the preview runs once, not in a loop.
  const productKey = productIds?.length ? productIds.join(",") : "";

  useEffect(() => {
    let cancelled = false;
    const ids = productKey ? productKey.split(",") : undefined;
    fetch(`/api/projects/${projectId}/salsify-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true, productIds: ids }),
    })
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then((preview) => {
        if (cancelled) return;
        if (!preview.ok) {
          setError(preview.data.error ?? "Could not read current values from Salsify.");
          return;
        }
        const list: SyncAttribute[] = preview.data.attributes ?? [];
        setAttrs(list);
        setSummary(preview.data.summary ?? null);
        setChecked(new Set(list.map((a) => a.key)));
        setExpanded(new Set(list.map((a) => a.key)));
      })
      .catch(() => { if (!cancelled) setError("Could not reach the server."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, productKey]);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const allChecked = attrs.length > 0 && checked.size === attrs.length;
  const allExpanded = attrs.length > 0 && expanded.size === attrs.length;

  const selected = attrs.filter((a) => checked.has(a.key));
  const selectedChanges = selected.reduce((n, a) => n + a.changeCount, 0);
  const selectedClearing = selected.reduce((n, a) => n + a.clearingCount, 0);

  // Only attributes the user explicitly unticked are skipped. Attributes with
  // no pending change are still sent — writing a value Salsify already holds
  // is a no-op, and auto-skipping them would silently under-send for any
  // product whose preview lookup failed and whose diffs are therefore unknown.
  const skipKeys = attrs.filter((a) => !checked.has(a.key)).map((a) => a.key);

  const groups = attrs.reduce<Record<string, SyncAttribute[]>>((acc, a) => {
    (acc[a.section] ??= []).push(a);
    return acc;
  }, {});

  const scopeLabel = mode === "product"
    ? "This product"
    : productIds?.length
      ? `${productIds.length} selected product${productIds.length !== 1 ? "s" : ""}`
      : "All products in this project";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center">
            <Zap className="h-4 w-4 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Sync to Salsify</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {scopeLabel} — review what changes in Salsify before anything is written.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Reading current values from Salsify…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : (
            <>
              {summary && (
                <div className="grid grid-cols-4 gap-3">
                  <Stat label="Already in Salsify" value={summary.productsFoundInSalsify} />
                  <Stat label="New records" value={summary.productsToCreate} tone={summary.productsToCreate > 0 ? "blue" : undefined} />
                  <Stat label="Values to change" value={summary.totalChanges} />
                  <Stat label="Will be cleared" value={summary.totalClearing} tone={summary.totalClearing > 0 ? "red" : undefined} />
                </div>
              )}

              {summary && summary.totalClearing > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
                  <Eraser className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{summary.totalClearing} value{summary.totalClearing !== 1 ? "s" : ""} in Salsify
                    will be emptied</strong> because the matching field is blank in Sympl. Those are
                    marked <em>clears</em> below — untick the attribute to leave Salsify&apos;s value alone.
                  </span>
                </div>
              )}

              {summary?.errors?.length ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 space-y-1">
                  <p className="font-medium">Some lookups failed — those products are still pushed, unreviewed:</p>
                  {summary.errors.slice(0, 10).map((e, i) => <p key={i} className="font-mono">{e}</p>)}
                </div>
              ) : null}

              {summary?.products?.length ? (
                <details className="rounded-lg border border-gray-200 bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900">
                    Per-product results ({summary.products.length})
                  </summary>
                  <div className="border-t border-gray-100 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {summary.products.map((p, i) => (
                      <div key={i} className="px-3 py-2 text-xs flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-gray-700">{p.partNumber ?? "—"}</span>
                        <span className={`px-1.5 py-0.5 rounded font-medium ${PRODUCT_STATUS[p.status].cls}`}>
                          {PRODUCT_STATUS[p.status].label}
                        </span>
                        <span className="text-gray-500">
                          {p.changeCount} change{p.changeCount !== 1 ? "s" : ""}
                          {p.clearingCount > 0 && ` · ${p.clearingCount} cleared`}
                        </span>
                        {p.detail && <span className="text-gray-400 w-full">{p.detail}</span>}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              {attrs.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-500">
                  Nothing to push — Salsify already matches Sympl for every mapped attribute.
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>Salsify data will be overwritten.</strong> Every checked attribute below
                      replaces what Salsify currently holds for that product.
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setChecked(allChecked ? new Set() : new Set(attrs.map((a) => a.key)))}
                      className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {allChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      {allChecked ? "Deselect all" : "Select all"}
                    </button>
                    <button
                      onClick={() => setExpanded(allExpanded ? new Set() : new Set(attrs.map((a) => a.key)))}
                      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium"
                    >
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${allExpanded ? "rotate-90" : ""}`} />
                      {allExpanded ? "Collapse all" : "Expand all"}
                    </button>
                  </div>

                  {Object.entries(groups).map(([section, sectionAttrs]) => (
                    <div key={section} className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{section}</p>
                      {sectionAttrs.map((attr) => {
                        const isOpen = expanded.has(attr.key);
                        return (
                          <div key={attr.key} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="flex items-center gap-3 px-3 py-2.5 bg-white">
                              <input
                                type="checkbox"
                                checked={checked.has(attr.key)}
                                onChange={() => toggle(attr.key)}
                                aria-label={`Push ${attr.label}`}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800">{attr.label}</p>
                                {attr.salsifyPropertyId && (
                                  <p className="text-xs text-gray-400 font-mono truncate">
                                    → {attr.salsifyPropertyId}
                                  </p>
                                )}
                              </div>
                              {attr.clearingCount > 0 && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide bg-red-50 text-red-700 px-1.5 py-0.5 rounded shrink-0">
                                  {attr.clearingCount} clear{attr.clearingCount !== 1 ? "s" : ""}
                                </span>
                              )}
                              <button
                                onClick={() => setExpanded((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(attr.key)) next.delete(attr.key); else next.add(attr.key);
                                  return next;
                                })}
                                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 shrink-0"
                              >
                                {attr.changeCount} change{attr.changeCount !== 1 ? "s" : ""}
                                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                              </button>
                            </div>

                            {isOpen && (
                              <div className="border-t border-gray-100 bg-gray-50 divide-y divide-gray-100 max-h-56 overflow-y-auto">
                                {attr.changes.map((c) => (
                                  <div key={c.productId} className="px-3 py-2 text-xs">
                                    <p className="font-mono text-gray-500 mb-1 truncate flex items-center gap-1.5">
                                      {c.creating && <PlusCircle className="h-3 w-3 text-blue-500 shrink-0" />}
                                      {c.partNumber ?? "—"}
                                      {c.itemName ? ` · ${c.itemName}` : ""}
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded line-through break-all">
                                        {c.current}
                                      </span>
                                      <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />
                                      <span className={`px-1.5 py-0.5 rounded break-all ${
                                        c.clearing
                                          ? "bg-red-100 text-red-800 font-medium"
                                          : "bg-green-50 text-green-700"
                                      }`}>
                                        {c.clearing ? "(cleared)" : c.incoming}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 shrink-0 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-500">
            {attrs.length > 0 && (
              <>
                {checked.size} of {attrs.length} changed attribute{attrs.length !== 1 ? "s" : ""}
                {" · "}
                <strong className="text-gray-700">{selectedChanges}</strong> value
                {selectedChanges !== 1 ? "s" : ""} overwritten in Salsify
                {selectedClearing > 0 && (
                  <span className="text-red-600"> · {selectedClearing} cleared</span>
                )}
              </>
            )}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onClose} disabled={syncing}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => onConfirm(skipKeys)}
              disabled={syncing || loading || selectedChanges === 0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Overwrite & Sync"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" | "blue" }) {
  const color = tone === "red" && value > 0 ? "text-red-600"
    : tone === "blue" && value > 0 ? "text-blue-600"
    : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
