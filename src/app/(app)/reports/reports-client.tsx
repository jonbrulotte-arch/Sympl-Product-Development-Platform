"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ClipboardCheck, ShieldAlert, Clock, CalendarX, Construction, RefreshCw,
  BarChart3, Download, Loader2, X, ExternalLink, ArrowRight, Check,
} from "lucide-react";
import Link from "next/link";

type ReportType =
  | "inspections" | "compliance" | "overdue-stages" | "overdue-projects"
  | "roadblocks" | "out-of-sync" | "pipeline";

type ReportRow = Record<string, string | number | null>;

const REPORTS: { type: ReportType; label: string; description: string; icon: typeof BarChart3 }[] = [
  { type: "inspections", label: "Inspections", description: "All inspection reports with results, dates, and linked products.", icon: ClipboardCheck },
  { type: "compliance", label: "Compliance", description: "Compliance events with severity, status, due dates, and overdue days.", icon: ShieldAlert },
  { type: "overdue-stages", label: "Overdue Stages", description: "Workflow stages past their due date with pending approvers.", icon: Clock },
  { type: "overdue-projects", label: "Overdue Projects", description: "Active projects past their target launch date.", icon: CalendarX },
  { type: "roadblocks", label: "Roadblocks", description: "Blocked stages, stalled projects, failed inspections, and aging approvals.", icon: Construction },
  { type: "out-of-sync", label: "Out-of-Sync Products", description: "Products edited since their last Salsify sync, or never synced while export-ready.", icon: RefreshCw },
  { type: "pipeline", label: "Pipeline Summary", description: "Project counts by status and owner with time-in-status.", icon: BarChart3 },
];

const FILTERS: Partial<Record<ReportType, { key: string; label: string; options: { value: string; label: string }[] }[]>> = {
  inspections: [
    { key: "result", label: "Result", options: [{ value: "", label: "All results" }, { value: "PASS", label: "Pass" }, { value: "FAIL", label: "Fail" }, { value: "PENDING", label: "Pending" }] },
  ],
  compliance: [
    { key: "status", label: "Status", options: [{ value: "", label: "All statuses" }, { value: "OPEN", label: "Open" }, { value: "IN_PROGRESS", label: "In Progress" }, { value: "RESOLVED", label: "Resolved" }, { value: "CLOSED", label: "Closed" }] },
    { key: "severity", label: "Severity", options: [{ value: "", label: "All severities" }, { value: "LOW", label: "Low" }, { value: "MEDIUM", label: "Medium" }, { value: "HIGH", label: "High" }, { value: "CRITICAL", label: "Critical" }] },
    { key: "overdueOnly", label: "Overdue", options: [{ value: "", label: "All events" }, { value: "true", label: "Overdue only" }] },
  ],
};

type DriftChange = {
  fieldKey: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
  source: string | null;
  edits: number;
  syncable: boolean;
};

type DriftDetail = {
  product: {
    id: string;
    partNumber: string | null;
    itemName: string | null;
    brand: string | null;
    updatedAt: string;
    salsifyLastSyncedAt: string | null;
  };
  project: { id: string; name: string; status: string };
  links: { project: string; product: string; salsify: string | null };
  changes: DriftChange[];
  canSync: boolean;
};

function fmtWhen(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "Never";
}

