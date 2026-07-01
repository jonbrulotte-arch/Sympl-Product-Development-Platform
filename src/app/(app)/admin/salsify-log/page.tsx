"use client";

import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type SyncLog = {
  id: string;
  status: string;
  productsSynced: number;
  errors: string[] | null;
  startedAt: string;
  completedAt: string | null;
  project: { id: string; name: string };
  user: { id: string; name: string | null; email: string | null };
};

function StatusBadge({ status }: { status: string }) {
  if (status === "SUCCESS") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
      <CheckCircle2 className="h-3 w-3" /> Success
    </span>
  );
  if (status === "PARTIAL") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      <AlertTriangle className="h-3 w-3" /> Partial
    </span>
  );
  if (status === "FAILED") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      <XCircle className="h-3 w-3" /> Failed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
      {status}
    </span>
  );
}

export default function SalsifyLogPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/salsify-log?page=${p}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
      setPageSize(data.pageSize ?? 50);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salsify Sync Log</h1>
          <p className="text-sm text-gray-500 mt-1">{total} sync event{total !== 1 ? "s" : ""} recorded</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {logs.length === 0 && !loading ? (
        <div className="text-center py-16 text-gray-400 text-sm border rounded-lg bg-gray-50">
          No sync events recorded yet. Run a Salsify sync from a project to see results here.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Date / Time</th>
                <th className="text-left px-4 py-3 font-medium">Project</th>
                <th className="text-left px-4 py-3 font-medium">Triggered By</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Synced</th>
                <th className="text-right px-4 py-3 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr
                    className={`hover:bg-gray-50 cursor-pointer ${expandedId === log.id ? "bg-gray-50" : ""}`}
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {new Date(log.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{log.project.name}</td>
                    <td className="px-4 py-3 text-gray-500">{log.user.name ?? log.user.email ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{log.productsSynced}</td>
                    <td className="px-4 py-3 text-right">
                      {log.errors && (log.errors as string[]).length > 0 ? (
                        <span className="text-red-600 font-medium">{(log.errors as string[]).length}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={`${log.id}-detail`} className="bg-gray-50">
                      <td colSpan={6} className="px-4 pb-4 pt-0">
                        <div className="rounded-lg border border-gray-200 overflow-hidden mt-1">
                          <div className="px-4 py-2.5 bg-white border-b border-gray-100 flex gap-6 text-xs text-gray-500">
                            <span>Started: <span className="text-gray-700">{new Date(log.startedAt).toLocaleString()}</span></span>
                            {log.completedAt && (
                              <span>Completed: <span className="text-gray-700">{new Date(log.completedAt).toLocaleString()}</span></span>
                            )}
                            <span>Products synced: <span className="text-gray-700 font-medium">{log.productsSynced}</span></span>
                          </div>
                          {log.errors && (log.errors as string[]).length > 0 ? (
                            <div className="p-4">
                              <p className="text-xs font-semibold text-red-600 mb-2 uppercase tracking-wide">
                                Errors ({(log.errors as string[]).length})
                              </p>
                              <ul className="space-y-1.5">
                                {(log.errors as string[]).map((err, i) => (
                                  <li key={i} className="text-xs font-mono text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2 break-all">
                                    {err}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div className="px-4 py-3 text-xs text-green-700 flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5" /> All products synced successfully — no errors.
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
