"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ClipboardCheck, ShieldAlert, Clock, CalendarX, Construction, RefreshCw,
  BarChart3, Download, Loader2,
} from "lucide-react";

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

export function ReportsClient() {
  const [active, setActive] = useState<ReportType>("inspections");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

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

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const activeFilters = FILTERS[active] ?? [];
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
        {REPORTS.map(({ type, label, icon: Icon }) => (
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
              <p className="text-xs text-gray-500">{activeReport.description}</p>
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
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {headers.map((h) => (
                        <td key={h} className="px-4 py-2.5 text-gray-800 whitespace-nowrap max-w-xs truncate">
                          {row[h] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
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
    </div>
  );
}
