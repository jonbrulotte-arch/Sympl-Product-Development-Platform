"use client";

import { useMemo, useState, useCallback, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft, ExternalLink, Save, CheckCircle2, AlertCircle, RefreshCw,
  Plus, X, Clock, Circle, Trash2, ChevronDown, ChevronUp, ShieldCheck, ClipboardCheck,
  FileText, CheckCircle, XCircle, AlertTriangle,
} from "lucide-react";
import { SalsifySyncModal } from "@/components/salsify/salsify-sync-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LovItem { id: string; value: string; label: string; sortOrder: number }
interface Section { id: string; name: string; sortOrder: number }
interface AttrDef {
  id: string; key: string; label: string; description: string | null;
  attributeType: string; requirement: string; maxValues: number;
  section: Section | null;
  lovItems: LovItem[];
}
type AV = { attributeDefinitionId: string; valueIndex: number; textValue: string | null };
interface Product {
  id: string; projectId: string; categoryId: string | null;
  partNumber: string | null; modelNumber: string | null; itemName: string | null;
  brand: string | null; upc: string | null; inventoryStatus: string | null;
  warrantyInfo: string | null; htsCode: string | null; htsCodeCanada: string | null;
  productComposition: string | null; needsProp65: boolean; packagingType: string | null;
  packSize: string | null; numberOfPieces: number | null; individualOrSet: string | null;
  material: string | null; size: string | null; jspCategory: string | null;
  userManual: string | null; cutSheets: string | null;
  upcHeight: number | null; upcWidth: number | null; upcLength: number | null; upcWeight: number | null;
  itemHeight: number | null; itemWidth: number | null; itemLength: number | null; itemWeight: number | null;
  innerCartonGtin: string | null;
  innerCartonHeight: number | null; innerCartonWidth: number | null; innerCartonLength: number | null;
  innerCartonWeight: number | null; innerCartonQty: number | null;
  masterCartonGtin: string | null;
  masterCartonHeight: number | null; masterCartonWidth: number | null; masterCartonLength: number | null;
  masterCartonWeight: number | null; masterCartonQty: number | null;
  palletGtin: string | null;
  palletHeight: number | null; palletWidth: number | null; palletLength: number | null;
  palletWeight: number | null; palletStackable: boolean; layersPerPallet: number | null; palletQty: number | null;
  updatedAt: string; createdAt: string;
  project: { id: string; name: string; status: string; brand: string | null; categoryId: string | null; category: { id: string; name: string } | null };
  category: { id: string; name: string } | null;
  createdBy: { name: string | null; email: string };
  updatedBy: { name: string | null; email: string } | null;
  attributeValues: AV[];
  duplicateOf: { productId: string; projectId: string; projectName: string } | null;
}

interface Props {
  product: Product;
  globalAttrs: AttrDef[];
  categoryAttrs: AttrDef[];
  coreAttrDefs: AttrDef[];
  effectiveCategoryId: string | null;
  projectCategory: { id: string; name: string } | null;
  userRole: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function productToCore(p: Product): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const booleans = new Set(["needsProp65", "palletStackable"]);
  const fields = [
    "partNumber","modelNumber","itemName","brand","upc","inventoryStatus","warrantyInfo",
    "htsCode","htsCodeCanada","productComposition","needsProp65","packagingType","packSize",
    "numberOfPieces","individualOrSet","material","size","jspCategory",
    "upcHeight","upcWidth","upcLength","upcWeight",
    "itemHeight","itemWidth","itemLength","itemWeight",
    "innerCartonGtin","innerCartonHeight","innerCartonWidth","innerCartonLength","innerCartonWeight","innerCartonQty",
    "masterCartonGtin","masterCartonHeight","masterCartonWidth","masterCartonLength","masterCartonWeight","masterCartonQty",
    "palletGtin","palletHeight","palletWidth","palletLength","palletWeight","palletStackable","layersPerPallet","palletQty",
  ];
  for (const f of fields) {
    const v = (p as never)[f];
    if (booleans.has(f)) {
      out[f] = v === true;
    } else {
      out[f] = v != null ? String(v) : "";
    }
  }
  return out;
}

