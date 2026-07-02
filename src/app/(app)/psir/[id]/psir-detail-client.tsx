"use client";

import { useState, useCallback, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { ShareLinkButton } from "@/components/share-link-button";
import {
  ArrowLeft, Save, CheckCircle2, AlertCircle, RefreshCw, Upload, Trash2,
  FileText, Download, Plus, X, Search, Package, ExternalLink,
  ClipboardCheck, CheckCircle, XCircle, Clock, AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttrDef = {
  id: string; key: string; label: string; description: string | null;
  attributeType: string; sortOrder: number; options: string[];
};

type AttrValue = { id: string; psirId: string; attrDefId: string; value: string | null; attrDef: AttrDef };

type ProductRef = {
  id: string; partNumber: string | null; itemName: string | null; brand: string | null; upc: string | null;
  project: { id: string; name: string };
};

type Document = {
  id: string; fileName: string; originalName: string; fileType: string | null;
  fileSize: number | null; filePath: string; createdAt: string;
  uploadedBy: { name: string | null; email: string };
};

type Psir = {
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
  updatedAt: string;
  createdBy: { name: string | null; email: string };
  updatedBy: { name: string | null; email: string } | null;
  documents: Document[];
  products: { product: ProductRef }[];
  attributeValues: AttrValue[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RESULTS = ["PENDING", "PASS", "FAIL", "CONDITIONAL"];
const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"];

const RESULT_META: Record<string, { cls: string; icon: React.ReactNode }> = {
  PASS: { cls: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle className="h-4 w-4" /> },
  FAIL: { cls: "bg-red-100 text-red-700 border-red-200", icon: <XCircle className="h-4 w-4" /> },
  CONDITIONAL: { cls: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <AlertTriangle className="h-4 w-4" /> },
  PENDING: { cls: "bg-gray-100 text-gray-600 border-gray-200", icon: <Clock className="h-4 w-4" /> },
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Product Picker ───────────────────────────────────────────────────────────

function ProductPicker({
  linkedIds,
  onAdd,
  onBulkAdd,
}: {
  linkedIds: Set<string>;
  onAdd: (p: ProductRef) => void;
  onBulkAdd: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductRef[]>([]);
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResolving, setBulkResolving] = useState(false);
  const [bulkResolved, setBulkResolved] = useState<{ found: ProductRef[]; notFound: string[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!search.trim()) { setResults([]); setOpen(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/products?search=${encodeURIComponent(search)}&pageSize=10`);
      if (res.ok) {
        const data = await res.json();
        setResults((data.data ?? []).filter((p: ProductRef) => !linkedIds.has(p.id)));
        setOpen(true);
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search, linkedIds]);

  async function resolveBulk() {
    const parts = bulkText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setBulkResolving(true);
    setBulkResolved(null);
    const found: ProductRef[] = [];
    const notFound: string[] = [];
    await Promise.all(
      parts.map(async (pn) => {
        const res = await fetch(`/api/products?search=${encodeURIComponent(pn)}&pageSize=5`);
        if (res.ok) {
          const data = await res.json();
          const match = (data.data ?? []).find(
            (p: ProductRef) => p.partNumber?.toLowerCase() === pn.toLowerCase()
          );
          if (match && !linkedIds.has(match.id)) found.push(match);
          else if (!match) notFound.push(pn);
        }
      })
    );
    setBulkResolved({ found, notFound });
    setBulkResolving(false);
  }

  async function confirmBulk() {
    if (!bulkResolved?.found.length) return;
    onBulkAdd(bulkResolved.found.map((p) => p.id));
    setBulkOpen(false);
    setBulkText("");
    setBulkResolved(null);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-8 text-sm h-8"
            placeholder="Search products to link…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        </div>
        {open && results.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={() => { onAdd(p); setSearch(""); setOpen(false); }}
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

      {/* Bulk Add */}
      <div className="relative">
        <Button size="sm" variant="outline" className="h-8 text-xs whitespace-nowrap" onClick={() => { setBulkOpen((v) => !v); setBulkResolved(null); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Bulk Add
        </Button>
        {bulkOpen && (
          <div className="absolute z-50 right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">Bulk Add by Part Number</p>
            <p className="text-xs text-gray-500">Paste part numbers separated by commas or newlines.</p>
            <textarea
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
              rows={4}
              placeholder={"78834-TEST\n78835-TEST\n78836-TEST"}
              value={bulkText}
              onChange={(e) => { setBulkText(e.target.value); setBulkResolved(null); }}
            />
            {bulkResolved && (
              <div className="space-y-1.5 text-xs">
                {bulkResolved.found.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2 space-y-1">
                    <p className="font-medium text-green-700">{bulkResolved.found.length} found:</p>
                    {bulkResolved.found.map((p) => (
                      <p key={p.id} className="text-green-600 font-mono">{p.partNumber} — {p.itemName ?? ""}</p>
                    ))}
                  </div>
                )}
                {bulkResolved.notFound.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 space-y-1">
                    <p className="font-medium text-red-700">{bulkResolved.notFound.length} not found:</p>
                    {bulkResolved.notFound.map((pn) => (
                      <p key={pn} className="text-red-500 font-mono">{pn}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end items-center">
              <label className="text-xs text-violet-600 hover:text-violet-800 cursor-pointer underline mr-auto">
                Upload .xlsx
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const fd = new FormData();
                    fd.append("file", f);
                    const res = await fetch("/api/parse-part-numbers", { method: "POST", body: fd });
                    if (res.ok) {
                      const { partNumbers } = await res.json();
                      setBulkText((prev) => [prev.trim(), ...partNumbers].filter(Boolean).join("\n"));
                      setBulkResolved(null);
                    }
                  }}
                />
              </label>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setBulkOpen(false); setBulkText(""); setBulkResolved(null); }}>Cancel</Button>
              {bulkResolved?.found.length ? (
                <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700" onClick={confirmBulk}>
                  Add {bulkResolved.found.length} Products
                </Button>
              ) : (
                <Button size="sm" className="h-7 text-xs" onClick={resolveBulk} disabled={bulkResolving || !bulkText.trim()}>
                  {bulkResolving ? "Looking up…" : "Look Up"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label, children, note,
}: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between rounded-t-xl">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PsirDetailClient({ psir: initial, attrDefs }: { psir: Psir; attrDefs: AttrDef[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [psir, setPsir] = useState<Psir>(initial);

  // Core fields
  const [title, setTitle] = useState(initial.title);
  const [refNum, setRefNum] = useState(initial.referenceNumber ?? "");
  const [inspector, setInspector] = useState(initial.inspector ?? "");
  const [company, setCompany] = useState(initial.inspectionCompany ?? "");
  const [factory, setFactory] = useState(initial.factory ?? "");
  const [country, setCountry] = useState(initial.countryOfOrigin ?? "");
  const [inspDate, setInspDate] = useState(
    initial.inspectionDate ? initial.inspectionDate.slice(0, 10) : ""
  );
  const [result, setResult] = useState(initial.result);
  const [status, setStatus] = useState(initial.status);
  const [notes, setNotes] = useState(initial.notes ?? "");

  // Custom attrs
  const [attrValues, setAttrValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const av of initial.attributeValues) {
      out[av.attrDefId] = av.value ?? "";
    }
    return out;
  });

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  // File upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const markDirty = useCallback(() => { setDirty(true); setSaveStatus("idle"); }, []);

  async function save() {
    if (!title.trim()) return;
    setSaving(true); setSaveError("");

    const attributeValues = attrDefs.map((d) => ({ attrDefId: d.id, value: attrValues[d.id] ?? "" }));

    const res = await fetch(`/api/psir/${psir.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, referenceNumber: refNum || null, inspectionDate: inspDate || null,
        inspector: inspector || null, inspectionCompany: company || null,
        factory: factory || null, countryOfOrigin: country || null,
        result, status, notes: notes || null, attributeValues,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setPsir(updated);
      setDirty(false);
      setSaveStatus("saved");
      startTransition(() => router.refresh());
    } else {
      setSaveError("Save failed");
      setSaveStatus("error");
    }
    setSaving(false);
  }

  async function uploadFile(file: File) {
    setUploading(true); setUploadError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/psir/${psir.id}/documents`, { method: "POST", body: fd });
    if (res.ok) {
      const doc = await res.json();
      setPsir((prev) => ({ ...prev, documents: [doc, ...prev.documents] }));
    } else {
      setUploadError("Upload failed");
    }
    setUploading(false);
  }

  async function deleteDoc(docId: string) {
    if (!confirm("Remove this file?")) return;
    const res = await fetch(`/api/psir/${psir.id}/documents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId }),
    });
    if (res.ok) setPsir((prev) => ({ ...prev, documents: prev.documents.filter((d) => d.id !== docId) }));
  }

  async function addProduct(p: ProductRef) {
    const res = await fetch(`/api/psir/${psir.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addProductIds: [p.id] }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPsir(updated);
    }
  }

  async function bulkAddProducts(ids: string[]) {
    const res = await fetch(`/api/psir/${psir.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addProductIds: ids }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPsir(updated);
    }
  }

  async function removeProduct(productId: string) {
    const res = await fetch(`/api/psir/${psir.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeProductIds: [productId] }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPsir(updated);
    }
  }

  async function deletePsir() {
    if (!confirm("Delete this inspection report and all its files? This cannot be undone.")) return;
    await fetch(`/api/psir/${psir.id}`, { method: "DELETE" });
    router.push("/psir");
  }

  const resultMeta = RESULT_META[result] ?? RESULT_META.PENDING;
  const linkedIds = new Set(psir.products.map((pp) => pp.product.id));

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0 z-10">
        <div className="flex items-start gap-4 max-w-5xl mx-auto">
          <Link href="/psir" className="mt-1 text-gray-400 hover:text-gray-700 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <Link href="/psir" className="hover:text-violet-600">Inspections</Link>
              <span>/</span>
              <span className="text-gray-600 truncate max-w-xs">{psir.title}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <ClipboardCheck className="h-5 w-5 text-violet-600 shrink-0" />
              {dirty ? (
                <input
                  className="text-xl font-bold text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-violet-500 min-w-0 flex-1"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); markDirty(); }}
                />
              ) : (
                <h1
                  className="text-xl font-bold text-gray-900 cursor-text"
                  onClick={() => setDirty(true)}
                >{psir.title}</h1>
              )}
              {psir.referenceNumber && (
                <span className="text-sm font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{psir.referenceNumber}</span>
              )}
              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${resultMeta.cls}`}>
                {resultMeta.icon} {result}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full ${STATUS_STYLES[status] ?? ""}`}>{status}</span>
            </div>
            <div className="mt-1 text-xs text-gray-400">
              Created by {psir.createdBy.name ?? psir.createdBy.email} · {formatDate(psir.createdAt)}
              {psir.updatedBy && ` · Updated by ${psir.updatedBy.name ?? psir.updatedBy.email} · ${formatDate(psir.updatedAt)}`}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ShareLinkButton entityType="PSIR" entityId={psir.id} />
            <button
              onClick={deletePsir}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete report"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

          {/* Core fields */}
          <Card title="Inspection Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Reference Number">
                <Input value={refNum} onChange={(e) => { setRefNum(e.target.value); markDirty(); }} placeholder="e.g. PSIR-2025-001" className="text-sm" />
              </Field>
              <Field label="Inspection Date">
                <Input type="date" value={inspDate} onChange={(e) => { setInspDate(e.target.value); markDirty(); }} className="text-sm" />
              </Field>
              <Field label="Country of Origin">
                <Input value={country} onChange={(e) => { setCountry(e.target.value); markDirty(); }} placeholder="e.g. China" className="text-sm" />
              </Field>
              <Field label="Inspector Name">
                <Input value={inspector} onChange={(e) => { setInspector(e.target.value); markDirty(); }} placeholder="Name of inspector" className="text-sm" />
              </Field>
              <Field label="Inspection Company">
                <Input value={company} onChange={(e) => { setCompany(e.target.value); markDirty(); }} placeholder="e.g. SGS, Bureau Veritas" className="text-sm" />
              </Field>
              <Field label="Factory / Supplier">
                <Input value={factory} onChange={(e) => { setFactory(e.target.value); markDirty(); }} placeholder="Factory name or location" className="text-sm" />
              </Field>
              <Field label="Inspection Result">
                <select
                  value={result}
                  onChange={(e) => { setResult(e.target.value); markDirty(); }}
                  className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Report Status">
                <select
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); markDirty(); }}
                  className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Notes">
                  <textarea
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); markDirty(); }}
                    rows={3}
                    placeholder="Inspection findings, defects noted, corrective actions required…"
                    className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </Field>
              </div>
            </div>
          </Card>

          {/* Custom attributes */}
          {attrDefs.length > 0 && (
            <Card title="Custom Attributes">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {attrDefs.map((def) => (
                  <Field key={def.id} label={def.label} note={def.description ?? undefined}>
                    {def.attributeType === "TEXTAREA" ? (
                      <textarea
                        value={attrValues[def.id] ?? ""}
                        onChange={(e) => { setAttrValues((p) => ({ ...p, [def.id]: e.target.value })); markDirty(); }}
                        rows={3}
                        className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    ) : def.attributeType === "SELECT" && def.options.length > 0 ? (
                      <select
                        value={attrValues[def.id] ?? ""}
                        onChange={(e) => { setAttrValues((p) => ({ ...p, [def.id]: e.target.value })); markDirty(); }}
                        className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      >
                        <option value="">—</option>
                        {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : def.attributeType === "BOOLEAN" ? (
                      <label className="flex items-center gap-2 cursor-pointer mt-1">
                        <input
                          type="checkbox"
                          checked={attrValues[def.id] === "true"}
                          onChange={(e) => { setAttrValues((p) => ({ ...p, [def.id]: e.target.checked ? "true" : "false" })); markDirty(); }}
                          className="h-4 w-4 rounded accent-violet-600"
                        />
                        <span className="text-sm text-gray-700">Yes</span>
                      </label>
                    ) : (
                      <Input
                        type={def.attributeType === "NUMBER" ? "number" : def.attributeType === "DATE" ? "date" : "text"}
                        value={attrValues[def.id] ?? ""}
                        onChange={(e) => { setAttrValues((p) => ({ ...p, [def.id]: e.target.value })); markDirty(); }}
                        className="text-sm"
                      />
                    )}
                  </Field>
                ))}
              </div>
            </Card>
          )}

          {/* Linked products */}
          <Card
            title={`Products (${psir.products.length})`}
            action={
              <div className="w-96 overflow-visible">
                <ProductPicker linkedIds={linkedIds} onAdd={addProduct} onBulkAdd={bulkAddProducts} />
              </div>
            }
          >
            {psir.products.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center text-gray-400">
                <Package className="h-8 w-8 mb-2 text-gray-200" />
                <p className="text-sm">No products linked yet.</p>
                <p className="text-xs mt-1">Use the search above to link products to this report.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {psir.products.map(({ product }) => (
                  <div key={product.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-mono text-xs text-gray-400">{product.partNumber ?? "—"}</span>
                      {" "}<span className="text-sm text-gray-700">{product.itemName ?? ""}</span>
                      {product.brand && <span className="ml-2 text-xs text-gray-400">· {product.brand}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/projects/${product.project.id}`}
                        className="text-xs text-violet-600 hover:underline flex items-center gap-1"
                        target="_blank"
                      >
                        {product.project.name} <ExternalLink className="h-3 w-3" />
                      </Link>
                      <button onClick={() => removeProduct(product.id)} className="p-1 rounded hover:bg-red-50 text-red-400">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Documents */}
          <Card
            title={`Documents (${psir.documents.length})`}
            action={
              <div>
                <input ref={fileInput} type="file" className="hidden" accept="*/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
                />
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  {uploading ? "Uploading…" : "Upload File"}
                </Button>
              </div>
            }
          >
            {uploadError && <p className="text-xs text-red-600 mb-3">{uploadError}</p>}
            {psir.documents.length === 0 ? (
              <div
                className="flex flex-col items-center py-10 border-2 border-dashed border-gray-200 rounded-xl text-center cursor-pointer hover:border-violet-300 transition-colors"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) uploadFile(f);
                }}
              >
                <Upload className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Drop files here or click Upload</p>
                <p className="text-xs text-gray-400 mt-1">PDF, Excel, images — any format supported</p>
              </div>
            ) : (
              <div
                className="space-y-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) uploadFile(f);
                }}
              >
                {psir.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 group">
                    <FileText className="h-4 w-4 text-violet-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{doc.originalName}</p>
                      <p className="text-xs text-gray-400">
                        {doc.fileSize ? formatBytes(doc.fileSize) : ""}
                        {" · "}uploaded by {doc.uploadedBy.name ?? doc.uploadedBy.email}
                        {" · "}{formatDate(doc.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={`/${doc.filePath}`}
                        download={doc.originalName}
                        className="p-1.5 rounded hover:bg-gray-200 text-gray-500"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button onClick={() => deleteDoc(doc.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => fileInput.current?.click()}
                  className="w-full py-2 text-xs text-violet-600 hover:text-violet-800 text-center border border-dashed border-gray-200 rounded-lg hover:border-violet-300 transition-colors"
                >
                  <Plus className="inline h-3 w-3 mr-1" /> Add another file
                </button>
              </div>
            )}
          </Card>

          <div className="h-20" />
        </div>
      </div>

      {/* Save bar */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-3 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="text-sm">
            {saveStatus === "saved" && !dirty && (
              <span className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="h-4 w-4" /> All changes saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1.5 text-red-600">
                <AlertCircle className="h-4 w-4" /> {saveError}
              </span>
            )}
            {dirty && saveStatus !== "error" && (
              <span className="text-amber-600 text-xs">Unsaved changes</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/psir")}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving || !dirty} className="min-w-[110px]">
              {saving ? (
                <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="h-3.5 w-3.5 mr-1.5" /> Save Changes</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
