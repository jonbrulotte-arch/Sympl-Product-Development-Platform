"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ChevronLeft, ChevronRight, ExternalLink, Download } from "lucide-react";
import Link from "next/link";
import {
  entityLabel,
  fieldLabel,
  actionTone,
  prettyValue,
  relativeTime,
  subjectFromMetadata,
} from "@/lib/activity-format";

type User = { id: string; name: string | null; email: string };
type Project = { id: string; name: string };

interface LogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  fieldKey: string | null;
  oldValue: string | null;
  newValue: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  projectId: string | null;
  productId: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; image: string | null; role: string } | null;
  project: { id: string; name: string } | null;
  product: { id: string; partNumber: string | null; itemName: string | null } | null;
}

const ACTION_OPTIONS = [
  "CREATED", "UPDATED", "DELETED", "STATUS_CHANGED", "APPROVED", "REJECTED",
  "SUBMITTED", "IMPORTED", "EXPORTED", "COMMENTED", "ASSIGNED", "ARCHIVED",
  "RESTORED", "DUPLICATED", "LOGIN_SUCCESS", "LOGIN_FAILED", "LOGIN_LOCKED",
  "PASSWORD_CHANGED", "PASSWORD_RESET", "USER_CREATED", "USER_UPDATED",
  "USER_DEACTIVATED", "SETTINGS_CHANGED", "PERMISSION_CHANGED", "SYNCED", "PULLED",
];

const ENTITY_OPTIONS = [
  "ProductRecord", "Project", "WorkflowStage", "WorkflowApproval",
  "ComplianceEvent", "Psir", "User", "Category", "AttributeDefinition",
  "user", "setting", "category", "attribute", "complianceType",
  "workflowTemplate", "psirAttribute", "backup",
];

