"use client";

import { useState, useEffect } from "react";
import {
  DownloadCloud, X, CheckSquare, Square, AlertTriangle, ChevronRight,
  Download, Loader2, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Change = {
  productId: string;
  partNumber: string | null;
  itemName: string | null;
  current: string;
  incoming: string;
};

type PullAttribute = {
  key: string;
  label: string;
  salsifyPropertyId: string | null;
  section: string;
  isCoreField: boolean;
  changes: Change[];
  changeCount: number;
};

type PullWarning = {
  attributeKey: string;
  attributeLabel: string;
  partNumber: string | null;
  value: string;
  reason: string;
};

type ProductResult = {
  partNumber: string | null;
  status: "found" | "not_found" | "error" | "no_part_number";
  httpStatus?: number;
  detail?: string;
  propsPresent: number;
  propsMissing: string[];
  propsOutOfCategory: number;
  changeCount: number;
};

type PullSummary = {
  products?: ProductResult[];
  salsifyAttrCount?: number;
  productsInGrid: number;
  productsWithoutPartNumber: number;
  productsFoundInSalsify: number;
  productsNotInSalsify: number;
  notFoundSample: string[];
  totalChanges: number;
  errors?: string[];
  warnings?: PullWarning[];
  warningCount?: number;
};

type Props = {
  projectId: string;
  /** When set, only these products are pulled instead of the whole grid. */
  productIds?: string[];
  /** Backs the "export current data first" button on the confirmation screen. */
  onExport: () => void;
  onClose: () => void;
  onApplied: (result: { productsUpdated: number; fieldsUpdated: number }) => void;
};

export function SalsifyPullModal({ projectId, productIds, onExport, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<PullAttribute[]>([]);
  const [summary, setSummary] = useState<PullSummary | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exported, setExported] = useState(false);

  // Callers may pass array literals, which change identity on every render —
  // key the fetch on a stable string so the preview runs once, not in a loop.
  const productKey = productIds?.length ? productIds.join(",") : "";

  // Load the change report up front — nothing is written until the user
  // confirms, so this is safe to run the moment the modal opens.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/salsify-pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true, productIds: productKey ? productKey.split(",") : undefined }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) { setError(data.error ?? "Could not read data from Salsify."); return; }
        const attrs: PullAttribute[] = data.attributes ?? [];
        setAttributes(attrs);
        setSummary(data.summary ?? null);
        setChecked(new Set(attrs.map((a) => a.key)));
        // Expanded by default — the diff is the point of this screen, so it
        // shouldn't take a click per attribute to see it.
        setExpanded(new Set(attrs.map((a) => a.key)));
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

  function toggleAll() {
    setChecked(checked.size === attributes.length ? new Set() : new Set(attributes.map((a) => a.key)));
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/salsify-pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false, productIds, attributeKeys: [...checked] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Pull failed."); return; }
      onApplied({ productsUpdated: data.productsUpdated ?? 0, fieldsUpdated: data.fieldsUpdated ?? 0 });
    } catch {
      setError("Could not reach the server.");
    } finally {
      setApplying(false);
    }
  }

  const selectedChangeCount = attributes
    .filter((a) => checked.has(a.key))
    .reduce((n, a) => n + a.changeCount, 0);
  const allChecked = attributes.length > 0 && checked.size === attributes.length;
  const allExpanded = attributes.length > 0 && expanded.size === attributes.length;

  // Group by section, preserving the change-count ordering within each.
  const groups = attributes.reduce<Record<string, PullAttribute[]>>((acc, a) => {
    (acc[a.section] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
            <DownloadCloud className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Pull Data from Salsify</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {productIds?.length
                ? `${productIds.length} selected product${productIds.length !== 1 ? "s" : ""}`
                : "All products in this grid"}
              {" — review what will change before anything is written."}
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
              {/* Summary */}
              {summary && (
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Products matched" value={summary.productsFoundInSalsify} />
                  <Stat label="Not in Salsify" value={summary.productsNotInSalsify} muted />
                  <Stat label="Values to change" value={summary.totalChanges} />
                </div>
              )}

              {summary && summary.productsWithoutPartNumber > 0 && (
                <Note>
                  {summary.productsWithoutPartNumber} product
                  {summary.productsWithoutPartNumber !== 1 ? "s have" : " has"} no Part Number and
                  {summary.productsWithoutPartNumber !== 1 ? " were" : " was"} skipped — Salsify is
                  looked up by Part Number.
                </Note>
              )}

              {summary && summary.notFoundSample.length > 0 && (
                <Note>
                  Not found in Salsify: <span className="font-mono">{summary.notFoundSample.join(", ")}</span>
                  {summary.productsNotInSalsify > summary.notFoundSample.length &&
                    ` +${summary.productsNotInSalsify - summary.notFoundSample.length} more`}
                  . These rows are left untouched.
                </Note>
              )}

              {summary?.products?.length ? (
                <details className="rounded-lg border border-gray-200 bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900">
                    Per-product results ({summary.products.length}) — why a product returned nothing
                  </summary>
                  <div className="border-t border-gray-100 divide-y divide-gray-100 max-h-56 overflow-y-auto">
                    {summary.products.map((p, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-gray-700">{p.partNumber ?? "(no part number)"}</span>
                          <span className={`px-1.5 py-0.5 rounded font-medium ${PRODUCT_STATUS[p.status].cls}`}>
                            {PRODUCT_STATUS[p.status].label}
                            {p.httpStatus && p.status !== "found" ? ` · HTTP ${p.httpStatus}` : ""}
                          </span>
                          {p.status === "found" && (
                            <span className="text-gray-500">
                              {p.propsPresent} of {summary.salsifyAttrCount ?? "?"} mapped propert
                              {p.propsPresent === 1 ? "y" : "ies"} on the record
                              {p.propsOutOfCategory > 0 && ` · ${p.propsOutOfCategory} skipped (other category)`}
                              {` · ${p.changeCount} change${p.changeCount !== 1 ? "s" : ""}`}
                            </span>
                          )}
                        </div>
                        {p.detail && <p className="text-gray-500 mt-0.5">{p.detail}</p>}
                        {p.status === "found" && p.propsPresent === 0 && (
                          <p className="text-amber-700 mt-0.5">
                            Salsify returned this record but none of the mapped property IDs were on
                            it — check the Salsify Property IDs in Admin &rarr; Attributes.
                          </p>
                        )}
                        {p.status === "found" && p.propsMissing.length > 0 && p.propsPresent > 0 && (
                          <p className="text-gray-400 mt-0.5 font-mono break-all">
                            not on record: {p.propsMissing.join(", ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              {summary?.warnings?.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {summary.warningCount} value{summary.warningCount !== 1 ? "s" : ""} could not be
                    read into their field and will be skipped
                  </p>
                  <p className="text-xs text-amber-800">
                    These are usually a property mapped to the wrong attribute type in
                    Admin &rarr; Attributes. Nothing below is written either way.
                  </p>
                  <div className="max-h-40 overflow-y-auto divide-y divide-amber-100 rounded border border-amber-200 bg-white/60">
                    {summary.warnings.map((w, i) => (
                      <div key={i} className="px-2.5 py-1.5 text-xs">
                        <p className="text-gray-700">
                          <span className="font-medium">{w.attributeLabel}</span>
                          <span className="text-gray-400 font-mono"> · {w.partNumber ?? "—"}</span>
                        </p>
                        <p className="text-amber-800">
                          {w.reason}: <span className="font-mono break-all">{w.value}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                  {summary.warningCount != null && summary.warningCount > summary.warnings.length && (
                    <p className="text-xs text-amber-700">
                      +{summary.warningCount - summary.warnings.length} more not shown.
                    </p>
                  )}
                </div>
              ) : null}

              {summary?.errors?.length ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 space-y-1">
                  <p className="font-medium">Some lookups failed:</p>
                  {summary.errors.map((e, i) => <p key={i} className="font-mono">{e}</p>)}
                </div>
              ) : null}

              {attributes.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-500">
                  {summary?.warningCount
                    ? "Nothing can be pulled — every difference found is listed above as a warning."
                    : "Nothing to pull — every Salsify-enabled attribute already matches what Salsify has."}
                </div>
              ) : (
                <>
                  {/* Overwrite warning + backup */}
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
                    <p className="flex items-start gap-2 text-sm text-amber-900">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        <strong>Your grid data will be overwritten.</strong> Every checked attribute
                        below is replaced with the Salsify value for that product. This cannot be
                        undone — export a backup first if you want one.
                      </span>
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { onExport(); setExported(true); }}
                      className="bg-white"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      {exported ? "Export again" : "Export current data first"}
                    </Button>
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={toggleAll}
                      className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {allChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      {allChecked ? "Deselect all" : "Select all"}
                    </button>
                    <button
                      onClick={() =>
                        setExpanded(allExpanded ? new Set() : new Set(attributes.map((a) => a.key)))
                      }
                      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium"
                    >
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${allExpanded ? "rotate-90" : ""}`} />
                      {allExpanded ? "Collapse all" : "Expand all"}
                    </button>
                  </div>

                  {/* Per-attribute change report */}
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
                                aria-label={`Pull ${attr.label}`}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800">{attr.label}</p>
                                {attr.salsifyPropertyId && (
                                  <p className="text-xs text-gray-400 font-mono truncate">
                                    ← {attr.salsifyPropertyId}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => toggleExpanded(attr.key)}
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
                                    <p className="font-mono text-gray-500 mb-1 truncate">
                                      {c.partNumber ?? "—"}
                                      {c.itemName ? ` · ${c.itemName}` : ""}
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded line-through break-all">
                                        {c.current}
                                      </span>
                                      <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />
                                      <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded break-all">
                                        {c.incoming}
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
            {attributes.length > 0 && (
              <>
                {checked.size} of {attributes.length} attribute{attributes.length !== 1 ? "s" : ""}
                {" · "}
                <strong className="text-gray-700">{selectedChangeCount}</strong> value
                {selectedChangeCount !== 1 ? "s" : ""} will be overwritten
              </>
            )}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onClose} disabled={applying}>Cancel</Button>
            <Button
              size="sm"
              onClick={apply}
              disabled={applying || loading || selectedChangeCount === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {applying
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <DownloadCloud className="h-3.5 w-3.5 mr-1.5" />}
              {applying ? "Pulling…" : "Overwrite & Pull"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PRODUCT_STATUS: Record<ProductResult["status"], { label: string; cls: string }> = {
  found:           { label: "Found in Salsify", cls: "bg-green-50 text-green-700" },
  not_found:       { label: "Not in Salsify",   cls: "bg-amber-50 text-amber-700" },
  error:           { label: "Lookup failed",    cls: "bg-red-50 text-red-700" },
  no_part_number:  { label: "No part number",   cls: "bg-gray-100 text-gray-500" },
};

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <p className={`text-lg font-semibold ${muted && value > 0 ? "text-amber-600" : "text-gray-900"}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
      {children}
    </div>
  );
}
