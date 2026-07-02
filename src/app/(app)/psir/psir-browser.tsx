"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import {
  ClipboardCheck, Plus, Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  CheckCircle2, XCircle, Clock, AlertTriangle, FileText, Package, Pencil, Trash2, ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductRef = {
  id: string; partNumber: string | null; itemName: string | null;
  project: { id: string; name: string };
};

type DocumentRef = {
  id: string; originalName: string; filePath: string; fileSize: number | null;
};

type PsirRow = {
  id: string;
  title: string;
  referenceNumber: string | null;
  inspectionDate: string | null;
  inspector: string | null;
  inspectionCompany: string | null;
  factory: string | null;
  countryOfOrigin: string | null;
  result: string;
  status: string;
  notes: string | null;
  createdAt: string;
  createdBy: { name: string | null; email: string };
  products: { product: ProductRef }[];
  documents: DocumentRef[];
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESULTS = ["PENDING", "PASS", "FAIL", "CONDITIONAL"];
const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"];

const RESULT_STYLES: Record<string, { cls: string; icon: React.ReactNode }> = {
  PASS: { cls: "bg-green-100 text-green-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  FAIL: { cls: "bg-red-100 text-red-700", icon: <XCircle className="h-3.5 w-3.5" /> },
  CONDITIONAL: { cls: "bg-yellow-100 text-yellow-800", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  PENDING: { cls: "bg-gray-100 text-gray-600", icon: <Clock className="h-3.5 w-3.5" /> },
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

// ─── Quick Create Modal ───────────────────────────────────────────────────────

function QuickCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    const res = await fetch("/api/psir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const psir = await res.json();
      onCreated(psir.id);
    } else {
      setError("Failed to create PSIR");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">New Inspection Report</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={create} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Report Title <span className="text-red-500">*</span></label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Factory XYZ — Spring 2025 Inspection"
            />
            <p className="text-xs text-gray-400 mt-1">You can fill in all details on the next screen.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create & Open"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── PSIR Row Card ────────────────────────────────────────────────────────────

function PsirCard({
  psir,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  psir: PsirRow;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const resultMeta = RESULT_STYLES[psir.result] ?? RESULT_STYLES.PENDING;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-indigo-200 transition-colors">
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{psir.title}</p>
            {psir.referenceNumber && (
              <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{psir.referenceNumber}</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {psir.inspectionCompany && <span>{psir.inspectionCompany}</span>}
            {psir.factory && <span className="text-gray-400">· {psir.factory}</span>}
            {psir.inspectionDate && <span className="text-gray-400">· {formatDate(psir.inspectionDate)}</span>}
            {psir.inspector && <span className="text-gray-400">· {psir.inspector}</span>}
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {psir.products.length} product{psir.products.length !== 1 ? "s" : ""}</span>
            {psir.documents.length > 0 && (
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {psir.documents.length} file{psir.documents.length !== 1 ? "s" : ""}</span>
            )}
            <span>by {psir.createdBy.name ?? psir.createdBy.email} · {formatDate(psir.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${resultMeta.cls}`}>
            {resultMeta.icon} {psir.result}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[psir.status] ?? ""}`}>{psir.status}</span>
          <button onClick={() => setExpanded((x) => !x)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50">
          {psir.notes && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{psir.notes}</p>
            </div>
          )}

          {psir.countryOfOrigin && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Country of Origin</p>
              <p className="text-sm text-gray-700">{psir.countryOfOrigin}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Products</p>
            <div className="space-y-1">
              {psir.products.length === 0 && (
                <p className="text-xs text-gray-400 italic">No products linked</p>
              )}
              {psir.products.map(({ product }) => (
                <div key={product.id} className="flex items-center justify-between text-xs bg-white border border-gray-100 rounded px-2 py-1.5">
                  <span>
                    <span className="font-mono text-gray-500">{product.partNumber ?? "—"}</span>
                    {" "}<span className="text-gray-700">{product.itemName ?? ""}</span>
                  </span>
                  <a
                    href={`/projects/${product.project.id}`}
                    className="text-indigo-600 hover:underline flex items-center gap-1"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {product.project.name} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>

          {psir.documents.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Attachments</p>
              <div className="space-y-1">
                {psir.documents.map((d) => (
                  <a
                    key={d.id}
                    href={`/${d.filePath}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-xs bg-white border border-gray-100 rounded px-2 py-1.5 hover:bg-indigo-50 group"
                  >
                    {isImageFile(d.originalName) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/${d.filePath}`} alt="" className="h-9 w-9 object-cover rounded shrink-0 border border-gray-200" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    )}
                    <span className="text-indigo-600 group-hover:underline truncate flex-1">{d.originalName}</span>
                    {d.fileSize && <span className="text-gray-400 shrink-0">{formatBytes(d.fileSize)}</span>}
                    <ExternalLink className="h-3 w-3 text-gray-300 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Change status:</span>
            {STATUSES.filter((s) => s !== psir.status).map((s) => (
              <button
                key={s}
                onClick={() => onStatusChange(s)}
                className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-100 text-gray-600"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Browser ─────────────────────────────────────────────────────────────

export function PsirBrowser() {
  const router = useRouter();
  const [psirs, setPsirs] = useState<PsirRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterResult, setFilterResult] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = 20;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filterStatus) params.set("status", filterStatus);
    if (filterResult) params.set("result", filterResult);
    const res = await fetch(`/api/psir?${params}`);
    if (res.ok) {
      const data = await res.json();
      setPsirs(data.psirs);
      setTotal(data.total);
    }
    setLoading(false);
  }, [page, debouncedSearch, filterStatus, filterResult]);

  useEffect(() => { load(); }, [load]);

  async function deletePsir(id: string) {
    if (!confirm("Delete this inspection report? This cannot be undone.")) return;
    await fetch(`/api/psir/${id}`, { method: "DELETE" });
    load();
  }

  async function changeStatus(id: string, status: string) {
    const res = await fetch(`/api/psir/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPsirs((prev) => prev.map((p) => (p.id === id ? updated : p)));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const passCount = psirs.filter((p) => p.result === "PASS").length;
  const failCount = psirs.filter((p) => p.result === "FAIL").length;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <ClipboardCheck className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Pre-Shipment Inspections</h1>
              <p className="text-xs text-gray-500">
                {total.toLocaleString()} report{total !== 1 ? "s" : ""}
                {passCount > 0 && ` · ${passCount} passed`}
                {failCount > 0 && ` · ${failCount} failed`}
              </p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> New Report
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
          <Input className="pl-8 w-72 text-sm h-8" placeholder="Search reports, factory, inspector, part number…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select value={filterResult} onChange={(e) => { setFilterResult(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none">
          <option value="">All Results</option>
          {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(filterStatus || filterResult || debouncedSearch) && (
          <button onClick={() => { setFilterStatus(""); setFilterResult(""); setSearch(""); setPage(1); }}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading && <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>}
        {!loading && psirs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ClipboardCheck className="h-12 w-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">No inspection reports yet</p>
            <p className="text-gray-400 text-sm mt-1">Create your first PSIR to track pre-shipment quality inspections.</p>
            <Button className="mt-4" onClick={() => setShowCreate(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> New Report
            </Button>
          </div>
        )}
        {!loading && psirs.map((psir) => (
          <PsirCard
            key={psir.id}
            psir={psir}
            onEdit={() => router.push(`/psir/${psir.id}`)}
            onDelete={() => deletePsir(psir.id)}
            onStatusChange={(s) => changeStatus(psir.id, s)}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
          <p className="text-sm text-gray-500">Page {page} of {totalPages} ({total.toLocaleString()} reports)</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {showCreate && (
        <QuickCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => router.push(`/psir/${id}`)}
        />
      )}
    </div>
  );
}