function actionLabel(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function tryParseJson(val: string | null | undefined, key: string): string | null {
  if (!val) return null;
  try {
    const parsed = JSON.parse(val);
    const v = parsed?.[key];
    return typeof v === "string" && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function EventLogClient({ users, projects }: { users: User[]; projects: Project[] }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LogEntry | null>(null);

  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterPartNumber, setFilterPartNumber] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const pageSize = 50;
  const totalPages = Math.ceil(total / pageSize);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filterUser) params.set("userId", filterUser);
    if (filterAction) params.set("action", filterAction);
    if (filterEntity) params.set("entityType", filterEntity);
    if (filterProject) params.set("projectId", filterProject);
    if (filterPartNumber) params.set("partNumber", filterPartNumber);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
    try {
      const res = await fetch(`/api/admin/event-log?${params}`);
      const data = await res.json();
      setLogs(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, filterUser, filterAction, filterEntity, filterProject, filterPartNumber, filterFrom, filterTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const resetFilters = () => {
    setFilterUser(""); setFilterAction(""); setFilterEntity("");
    setFilterProject(""); setFilterPartNumber(""); setFilterFrom(""); setFilterTo("");
    setPage(1);
  };

  const hasFilters = filterUser || filterAction || filterEntity || filterProject || filterPartNumber || filterFrom || filterTo;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
          value={filterUser}
          onChange={(e) => { setFilterUser(e.target.value); setPage(1); }}
        >
          <option value="">All users</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
        >
          <option value="">All actions</option>
          {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
        </select>

        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
          value={filterEntity}
          onChange={(e) => { setFilterEntity(e.target.value); setPage(1); }}
        >
          <option value="">All entity types</option>
          {ENTITY_OPTIONS.map((e) => <option key={e} value={e}>{entityLabel(e)}</option>)}
        </select>

        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
          value={filterProject}
          onChange={(e) => { setFilterProject(e.target.value); setPage(1); }}
        >
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <Input
          placeholder="Part number..."
          value={filterPartNumber}
          onChange={(e) => { setFilterPartNumber(e.target.value); setPage(1); }}
          className="text-sm"
        />

        <Input
          type="date"
          value={filterFrom}
          onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
          className="text-sm"
        />

        <Input
          type="date"
          value={filterTo}
          onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
          className="text-sm"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
          Clear filters
        </Button>
      )}

      {/* Results count + export */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {loading ? "Loading..." : `${total.toLocaleString()} event${total !== 1 ? "s" : ""}`}
        </p>
        <a
          href={`/api/admin/event-log/export?${(() => {
            const p = new URLSearchParams();
            if (filterUser) p.set("userId", filterUser);
            if (filterAction) p.set("action", filterAction);
            if (filterEntity) p.set("entityType", filterEntity);
            if (filterProject) p.set("projectId", filterProject);
            if (filterPartNumber) p.set("partNumber", filterPartNumber);
            if (filterFrom) p.set("from", filterFrom);
            if (filterTo) p.set("to", filterTo);
            return p.toString();
          })()}`}
          download
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export to Excel
        </a>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Project</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const isUserEntity = log.entityType === "User" || log.entityType === "user";
              const userSubject = isUserEntity
                ? (subjectFromMetadata(log.metadata) ??
                   tryParseJson(log.newValue ?? log.oldValue, "name") ??
                   tryParseJson(log.newValue ?? log.oldValue, "email") ??
                   (log.metadata as Record<string, unknown> | null)?.["email"] as string | null ??
                   log.user?.email ?? null)
                : null;
              const subject =
                log.product?.partNumber ??
                log.product?.itemName ??
                (log.entityType === "Project" ? log.project?.name ?? null : null) ??
                userSubject ??
                subjectFromMetadata(log.metadata) ??
                log.entityId.slice(0, 8);
              return (
                <tr
                  key={log.id}
                  className="border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer transition-colors"
                  onClick={() => setSelected(log)}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{relativeTime(log.createdAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-900">{log.user?.name ?? "System"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${actionTone(log.action)}`}>
                      {actionLabel(log.action)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{entityLabel(log.entityType)}</td>
                  <td className="px-3 py-2 text-gray-700 truncate max-w-[200px]">{subject}</td>
                  <td className="px-3 py-2 text-gray-500 truncate max-w-[160px]">{log.project?.name ?? "—"}</td>
                </tr>
              );
            })}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No events found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Detail drawer */}
      {selected && <EventDetailDrawer log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function EventDetailDrawer({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isUserEntity = log.entityType === "User" || log.entityType === "user";
  const userSubject = isUserEntity
    ? (subjectFromMetadata(log.metadata) ??
       tryParseJson(log.newValue ?? log.oldValue, "name") ??
       tryParseJson(log.newValue ?? log.oldValue, "email") ??
       (log.metadata as Record<string, unknown> | null)?.["email"] as string | null ??
       log.user?.email ?? null)
    : null;
  const subject =
    log.product?.partNumber ??
    log.product?.itemName ??
    (log.entityType === "Project" ? log.project?.name ?? null : null) ??
    userSubject ??
    subjectFromMetadata(log.metadata) ??
    log.entityId;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Event details"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{actionLabel(log.action)}</p>
            <p className="text-xs text-gray-500 truncate">{subject}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Summary */}
          <div className="space-y-3">
            <DetailField label="Timestamp" value={new Date(log.createdAt).toLocaleString()} />
            <DetailField label="User" value={log.user ? `${log.user.name} (${log.user.email})` : "System"} />
            <DetailField label="Role" value={log.user?.role ?? "—"} />
            <DetailField label="Action">
              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${actionTone(log.action)}`}>
                {actionLabel(log.action)}
              </span>
            </DetailField>
            <DetailField label="Entity type" value={entityLabel(log.entityType)} />
            <DetailField label="Entity ID" value={log.entityId} mono />
            {log.source && <DetailField label="Source" value={log.source} />}
          </div>

          {/* Links */}
          {(log.project || log.product) && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Related</p>
              {log.project && (
                <Link
                  href={`/projects/${log.project.id}`}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {log.project.name}
                </Link>
              )}
              {log.product && (
                <Link
                  href={`/projects/${log.projectId}/products/${log.product.id}`}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {log.product.partNumber ?? log.product.itemName ?? log.product.id}
                </Link>
              )}
            </div>
          )}

          {/* Field change */}
          {log.fieldKey && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Field change</p>
              <p className="text-sm text-gray-700 font-medium">{fieldLabel(log.fieldKey)}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Old value</p>
                  <div className="rounded bg-red-50 border border-red-100 p-2 text-sm text-gray-800 break-words whitespace-pre-wrap">
                    {log.oldValue ? prettyValue(log.oldValue) : <span className="text-gray-400 italic">empty</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">New value</p>
                  <div className="rounded bg-green-50 border border-green-100 p-2 text-sm text-gray-800 break-words whitespace-pre-wrap">
                    {log.newValue ? prettyValue(log.newValue) : <span className="text-gray-400 italic">empty</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Non-field old/new values (e.g. settings) */}
          {!log.fieldKey && (log.oldValue || log.newValue) && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Change details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Before</p>
                  <div className="rounded bg-red-50 border border-red-100 p-2 text-sm text-gray-800 break-words whitespace-pre-wrap">
                    {log.oldValue ? prettyValue(log.oldValue) : <span className="text-gray-400 italic">—</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">After</p>
                  <div className="rounded bg-green-50 border border-green-100 p-2 text-sm text-gray-800 break-words whitespace-pre-wrap">
                    {log.newValue ? prettyValue(log.newValue) : <span className="text-gray-400 italic">—</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Metadata</p>
              <div className="rounded bg-gray-50 border p-3 text-xs font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(log.metadata, null, 2)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-24 shrink-0 text-xs text-gray-500 pt-0.5">{label}</span>
      {children ?? (
        <span className={`text-sm text-gray-800 break-words ${mono ? "font-mono text-xs" : ""}`}>
          {value}
        </span>
      )}
    </div>
  );
}