// Detail drawer for a row of the Out-of-Sync Products report: field-level
// old → new diffs since the last Salsify push, deep links to the record in
// Sympl and Salsify, and a per-field push for users who can sync.
function DriftDetailDrawer({
  projectId,
  productId,
  onClose,
}: {
  projectId: string;
  productId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DriftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [synced, setSynced] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}/products/${productId}/salsify-drift`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load detail"))))
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, productId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function syncField(fieldKey: string) {
    setSyncing(fieldKey);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/products/${productId}/salsify-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyAttributeKeys: [fieldKey] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Sync failed (${res.status})`);
        return;
      }
      setSynced((prev) => ({ ...prev, [fieldKey]: true }));
    } catch {
      setError("Sync request failed.");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Out-of-sync product detail"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {detail?.product.partNumber ?? "Product"}
            </p>
            <p className="text-xs text-gray-500 truncate">{detail?.product.itemName ?? ""}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading detail…
          </div>
        ) : !detail ? (
          <div className="py-16 text-center text-sm text-gray-500">{error ?? "No detail available."}</div>
        ) : (
          <div className="space-y-5 px-5 py-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Last synced to Salsify</p>
                <p className="font-medium text-gray-900">{fmtWhen(detail.product.salsifyLastSyncedAt)}</p>
              </div>
              <div>
                <p className="text-gray-500">Last edited in Sympl</p>
                <p className="font-medium text-gray-900">{fmtWhen(detail.product.updatedAt)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={detail.links.product}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Product record <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href={detail.links.project}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {detail.project.name} <ArrowRight className="h-3 w-3" />
              </Link>
              {detail.links.salsify && (
                <a
                  href={detail.links.salsify}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  View in Salsify <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Changes since last sync
              </p>
              {detail.changes.length === 0 ? (
                <p className="rounded-md bg-gray-50 px-3 py-4 text-xs text-gray-500">
                  No field-level changes were recorded. The record may have drifted through an
                  import or an attribute edit that predates change tracking — a full sync from the
                  product record will bring Salsify back in line.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detail.changes.map((c) => (
                    <li key={c.fieldKey} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{c.label}</p>
                          <p className="text-[11px] text-gray-500">
                            {c.changedBy} · {new Date(c.changedAt).toLocaleString()}
                            {c.source ? ` · ${c.source}` : ""}
                            {c.edits > 1 ? ` · ${c.edits} edits` : ""}
                          </p>
                        </div>
                        {detail.canSync && c.syncable && (
                          synced[c.fieldKey] ? (
                            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-green-700">
                              <Check className="h-3.5 w-3.5" /> Synced
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => syncField(c.fieldKey)}
                              disabled={syncing !== null}
                            >
                              {syncing === c.fieldKey
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RefreshCw className="h-3.5 w-3.5" />}
                              Sync
                            </Button>
                          )
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 line-through">
                          {c.oldValue || "empty"}
                        </span>
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                        <span className="rounded bg-green-50 px-2 py-0.5 font-medium text-green-800">
                          {c.newValue || "empty"}
                        </span>
                      </div>
                      {!c.syncable && (
                        <p className="mt-1.5 text-[11px] text-gray-500">
                          Not mapped to a Salsify property — this field does not sync.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ReportsClient() {
  const [active, setActive] = useState<ReportType>("inspections");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [inspectionsEnabled, setInspectionsEnabled] = useState(true);
  const [drill, setDrill] = useState<{ projectId: string; productId: string } | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.inspectionsEnabled === false) {
          setInspectionsEnabled(false);
          setActive((prev) => (prev === "inspections" ? "compliance" : prev));
        }
      })
      .catch(() => {});
  }, []);

  const query = useCallback((f: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reports/${active}${query(filters)}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setRows(Array.isArray(data.rows) ? data.rows : []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active, filters, query]);

  function selectReport(type: ReportType) {
    setActive(type);
    setFilters({});
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const res = await fetch(`/api/reports/${active}/export${query(filters)}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sympl-${active}-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // Underscore-prefixed keys are row metadata (IDs for drill-down), not columns.
  const headers = rows.length > 0 ? Object.keys(rows[0]).filter((h) => !h.startsWith("_")) : [];
  const drillable = active === "out-of-sync";
  const activeFilters = FILTERS[active] ?? [];
  const visibleReports = REPORTS.filter((r) => inspectionsEnabled || r.type !== "inspections");
  const activeReport = REPORTS.find((r) => r.type === active)!;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Operational reports scoped to your projects. Export any report to Excel.
        </p>
      </div>

      {/* Report picker */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {visibleReports.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => selectReport(type)}
            className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${
              active === type
                ? "border-blue-500 bg-blue-50 text-blue-800"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs font-medium leading-tight">{label}</span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">{activeReport.label}</p>
              <p className="text-xs text-gray-500">
                {activeReport.description}
                {drillable ? " Click a row to see what changed and push a field to Salsify." : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {activeFilters.map((f) => (
                <select
                  key={f.key}
                  value={filters[f.key] ?? ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1.5 text-gray-900 bg-white"
                  aria-label={f.label}
                >
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ))}
              <Button size="sm" onClick={exportExcel} disabled={exporting || loading || rows.length === 0}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export to Excel
              </Button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500 text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-gray-500 text-sm">No rows match this report.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {headers.map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => {
                    const canDrill = drillable && !!row._productId && !!row._projectId;
                    return (
                      <tr
                        key={i}
                        className={`hover:bg-gray-50 ${canDrill ? "cursor-pointer" : ""}`}
                        onClick={canDrill
                          ? () => setDrill({ projectId: String(row._projectId), productId: String(row._productId) })
                          : undefined}
                        title={canDrill ? "View drift detail" : undefined}
                      >
                        {headers.map((h) => (
                          <td key={h} className="px-4 py-2.5 text-gray-800 whitespace-nowrap max-w-xs truncate">
                            {row[h] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && rows.length > 0 && (
            <p className="px-4 py-2.5 text-xs text-gray-500 border-t border-gray-100">
              {rows.length} row{rows.length !== 1 ? "s" : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {drill && (
        <DriftDetailDrawer
          projectId={drill.projectId}
          productId={drill.productId}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