function productToEav(p: Product): Record<string, string> {
  const grouped: Record<string, string[]> = {};
  for (const av of p.attributeValues) {
    if (!grouped[av.attributeDefinitionId]) grouped[av.attributeDefinitionId] = [];
    grouped[av.attributeDefinitionId][av.valueIndex] = av.textValue ?? "";
  }
  const out: Record<string, string> = {};
  for (const [id, vals] of Object.entries(grouped)) {
    out[id] = vals.filter(Boolean).join("\n");
  }
  return out;
}

// ─── Field Input ──────────────────────────────────────────────────────────────

function FieldInput({
  attr, value, onChange,
}: {
  attr: AttrDef;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  const isBoolean = attr.attributeType === "BOOLEAN";
  const isNumber = attr.attributeType === "NUMBER" || attr.attributeType === "DECIMAL";
  const isMulti = attr.maxValues > 1 || attr.attributeType === "MULTI_SELECT";

  if (isBoolean) {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded accent-blue-600"
        />
        <span className="text-sm text-gray-700">Yes</span>
      </label>
    );
  }

  if (attr.lovItems.length > 0 && isMulti) {
    const selected = (value as string) ? (value as string).split("\n").filter(Boolean) : [];
    const toggle = (val: string) => {
      const next = selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val];
      onChange(next.join("\n"));
    };
    return (
      <div className="space-y-1">
        <div className="border border-gray-200 rounded-md overflow-hidden divide-y divide-gray-100 max-h-44 overflow-y-auto">
          {attr.lovItems.map((l) => (
            <label key={l.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm text-gray-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-blue-600"
                checked={selected.includes(l.value)}
                onChange={() => toggle(l.value)}
              />
              {l.label}
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((v) => {
              const label = attr.lovItems.find((l) => l.value === v)?.label ?? v;
              return (
                <span key={v} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                  {label}
                  <button type="button" onClick={() => toggle(v)} className="hover:text-blue-900">×</button>
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (attr.lovItems.length > 0) {
    return (
      <select
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">—</option>
        {attr.lovItems.map((l) => (
          <option key={l.id} value={l.value}>{l.label}</option>
        ))}
      </select>
    );
  }

  if (isMulti) {
    return (
      <textarea
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={`One value per line (max ${attr.maxValues})`}
        className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  return (
    <Input
      type={isNumber ? "number" : "text"}
      value={value as string}
      onChange={(e) => onChange(e.target.value)}
      placeholder={attr.label}
      className="text-sm"
    />
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </div>
  );
}

// ─── Compliance Panel ─────────────────────────────────────────────────────────

type ComplianceEventType = { id: string; name: string; color: string; description: string | null };
type ComplianceEvent = {
  id: string; title: string; description: string | null; notes: string | null;
  status: string; severity: string; dueDate: string | null; createdAt: string;
  type: ComplianceEventType;
  createdBy: { name: string | null; email: string };
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-600",
  WAIVED: "bg-purple-100 text-purple-700",
};
const SEVERITY_STYLES: Record<string, string> = {
  LOW: "bg-blue-50 text-blue-600",
  MEDIUM: "bg-yellow-50 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};
const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "WAIVED"];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function CompliancePanel({ productId }: { productId: string }) {
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<ComplianceEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [cfTypeId, setCfTypeId] = useState("");
  const [cfTitle, setCfTitle] = useState("");
  const [cfDescription, setCfDescription] = useState("");
  const [cfNotes, setCfNotes] = useState("");
  const [cfSeverity, setCfSeverity] = useState("MEDIUM");
  const [cfDueDate, setCfDueDate] = useState("");
  const [cfSaving, setCfSaving] = useState(false);
  const [cfError, setCfError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/compliance/events?productId=${productId}`).then((r) => r.json()),
      fetch("/api/compliance/event-types").then((r) => r.json()),
    ]).then(([evData, types]) => {
      setEvents(evData.events ?? []);
      setEventTypes(types ?? []);
      if (types?.[0]) setCfTypeId(types[0].id);
      setLoading(false);
    });
  }, [productId]);

  async function createEvent() {
    if (!cfTitle.trim() || !cfTypeId) { setCfError("Title and event type are required."); return; }
    setCfSaving(true); setCfError("");
    const res = await fetch("/api/compliance/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        typeId: cfTypeId, title: cfTitle, description: cfDescription || null,
        notes: cfNotes || null, severity: cfSeverity, dueDate: cfDueDate || null,
        productIds: [productId],
      }),
    });
    if (res.ok) {
      const ev = await res.json();
      setEvents((prev) => [ev, ...prev]);
      setCfTitle(""); setCfDescription(""); setCfNotes(""); setCfDueDate(""); setCfSeverity("MEDIUM");
      setShowCreate(false);
    } else {
      setCfError("Failed to create event.");
    }
    setCfSaving(false);
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

  async function deleteEvent(id: string) {
    if (!confirm("Remove this compliance event from the product?")) return;
    await fetch(`/api/compliance/events/${id}`, { method: "DELETE" });
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading) return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">{events.length} compliance event{events.length !== 1 ? "s" : ""}</p>
          <p className="text-xs text-gray-400 mt-0.5">Track regulatory and compliance issues for this product.</p>
        </div>
        {!showCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Log Event
          </Button>
        )}
      </div>

      {showCreate && (
        <div className="bg-white border border-indigo-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">New Compliance Event</p>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
          </div>
          {cfError && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{cfError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-red-500">*</span></label>
              <Input value={cfTitle} onChange={(e) => setCfTitle(e.target.value)} placeholder="Brief description of the issue" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Event Type <span className="text-red-500">*</span></label>
              <select value={cfTypeId} onChange={(e) => setCfTypeId(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
              <select value={cfSeverity} onChange={(e) => setCfSeverity(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
              <Input type="date" value={cfDueDate} onChange={(e) => setCfDueDate(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={cfDescription} onChange={(e) => setCfDescription(e.target.value)} rows={2}
                placeholder="Additional context…"
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={cfNotes} onChange={(e) => setCfNotes(e.target.value)} rows={3}
                placeholder="Internal notes, action items, remediation steps…"
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={createEvent} disabled={cfSaving}>
              {cfSaving ? "Saving…" : "Log Event"}
            </Button>
          </div>
        </div>
      )}

      {events.length === 0 && !showCreate && (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-gray-200 rounded-xl text-center">
          <ShieldCheck className="h-10 w-10 text-gray-200 mb-2" />
          <p className="text-sm text-gray-500 font-medium">No compliance events</p>
          <p className="text-xs text-gray-400 mt-1">Log an event to start tracking compliance for this product.</p>
        </div>
      )}

      {events.map((event) => {
        const isExpanded = expanded === event.id;
        const isOverdue = event.dueDate && event.status === "OPEN" && new Date(event.dueDate) < new Date();
        return (
          <div key={event.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 flex items-start gap-3">
              <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: event.type.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{event.title}</p>
                    <p className="text-xs text-gray-400">{event.type.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SEVERITY_STYLES[event.severity] ?? ""}`}>{event.severity}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[event.status] ?? ""}`}>{event.status.replace("_", " ")}</span>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                  {event.dueDate && (
                    <span className={isOverdue ? "text-red-500 font-medium" : ""}>
                      <Clock className="inline h-3 w-3 mr-0.5" />
                      Due {formatDate(event.dueDate)}{isOverdue ? " (overdue)" : ""}
                    </span>
                  )}
                  <span>by {event.createdBy.name ?? event.createdBy.email} · {formatDate(event.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setExpanded(isExpanded ? null : event.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button onClick={() => deleteEvent(event.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {isExpanded && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
                {event.description && (
                  <div><p className="text-xs font-medium text-gray-500 mb-1">Description</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.description}</p></div>
                )}
                {event.notes && (
                  <div><p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.notes}</p></div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Change status:</span>
                  {STATUSES.filter((s) => s !== event.status).map((s) => (
                    <button key={s} onClick={() => changeStatus(event.id, s)}
                      className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-100 text-gray-600">
                      {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-indigo-600 hover:underline cursor-pointer">
                  <Link href="/compliance">View in Compliance module →</Link>
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── PSIR Panel ───────────────────────────────────────────────────────────────

type PsirRow = {
  id: string; title: string; referenceNumber: string | null;
  inspectionDate: string | null; inspector: string | null;
  inspectionCompany: string | null; result: string; status: string;
  documents: { id: string }[];
};

const PSIR_RESULT_META: Record<string, { cls: string; icon: React.ReactNode }> = {
  PASS: { cls: "bg-green-100 text-green-700", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  FAIL: { cls: "bg-red-100 text-red-700", icon: <XCircle className="h-3.5 w-3.5" /> },
  CONDITIONAL: { cls: "bg-yellow-100 text-yellow-800", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  PENDING: { cls: "bg-gray-100 text-gray-600", icon: <Clock className="h-3 w-3" /> },
};

function PsirPanel({ productId }: { productId: string }) {
  const [psirs, setPsirs] = useState<PsirRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/psir?productId=${productId}`)
      .then((r) => r.json())
      .then((d) => { setPsirs(d.psirs ?? []); setLoading(false); });
  }, [productId]);

  if (loading) return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">{psirs.length} inspection report{psirs.length !== 1 ? "s" : ""} linked</p>
          <p className="text-xs text-gray-400 mt-0.5">Pre-shipment inspection reports associated with this product.</p>
        </div>
        <Link href="/psir" className="text-xs text-violet-600 hover:underline flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> Create in Inspections module
        </Link>
      </div>

      {psirs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-gray-200 rounded-xl text-center">
          <ClipboardCheck className="h-10 w-10 text-gray-200 mb-2" />
          <p className="text-sm text-gray-500 font-medium">No inspection reports linked</p>
          <p className="text-xs text-gray-400 mt-1">
            Go to <Link href="/psir" className="text-violet-600 hover:underline">Inspections</Link> to create a PSIR and link this product.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {psirs.map((psir) => {
            const meta = PSIR_RESULT_META[psir.result] ?? PSIR_RESULT_META.PENDING;
            return (
              <Link
                key={psir.id}
                href={`/psir/${psir.id}`}
                className="block bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-violet-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{psir.title}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      {psir.referenceNumber && <span className="font-mono">{psir.referenceNumber}</span>}
                      {psir.inspectionCompany && <span>{psir.inspectionCompany}</span>}
                      {psir.inspectionDate && <span>{formatDate(psir.inspectionDate)}</span>}
                      {psir.documents.length > 0 && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" /> {psir.documents.length} file{psir.documents.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${meta.cls}`}>
                      {meta.icon} {psir.result}
                    </span>
                    <span className="text-xs text-gray-400">{psir.status}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Client ──────────────────────────────────────────────────────────────

type Tab = "details" | "compliance" | "psir";

export function ProductEditClient({ product, globalAttrs, categoryAttrs, coreAttrDefs, effectiveCategoryId, projectCategory, userRole }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<Tab>("details");

  const [core, setCore] = useState<Record<string, string | boolean>>(() => productToCore(product));
  const [eav, setEav] = useState<Record<string, string>>(() => productToEav(product));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "synced" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showSalsifyModal, setShowSalsifyModal] = useState(false);

  const canSync = userRole === "ADMIN" || userRole === "PRODUCT_MANAGER";

  async function syncToSalsify(skipKeys: string[]) {
    setShowSalsifyModal(false);
    setSyncing(true);
    setSyncStatus("idle");
    setSyncError(null);
    const res = await fetch(
      `/api/projects/${product.projectId}/products/${product.id}/salsify-sync`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skipAttributeKeys: skipKeys }) }
    );
    if (res.ok) {
      setSyncStatus("synced");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } else {
      const data = await res.json().catch(() => ({}));
      setSyncError(data.error ?? "Sync failed");
      setSyncStatus("error");
    }
    setSyncing(false);
  }

  const setField = useCallback((key: string, val: string | boolean) => {
    setCore((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
    setSaveStatus("idle");
  }, []);

  const setEavField = useCallback((attrDefId: string, val: string) => {
    setEav((prev) => ({ ...prev, [attrDefId]: val }));
    setDirty(true);
    setSaveStatus("idle");
  }, []);

  // Group core attrs by section
  const coreGroups = useMemo(() => {
    const groups = new Map<string, { order: number; attrs: AttrDef[] }>();
    for (const attr of coreAttrDefs) {
      const name = attr.section?.name ?? "General";
      const order = attr.section?.sortOrder ?? 0;
      if (!groups.has(name)) groups.set(name, { order, attrs: [] });
      groups.get(name)!.attrs.push(attr);
    }
    return [...groups.entries()]
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([name, { attrs }]) => ({ name, attrs }));
  }, [coreAttrDefs]);

  // Group EAV attrs by section
  const eavGroups = useMemo(() => {
    const allEav = [...globalAttrs, ...categoryAttrs];
    const groups = new Map<string, { order: number; attrs: AttrDef[] }>();
    for (const attr of allEav) {
      const name = attr.section?.name ?? "Custom Attributes";
      const order = attr.section?.sortOrder ?? 999;
      if (!groups.has(name)) groups.set(name, { order, attrs: [] });
      groups.get(name)!.attrs.push(attr);
    }
    return [...groups.entries()]
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([name, { attrs }]) => ({ name, attrs }));
  }, [globalAttrs, categoryAttrs]);

  const save = async () => {
    setSaving(true);
    setErrorMsg(null);

    // Build core payload — convert empty strings to null, booleans stay boolean, numbers stay numbers
    const booleans = new Set(["needsProp65", "palletStackable"]);
    const numbers = new Set([
      "upcHeight","upcWidth","upcLength","upcWeight",
      "itemHeight","itemWidth","itemLength","itemWeight",
      "innerCartonHeight","innerCartonWidth","innerCartonLength","innerCartonWeight","innerCartonQty",
      "masterCartonHeight","masterCartonWidth","masterCartonLength","masterCartonWeight","masterCartonQty",
      "palletHeight","palletWidth","palletLength","palletWeight","layersPerPallet","palletQty","numberOfPieces",
    ]);

    const corePayload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(core)) {
      if (booleans.has(k)) {
        corePayload[k] = v === true;
      } else if (numbers.has(k)) {
        const n = parseFloat(String(v));
        corePayload[k] = v === "" || isNaN(n) ? null : n;
      } else {
        corePayload[k] = v === "" ? null : v;
      }
    }

    // Build EAV payload
    const allEav = [...globalAttrs, ...categoryAttrs];
    const attributeValues: { attributeDefinitionId: string; valueIndex: number; textValue: string }[] = [];
    for (const attr of allEav) {
      const raw = eav[attr.id] ?? "";
      if (!raw.trim()) continue;
      const multiValue = attr.maxValues > 1 || attr.attributeType === "MULTI_SELECT";
      const cap = attr.maxValues > 1 ? attr.maxValues : Infinity;
      const vals = multiValue
        ? raw.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, cap)
        : [raw.trim()];
      vals.forEach((textValue, valueIndex) => {
        attributeValues.push({ attributeDefinitionId: attr.id, valueIndex, textValue });
      });
    }

    const res = await fetch(
      `/api/projects/${product.projectId}/products/${product.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corePayload, attributeValues }),
      }
    );

    if (res.ok) {
      setSaveStatus("saved");
      setDirty(false);
      startTransition(() => router.refresh());
    } else {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.error ?? "Save failed");
      setSaveStatus("error");
    }
    setSaving(false);
  };

  return (
    <>
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Sticky header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0 z-10">
        <div className="flex items-start gap-4 max-w-6xl mx-auto">
          <Link href="/products" className="mt-1 text-gray-400 hover:text-gray-700 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-0.5">
              <Link href="/products" className="hover:text-blue-600">Products</Link>
              <span>/</span>
              <Link href={`/projects/${product.project.id}`} className="hover:text-blue-600">{product.project.name}</Link>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 truncate">
                {product.itemName ?? product.partNumber ?? "Untitled Product"}
              </h1>
              {product.partNumber && (
                <span className="text-sm font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{product.partNumber}</span>
              )}
              {(product.category ?? projectCategory) && (
                <Badge variant="secondary">{(product.category ?? projectCategory)!.name}</Badge>
              )}
              <ProjectStatusBadge status={product.project.status as never} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canSync && (
              <div className="flex flex-col items-end gap-0.5">
                <button
                  onClick={() => setShowSalsifyModal(true)}
                  disabled={syncing}
                  className="flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-900 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing…" : syncStatus === "synced" ? "Synced!" : "Sync to Salsify"}
                </button>
                {syncStatus === "error" && syncError && (
                  <p className="text-xs text-red-600 max-w-xs text-right">{syncError}</p>
                )}
              </div>
            )}
            <Link
              href={`/projects/${product.project.id}`}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Project
            </Link>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 mt-3 border-b border-gray-200">
          {([
            { key: "details", label: "Details", icon: null },
            { key: "compliance", label: "Compliance", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
            { key: "psir", label: "Inspections", icon: <ClipboardCheck className="h-3.5 w-3.5" /> },
          ] as { key: Tab; label: string; icon: React.ReactNode }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "details" && (
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
            {product.duplicateOf && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Duplicate Part Number — <span className="font-mono font-medium">{product.partNumber}</span> is also used in project{" "}
                  <Link href={`/projects/${product.duplicateOf.projectId}`} className="underline font-medium hover:text-amber-900">
                    {product.duplicateOf.projectName}
                  </Link>.
                </span>
              </div>
            )}
            {/* Product meta */}
            <div className="text-xs text-gray-400 flex flex-wrap gap-4">
              <span>Created by {product.createdBy.name ?? product.createdBy.email} · {formatDate(product.createdAt)}</span>
              {product.updatedBy && (
                <span>Last updated by {product.updatedBy.name ?? product.updatedBy.email} · {formatDate(product.updatedAt)}</span>
              )}
            </div>

            {/* Core field sections */}
            {coreGroups.map((group) => (
              <SectionCard key={group.name} title={group.name}>
                {group.attrs.map((attr) => (
                  <div key={attr.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {attr.label}
                      {attr.requirement === "REQUIRED" && (
                        <span className="ml-1 text-red-500">*</span>
                      )}
                    </label>
                    <FieldInput
                      attr={attr}
                      value={core[attr.key] ?? ""}
                      onChange={(v) => setField(attr.key, v)}
                    />
                    {attr.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{attr.description}</p>
                    )}
                  </div>
                ))}
              </SectionCard>
            ))}

            {/* EAV attribute sections */}
            {eavGroups.map((group) => (
              <SectionCard key={group.name} title={group.name}>
                {group.attrs.map((attr) => (
                  <div key={attr.id}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {attr.label}
                      {attr.requirement === "REQUIRED" && (
                        <span className="ml-1 text-red-500">*</span>
                      )}
                    </label>
                    <FieldInput
                      attr={attr}
                      value={eav[attr.id] ?? ""}
                      onChange={(v) => setEavField(attr.id, String(v))}
                    />
                    {attr.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{attr.description}</p>
                    )}
                  </div>
                ))}
              </SectionCard>
            ))}

            {/* Bottom padding so content clears sticky save bar */}
            <div className="h-20" />
          </div>
        )}

        {activeTab === "compliance" && (
          <CompliancePanel productId={product.id} />
        )}

        {activeTab === "psir" && (
          <PsirPanel productId={product.id} />
        )}
      </div>

      {/* Sticky save bar — only shown on details tab */}
      {activeTab === "details" && <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-3 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            {saveStatus === "saved" && !dirty && (
              <span className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                All changes saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1.5 text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errorMsg ?? "Save failed"}
              </span>
            )}
            {dirty && saveStatus !== "error" && (
              <span className="text-amber-600 text-xs">Unsaved changes</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/products")}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={saving || !dirty}
              className="min-w-[110px]"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>}
    </div>
    {showSalsifyModal && (
      <SalsifySyncModal
        mode="product"
        syncing={syncing}
        onConfirm={syncToSalsify}
        onClose={() => setShowSalsifyModal(false)}
      />
    )}
    </>
  );
}
