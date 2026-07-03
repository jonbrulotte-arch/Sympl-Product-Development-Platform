"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Plus, X, Search, ChevronLeft, ChevronRight,
  Trash2, Paperclip, FileText, Upload,
} from "lucide-react";
import { EventCard } from "@/components/compliance/event-card";

// ─── Types ───────────────────────────────────────────────────────────────────

type EventType = {
  id: string; name: string; description: string | null; color: string; sortOrder: number;
};

type ProductRef = {
  id: string; partNumber: string | null; itemName: string | null; brand: string | null;
  project: { id: string; name: string };
};

type ComplianceDocument = {
  id: string;
  originalName: string;
  fileType: string | null;
  fileSize: number | null;
  filePath: string;
  createdAt: string;
  uploadedBy: { id: string; name: string | null; email: string };
};

type ComplianceEvent = {
  id: string;
  typeId: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: string;
  severity: string;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  type: EventType;
  createdBy: { id: string; name: string | null; email: string };
  products: { product: ProductRef }[];
  documents: ComplianceDocument[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "WAIVED"];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// ─── Product Picker ───────────────────────────────────────────────────────────

function ProductPicker({
  selected,
  onChange,
}: {
  selected: { id: string; label: string }[];
  onChange: (products: { id: string; label: string }[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductRef[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteStatus, setPasteStatus] = useState<{ found: number; notFound: string[] } | null>(null);
  const [looking, setLooking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Live search
  useEffect(() => {
    if (!search.trim()) { setResults([]); setShowDropdown(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/products?search=${encodeURIComponent(search.trim())}`);
      if (res.ok) {
        const data = await res.json();
        const products: ProductRef[] = data.data ?? [];
        // filter out already-selected
        setResults(products.filter((p) => !selected.find((s) => s.id === p.id)));
        setShowDropdown(true);
      }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search, selected]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function pick(p: ProductRef) {
    const label = [p.partNumber, p.itemName].filter(Boolean).join(" — ");
    onChange([...selected, { id: p.id, label }]);
    setSearch("");
    setResults([]);
    setShowDropdown(false);
  }

  async function resolvePaste() {
    const tokens = pasteText
      .split(/[\n,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tokens.length) return;
    setLooking(true);
    setPasteStatus(null);

    const notFound: string[] = [];
    const toAdd: { id: string; label: string }[] = [];
    const selectedIds = new Set(selected.map((s) => s.id));

    await Promise.all(
      tokens.map(async (token) => {
        const res = await fetch(`/api/products?search=${encodeURIComponent(token)}`);
        if (!res.ok) { notFound.push(token); return; }
        const data = await res.json();
        const products: ProductRef[] = data.data ?? [];
        // exact part-number match preferred, otherwise first result
        const match = products.find((p) => p.partNumber?.toLowerCase() === token.toLowerCase()) ?? products[0];
        if (!match || selectedIds.has(match.id)) {
          if (!match) notFound.push(token);
          return;
        }
        selectedIds.add(match.id);
        toAdd.push({ id: match.id, label: [match.partNumber, match.itemName].filter(Boolean).join(" — ") });
      })
    );

    onChange([...selected, ...toAdd]);
    setPasteStatus({ found: toAdd.length, notFound });
    setLooking(false);
    if (!notFound.length) { setPasteMode(false); setPasteText(""); }
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Mode toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setPasteMode(false); setPasteText(""); setPasteStatus(null); }}
          className={`text-xs font-medium pb-0.5 border-b-2 transition-colors ${!pasteMode ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => { setPasteMode(true); setSearch(""); setResults([]); setShowDropdown(false); }}
          className={`text-xs font-medium pb-0.5 border-b-2 transition-colors ${pasteMode ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Paste / Bulk
        </button>
      </div>

      {!pasteMode ? (
        /* Search mode */
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <Input
            className="pl-8 text-sm text-gray-900 placeholder:text-gray-400"
            placeholder="Search by part number or product name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            autoComplete="off"
          />
          {showDropdown && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-500">No products found for &ldquo;{search}&rdquo;</p>
              ) : results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-gray-500 shrink-0">{p.partNumber ?? "—"}</span>
                    <span className="text-gray-900 truncate">{p.itemName ?? ""}</span>
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{p.project.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Paste mode */
        <div className="space-y-2">
          <textarea
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setPasteStatus(null); }}
            rows={4}
            placeholder={"Paste part numbers — one per line, or comma/semicolon separated:\n78834-TEST\n90012-DEMO\n11234-WIDGET"}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {pasteStatus && (
            <div className={`text-xs rounded px-3 py-2 ${pasteStatus.notFound.length ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
              {pasteStatus.found > 0 && <span>{pasteStatus.found} product{pasteStatus.found !== 1 ? "s" : ""} added. </span>}
              {pasteStatus.notFound.length > 0 && (
                <span>Could not find: <strong>{pasteStatus.notFound.join(", ")}</strong></span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={resolvePaste} disabled={looking || !pasteText.trim()}>
              {looking ? "Looking up…" : "Add Products"}
            </Button>
            <label className="text-xs text-indigo-600 hover:text-indigo-800 cursor-pointer underline">
              or upload .xlsx
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
                    setPasteText((prev) => [prev.trim(), ...partNumbers].filter(Boolean).join("\n"));
                    setPasteStatus(null);
                  }
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {s.label}
              <button type="button" onClick={() => onChange(selected.filter((x) => x.id !== s.id))} className="text-indigo-400 hover:text-indigo-700">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Attachment Section ───────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentSection({
  eventId,
  docs,
  onDocsChange,
  pendingFiles,
  onPendingChange,
}: {
  eventId: string | null;
  docs: ComplianceDocument[];
  onDocsChange: (docs: ComplianceDocument[]) => void;
  pendingFiles: File[];
  onPendingChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function addPending(files: FileList | null) {
    if (!files) return;
    onPendingChange([...pendingFiles, ...Array.from(files)]);
  }

  async function deleteDoc(docId: string) {
    if (!eventId) return;
    await fetch(`/api/compliance/events/${eventId}/documents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId }),
    });
    onDocsChange(docs.filter((d) => d.id !== docId));
  }

  return (
    <div className="space-y-2">
      {/* Upload zone */}
      <div
        className="border-2 border-dashed border-gray-200 rounded-lg px-4 py-3 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addPending(e.dataTransfer.files); }}
      >
        <Upload className="h-4 w-4 text-gray-400 mx-auto mb-1" />
        <p className="text-xs text-gray-500">
          Drop files here or <span className="text-indigo-600 font-medium">browse</span>
        </p>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => addPending(e.target.files)} />
      </div>

      {/* Pending files (not yet uploaded) */}
      {pendingFiles.map((f, i) => (
        <div key={i} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded px-2.5 py-1.5">
          <FileText className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          <span className="text-xs text-indigo-700 truncate flex-1">{f.name}</span>
          <span className="text-xs text-indigo-400">{formatBytes(f.size)}</span>
          <button type="button" onClick={() => onPendingChange(pendingFiles.filter((_, j) => j !== i))} className="text-indigo-300 hover:text-indigo-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {/* Already-saved documents */}
      {docs.map((d) => (
        <div key={d.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded px-2.5 py-1.5">
          <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <a
            href={`/${d.filePath}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-600 hover:underline truncate flex-1"
          >
            {d.originalName}
          </a>
          {d.fileSize && <span className="text-xs text-gray-400">{formatBytes(d.fileSize)}</span>}
          <button type="button" onClick={() => deleteDoc(d.id)} className="text-gray-300 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

function EventModal({
  event,
  eventTypes,
  onClose,
  onSaved,
}: {
  event: ComplianceEvent | null;
  eventTypes: EventType[];
  onClose: () => void;
  onSaved: (e: ComplianceEvent) => void;
}) {
  const isEdit = !!event;
  const [typeId, setTypeId] = useState(event?.typeId ?? eventTypes[0]?.id ?? "");
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [severity, setSeverity] = useState(event?.severity ?? "MEDIUM");
  const [status, setStatus] = useState(event?.status ?? "OPEN");
  const [dueDate, setDueDate] = useState(
    event?.dueDate ? event.dueDate.slice(0, 10) : ""
  );
  const [selectedProducts, setSelectedProducts] = useState<{ id: string; label: string }[]>(
    event?.products.map((ep) => ({
      id: ep.product.id,
      label: [ep.product.partNumber, ep.product.itemName].filter(Boolean).join(" — "),
    })) ?? []
  );
  const [savedDocs, setSavedDocs] = useState<ComplianceDocument[]>(event?.documents ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !typeId || selectedProducts.length === 0) {
      setError("Title, event type, and at least one product are required.");
      return;
    }
    setSaving(true);
    setError("");

    async function uploadFiles(eid: string) {
      for (const file of pendingFiles) {
        const fd = new FormData();
        fd.append("file", file);
        await fetch(`/api/compliance/events/${eid}/documents`, { method: "POST", body: fd });
      }
    }

    try {
      if (isEdit) {
        const currentIds = event.products.map((ep) => ep.product.id);
        const newIds = selectedProducts.map((p) => p.id);
        const addProductIds = newIds.filter((id) => !currentIds.includes(id));
        const removeProductIds = currentIds.filter((id) => !newIds.includes(id));

        await uploadFiles(event.id);
        const res = await fetch(`/api/compliance/events/${event.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, notes, severity, status, dueDate: dueDate || null, addProductIds, removeProductIds }),
        });
        if (!res.ok) throw new Error(await res.text());
        onSaved(await res.json());
      } else {
        const res = await fetch("/api/compliance/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typeId, title, description, notes, severity, dueDate: dueDate || null, productIds: selectedProducts.map((p) => p.id) }),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        await uploadFiles(created.id);
        // re-fetch to get documents included
        const fresh = await fetch(`/api/compliance/events/${created.id}`);
        onSaved(fresh.ok ? await fresh.json() : created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "Edit Compliance Event" : "New Compliance Event"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief description of the compliance issue" className="text-gray-900 placeholder:text-gray-400" required />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Event Type <span className="text-red-500">*</span></label>
              <select
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                disabled={isEdit}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
              >
                {eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {isEdit && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </div>
            )}

            <div className={isEdit ? "" : "col-span-1"}>
              <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-gray-900" />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Additional context…"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Internal notes, action items, remediation steps…"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Products <span className="text-red-500">*</span></label>
              <ProductPicker selected={selectedProducts} onChange={setSelectedProducts} />
            </div>

            <div className="col-span-2">
              <div className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
                <Paperclip className="h-3.5 w-3.5" /> Attachments
              </div>
              <AttachmentSection
                eventId={event?.id ?? null}
                docs={savedDocs}
                onDocsChange={setSavedDocs}
                pendingFiles={pendingFiles}
                onPendingChange={setPendingFiles}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Event"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Browser ─────────────────────────────────────────────────────────────

export function ComplianceBrowser() {
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTypeId, setFilterTypeId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState<ComplianceEvent | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filterStatus) params.set("status", filterStatus);
    if (filterTypeId) params.set("typeId", filterTypeId);
    if (debouncedSearch) params.set("search", debouncedSearch);

    const res = await fetch(`/api/compliance/events?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events);
      setTotal(data.total);
    }
    setLoading(false);
  }, [page, filterStatus, filterTypeId, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/compliance/event-types")
      .then((r) => r.json())
      .then(setEventTypes)
      .catch(() => {});
  }, []);

  async function deleteEvent(id: string) {
    if (!confirm("Delete this compliance event? This cannot be undone.")) return;
    await fetch(`/api/compliance/events/${id}`, { method: "DELETE" });
    load();
  }

  async function changeStatus(id: string, status: string) {
    const res = await fetch(`/api/compliance/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEvents((prev) => prev.map((e) => e.id === id ? updated : e));
    }
  }

  function onSaved(event: ComplianceEvent) {
    setShowModal(false);
    setEditEvent(null);
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const openCount = events.filter((e) => e.status === "OPEN").length;
  const criticalCount = events.filter((e) => e.severity === "CRITICAL" && e.status === "OPEN").length;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Compliance</h1>
              <p className="text-xs text-gray-500">
                {total.toLocaleString()} event{total !== 1 ? "s" : ""}
                {openCount > 0 && ` · ${openCount} open`}
                {criticalCount > 0 && ` · ${criticalCount} critical`}
              </p>
            </div>
          </div>
          <Button onClick={() => { setEditEvent(null); setShowModal(true); }} size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> New Event
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-8 w-64 text-sm h-8"
            placeholder="Search events, part number, product name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={filterTypeId}
          onChange={(e) => { setFilterTypeId(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none"
        >
          <option value="">All Types</option>
          {eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>

        {(filterTypeId || filterStatus || search) && (
          <button
            onClick={() => { setFilterTypeId(""); setFilterStatus(""); setSearch(""); setPage(1); }}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
        )}
        {!loading && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ShieldCheck className="h-12 w-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">No compliance events found</p>
            <p className="text-gray-400 text-sm mt-1">Create an event to track product compliance issues</p>
            <Button className="mt-4" onClick={() => setShowModal(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> New Event
            </Button>
          </div>
        )}
        {!loading && events
          .map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onEdit={() => { window.location.href = `/compliance/${event.id}`; }}
              onDelete={() => deleteEvent(event.id)}
              onStatusChange={(s) => changeStatus(event.id, s)}
            />
          ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
          <p className="text-sm text-gray-500">Page {page} of {totalPages} ({total.toLocaleString()} events)</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {(showModal || editEvent) && (
        <EventModal
          event={editEvent}
          eventTypes={eventTypes}
          onClose={() => { setShowModal(false); setEditEvent(null); }}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
