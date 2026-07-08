"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { ShareLinkButton } from "@/components/share-link-button";
import {
  ArrowLeft, Save, CheckCircle2, Trash2, FileText, X, Search,
  ExternalLink, ShieldCheck, Upload, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductRef = {
  id: string; partNumber: string | null; itemName: string | null; brand: string | null;
  project: { id: string; name: string };
};

type EventDocument = {
  id: string; originalName: string; filePath: string; fileSize: number | null; createdAt: string;
  uploadedBy: { name: string | null; email: string };
};

type ComplianceEvent = {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: string;
  severity: string;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  type: { id: string; name: string; color: string };
  createdBy: { name: string | null; email: string };
  updatedBy: { name: string | null; email: string } | null;
  products: { product: ProductRef }[];
  documents: EventDocument[];
};

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "WAIVED"];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-600",
  WAIVED: "bg-amber-100 text-amber-800",
};

const SEVERITY_STYLES: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ComplianceDetailClient({ eventId, userRole }: { eventId: string; userRole: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<ComplianceEvent | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [status, setStatus] = useState("OPEN");
  const [dueDate, setDueDate] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Product search
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductRef[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canEdit = ["ADMIN", "PRODUCT_MANAGER", "CONTRIBUTOR"].includes(userRole);
  const canShare = ["ADMIN", "PRODUCT_MANAGER"].includes(userRole);

  const hydrate = useCallback((ev: ComplianceEvent) => {
    setEvent(ev);
    setTitle(ev.title);
    setDescription(ev.description ?? "");
    setNotes(ev.notes ?? "");
    setSeverity(ev.severity);
    setStatus(ev.status);
    setDueDate(ev.dueDate ? new Date(ev.dueDate).toISOString().slice(0, 10) : "");
    setDirty(false);
  }, []);

  useEffect(() => {
    fetch(`/api/compliance/events/${eventId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((ev) => { if (ev) hydrate(ev); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId, hydrate]);

  // Debounced product search
  useEffect(() => {
    if (!search.trim()) { setResults([]); setSearchOpen(false); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/products?search=${encodeURIComponent(search)}&pageSize=10`);
      if (res.ok) {
        const data = await res.json();
        const linked = new Set(event?.products.map((p) => p.product.id) ?? []);
        setResults((data.data ?? []).filter((p: ProductRef) => !linked.has(p.id)));
        setSearchOpen(true);
      }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, event]);

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/compliance/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      hydrate(await res.json());
      return true;
    }
    return false;
  };

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    const ok = await patch({
      title,
      description: description || null,
      notes: notes || null,
      severity,
      status,
      dueDate: dueDate || null,
    });
    setSaveMsg(ok ? "Saved." : "Save failed.");
    setSaving(false);
  };

  const addProduct = (p: ProductRef) => {
    patch({ addProductIds: [p.id] });
    setSearch("");
    setSearchOpen(false);
  };

  const removeProduct = (productId: string) => patch({ removeProductIds: [productId] });

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/compliance/events/${eventId}/documents`, { method: "POST", body: fd });
    if (res.ok) {
      const fresh = await fetch(`/api/compliance/events/${eventId}`);
      if (fresh.ok) hydrate(await fresh.json());
    }
    setUploading(false);
  };

  const deleteDocument = async (docId: string) => {
    if (!confirm("Delete this attachment?")) return;
    await fetch(`/api/compliance/events/${eventId}/documents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId }),
    });
    setEvent((prev) => prev ? { ...prev, documents: prev.documents.filter((d) => d.id !== docId) } : prev);
  };

  const deleteEvent = async () => {
    if (!confirm("Delete this compliance event? This cannot be undone.")) return;
    const res = await fetch(`/api/compliance/events/${eventId}`, { method: "DELETE" });
    if (res.ok) router.push("/compliance");
  };

  if (loading) return <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>;
  if (!event) return <div className="p-12 text-center text-gray-400 text-sm">Compliance event not found.</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-start gap-4 max-w-5xl mx-auto">
          <Link href="/compliance" className="mt-1 text-gray-400 hover:text-gray-700 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-0.5">
              <Link href="/compliance" className="hover:text-indigo-600">Compliance</Link>
              <span>/</span>
              <span className="text-gray-600 truncate max-w-xs">{event.title}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0" />
              {canEdit ? (
                <input
                  className="text-xl font-bold text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-indigo-500 min-w-0 flex-1"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
                />
              ) : (
                <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: `${event.type.color}20`, color: event.type.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: event.type.color }} />
                {event.type.name}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SEVERITY_STYLES[event.severity] ?? ""}`}>{event.severity}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[event.status] ?? ""}`}>{event.status.replace("_", " ")}</span>
            </div>
            <div className="mt-1 text-xs text-gray-400">
              Created by {event.createdBy.name ?? event.createdBy.email} · {formatDate(event.createdAt)}
              {event.updatedBy && ` · Updated by ${event.updatedBy.name ?? event.updatedBy.email} · ${formatDate(event.updatedAt)}`}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canShare && <ShareLinkButton entityType="COMPLIANCE" entityId={event.id} />}
            {canEdit && (
              <button
                onClick={deleteEvent}
                className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Delete event"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

          {/* Core fields */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                disabled={!canEdit}
                value={status}
                onChange={(e) => { setStatus(e.target.value); setDirty(true); }}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
              <select
                disabled={!canEdit}
                value={severity}
                onChange={(e) => { setSeverity(e.target.value); setDirty(true); }}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
              >
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
              <Input
                type="date"
                disabled={!canEdit}
                value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); setDirty(true); }}
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea
                disabled={!canEdit}
                rows={2}
                value={description}
                onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                disabled={!canEdit}
                rows={3}
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
              />
            </div>
          </div>

          {/* Affected products */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Affected Products ({event.products.length})</h2>
            {canEdit && (
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <Input
                  className="pl-8 text-sm h-8"
                  placeholder="Search products to link…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                />
                {searchOpen && results.length > 0 && (
                  <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {results.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => addProduct(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span>
                          <span className="font-mono text-xs text-gray-400">{p.partNumber ?? "—"}</span>
                          {" "}<span className="text-gray-700">{p.itemName ?? ""}</span>
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">{p.project.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1">
              {event.products.length === 0 && <p className="text-xs text-gray-400 italic">No products linked.</p>}
              {event.products.map(({ product }) => (
                <div key={product.id} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded px-2.5 py-2">
                  <span>
                    <span className="font-mono text-gray-500">{product.partNumber ?? "—"}</span>
                    {" "}<span className="text-gray-700">{product.itemName ?? ""}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <a href={`/projects/${product.project.id}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1">
                      {product.project.name} <ExternalLink className="h-3 w-3" />
                    </a>
                    {canEdit && (
                      <button onClick={() => removeProduct(product.id)} className="text-gray-300 hover:text-red-400" title="Unlink product">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Attachments ({event.documents.length})</h2>
              {canEdit && (
                <>
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploading ? "Uploading…" : "Upload File"}
                  </Button>
                  <input ref={fileRef} type="file" className="hidden" onChange={uploadFile} />
                </>
              )}
            </div>
            <div className="space-y-1">
              {event.documents.length === 0 && <p className="text-xs text-gray-400 italic">No attachments.</p>}
              {event.documents.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-100 rounded px-2.5 py-2 group">
                  {isImageFile(d.originalName) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/${d.filePath}`} alt="" className="h-9 w-9 object-cover rounded shrink-0 border border-gray-200" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  )}
                  <a href={`/${d.filePath}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline truncate flex-1">
                    {d.originalName}
                  </a>
                  {d.fileSize && <span className="text-gray-400 shrink-0">{formatBytes(d.fileSize)}</span>}
                  <span className="text-gray-400 shrink-0">by {d.uploadedBy.name ?? d.uploadedBy.email}</span>
                  {canEdit && (
                    <button onClick={() => deleteDocument(d.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save bar */}
      {canEdit && (
        <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div className="text-sm">
              {saveMsg && (
                <span className={`flex items-center gap-1.5 ${saveMsg.includes("failed") ? "text-red-600" : "text-green-600"}`}>
                  {!saveMsg.includes("failed") && <CheckCircle2 className="h-4 w-4" />}
                  {saveMsg}
                </span>
              )}
              {dirty && !saveMsg && <span className="text-amber-600">Unsaved changes</span>}
            </div>
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
