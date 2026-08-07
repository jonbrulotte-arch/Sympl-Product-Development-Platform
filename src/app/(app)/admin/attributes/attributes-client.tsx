"use client";

import { useRef, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, X, Pencil, ChevronDown, ChevronRight, Download, Upload,
  Type, AlignLeft, Hash, ToggleLeft, CalendarDays, List, Link2,
  Mail, Barcode, GripVertical, Layers, Zap, Settings2, Trash2, Check,
  Eye, EyeOff, ArrowUp, ArrowDown,
} from "lucide-react";

interface Section {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

interface LovItem {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
}

interface AttributeDef {
  id: string;
  key: string;
  label: string;
  description: string | null;
  attributeType: string;
  requirement: string;
  maxValues: number;
  isCore: boolean;
  isActive: boolean;
  salsifyEnabled: boolean;
  salsifyPropertyId: string | null;
  categoryId: string | null;
  sectionId: string | null;
  sortOrder: number;
  section: { id?: string; name: string } | null;
  category: { name: string } | null;
  lovItems: LovItem[];
}

interface Category {
  id: string;
  name: string;
}

interface Props {
  initialAttributes: AttributeDef[];
  initialSections: Section[];
  categories: Category[];
}

const ATTR_TYPES = ["TEXT","TEXTAREA","NUMBER","DECIMAL","BOOLEAN","DATE","SELECT","MULTI_SELECT","URL","EMAIL","UPC","GTIN"];
const REQUIREMENTS = ["REQUIRED","CONDITIONAL","OPTIONAL"];

const TYPE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  TEXT:         { icon: Type,        color: "text-gray-500  bg-gray-100",   label: "Text" },
  TEXTAREA:     { icon: AlignLeft,   color: "text-gray-500  bg-gray-100",   label: "Long text" },
  NUMBER:       { icon: Hash,        color: "text-blue-600  bg-blue-50",    label: "Number" },
  DECIMAL:      { icon: Hash,        color: "text-blue-600  bg-blue-50",    label: "Decimal" },
  BOOLEAN:      { icon: ToggleLeft,  color: "text-purple-600 bg-purple-50", label: "Boolean" },
  DATE:         { icon: CalendarDays,color: "text-orange-600 bg-orange-50", label: "Date" },
  SELECT:       { icon: List,        color: "text-teal-600  bg-teal-50",    label: "Select" },
  MULTI_SELECT: { icon: Layers,      color: "text-teal-600  bg-teal-50",    label: "Multi-select" },
  URL:          { icon: Link2,       color: "text-indigo-600 bg-indigo-50", label: "URL" },
  EMAIL:        { icon: Mail,        color: "text-pink-600  bg-pink-50",    label: "Email" },
  UPC:          { icon: Barcode,     color: "text-yellow-600 bg-yellow-50", label: "UPC" },
  GTIN:         { icon: Barcode,     color: "text-yellow-600 bg-yellow-50", label: "GTIN" },
};

const REQ_STYLE: Record<string, string> = {
  REQUIRED:    "bg-red-100 text-red-700 border-red-200",
  CONDITIONAL: "bg-amber-100 text-amber-700 border-amber-200",
  OPTIONAL:    "bg-gray-100 text-gray-500 border-gray-200",
};

export function AttributesClient({ initialAttributes, initialSections, categories }: Props) {
  const [attributes, setAttributes] = useState<AttributeDef[]>(initialAttributes);
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [editTarget, setEditTarget] = useState<AttributeDef | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => {
    const g: Record<string, AttributeDef[]> = {};
    const q = search.toLowerCase();
    for (const attr of attributes) {
      if (q && !attr.label.toLowerCase().includes(q) && !attr.key.toLowerCase().includes(q)) continue;
      const key = attr.section?.name ?? "Global";
      if (!g[key]) g[key] = [];
      g[key].push(attr);
    }
    for (const key of Object.keys(g)) {
      g[key].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return g;
  }, [attributes, search]);

  // Section display order follows sections.sortOrder then "Global" at end
  const sectionOrder = useMemo(() => {
    const names = sections.map((s) => s.name).filter((n) => grouped[n]);
    if (grouped["Global"]) names.push("Global");
    return names;
  }, [sections, grouped]);

  const deleteAttribute = async (attr: AttributeDef) => {
    if (!confirm(`Delete attribute "${attr.label}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/attributes/${attr.id}`, { method: "DELETE" });
    if (res.ok) {
      setAttributes((prev) => prev.filter((a) => a.id !== attr.id));
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Delete failed");
    }
  };

  // Hide/show an attribute everywhere (grids, forms, exports) without deleting
  // it — the only way to remove a core column, whose data lives in a real
  // ProductRecord column.
  const toggleActive = async (attr: AttributeDef) => {
    const res = await fetch(`/api/attributes/${attr.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !attr.isActive }),
    });
    if (res.ok) {
      setAttributes((prev) => prev.map((a) => (a.id === attr.id ? { ...a, isActive: !attr.isActive } : a)));
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Update failed");
    }
  };

  const toggleSection = (name: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, attrId: string) => {
    setDraggingId(attrId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", attrId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
    setDragOverSection(null);
  }, []);

  const saveOrders = useCallback(
    (updates: { id: string; sortOrder: number; sectionId?: string | null }[]) => {
      for (const u of updates) {
        fetch(`/api/attributes/${u.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sortOrder: u.sortOrder,
            ...(u.sectionId !== undefined ? { sectionId: u.sectionId } : {}),
          }),
        });
      }
    },
    []
  );

  const handleDragOverAttr = useCallback(
    (e: React.DragEvent, attrId: string) => {
      if (attrId === draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverId(attrId);
      setDragOverSection(null);
    },
    [draggingId]
  );

  const handleDragOverSectionHeader = useCallback(
    (e: React.DragEvent, sectionName: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverSection(sectionName);
      setDragOverId(null);
    },
    []
  );

  const handleDropOnAttr = useCallback(
    (e: React.DragEvent, targetAttrId: string, sectionName: string) => {
      e.preventDefault();
      if (!draggingId || draggingId === targetAttrId) { handleDragEnd(); return; }

      const draggingAttr = attributes.find((a) => a.id === draggingId);
      if (!draggingAttr) { handleDragEnd(); return; }

      const targetSection = sections.find((s) => s.name === sectionName) ?? null;
      const targetSectionId = sectionName === "Global" ? null : (targetSection?.id ?? null);

      const sectionAttrs = grouped[sectionName] ?? [];
      const withoutDragging = sectionAttrs.filter((a) => a.id !== draggingId);
      const targetIdx = withoutDragging.findIndex((a) => a.id === targetAttrId);
      const reordered = [...withoutDragging];
      reordered.splice(targetIdx, 0, draggingAttr);

      const updates: { id: string; sortOrder: number; sectionId?: string | null }[] = reordered.map(
        (a, i) => ({
          id: a.id,
          sortOrder: i,
          ...(a.id === draggingId ? { sectionId: targetSectionId } : {}),
        })
      );

      const sourceSectionName = draggingAttr.section?.name ?? "Global";
      let sourceUpdates: { id: string; sortOrder: number }[] = [];
      if (sourceSectionName !== sectionName) {
        sourceUpdates = (grouped[sourceSectionName] ?? [])
          .filter((a) => a.id !== draggingId)
          .map((a, i) => ({ id: a.id, sortOrder: i }));
      }

      setAttributes((prev) =>
        prev.map((a) => {
          const u = updates.find((u) => u.id === a.id);
          if (u)
            return {
              ...a,
              sortOrder: u.sortOrder,
              ...(u.sectionId !== undefined
                ? { sectionId: u.sectionId, section: targetSection ? { name: targetSection.name } : null }
                : {}),
            };
          const su = sourceUpdates.find((u) => u.id === a.id);
          if (su) return { ...a, sortOrder: su.sortOrder };
          return a;
        })
      );

      saveOrders([...updates, ...sourceUpdates]);
      handleDragEnd();
    },
    [draggingId, attributes, grouped, sections, handleDragEnd, saveOrders]
  );

  const handleDropOnSectionHeader = useCallback(
    (e: React.DragEvent, sectionName: string) => {
      e.preventDefault();
      if (!draggingId) { handleDragEnd(); return; }

      const draggingAttr = attributes.find((a) => a.id === draggingId);
      if (!draggingAttr) { handleDragEnd(); return; }

      const sourceSectionName = draggingAttr.section?.name ?? "Global";
      if (sourceSectionName === sectionName) { handleDragEnd(); return; }

      const targetSectionObj = sections.find((s) => s.name === sectionName) ?? null;
      const targetSectionId = sectionName === "Global" ? null : (targetSectionObj?.id ?? null);
      const existingInTarget = (grouped[sectionName] ?? []).filter((a) => a.id !== draggingId);
      const newSortOrder = existingInTarget.length;

      const sourceUpdates = (grouped[sourceSectionName] ?? [])
        .filter((a) => a.id !== draggingId)
        .map((a, i) => ({ id: a.id, sortOrder: i }));

      setAttributes((prev) =>
        prev.map((a) => {
          if (a.id === draggingId)
            return {
              ...a,
              sectionId: targetSectionId,
              section: targetSectionObj ? { name: targetSectionObj.name } : null,
              sortOrder: newSortOrder,
            };
          const su = sourceUpdates.find((u) => u.id === a.id);
          if (su) return { ...a, sortOrder: su.sortOrder };
          return a;
        })
      );

      saveOrders([{ id: draggingId, sortOrder: newSortOrder, sectionId: targetSectionId }, ...sourceUpdates]);
      // Expand target section so user can see where it landed
      setExpandedSections((prev) => new Set([...prev, sectionName]));
      handleDragEnd();
    },
    [draggingId, attributes, grouped, sections, handleDragEnd, saveOrders]
  );

  // ── Export / Import ────────────────────────────────────────────────────────

  const handleExport = async () => {
    const res = await fetch("/api/attributes/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attribute-definitions-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/attributes/import", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setImportResult(`Import complete: ${data.created} created, ${data.updated} updated${data.errors?.length ? ` (${data.errors.length} errors)` : ""}`);
        const refresh = await fetch("/api/attributes");
        if (refresh.ok) setAttributes(await refresh.json());
      } else {
        setImportResult(`Import failed: ${data.error}`);
      }
    } catch {
      setImportResult("Import failed — network error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attribute Definitions</h1>
          <p className="text-gray-500 text-sm mt-1">{attributes.length} attributes configured</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSectionManagerOpen(true)}>
            <Settings2 className="h-4 w-4" />
            Manage Groups
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4" />
            {importing ? "Importing…" : "Import"}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImport} />
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Attribute
          </Button>
        </div>
      </div>

      {importResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between ${importResult.includes("failed") || importResult.includes("error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          <span>{importResult}</span>
          <button onClick={() => setImportResult(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <Input
          placeholder="Search attributes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <p className="text-xs text-gray-400">
          Drag the <GripVertical className="inline h-3 w-3" /> handle to reorder. Drop onto a section header to move between groups.
        </p>
      </div>

      <div className="space-y-3">
        {sectionOrder.map((sectionName) => {
          const attrs = grouped[sectionName] ?? [];
          const isDragOverHeader = dragOverSection === sectionName;
          return (
            <div key={sectionName} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                className={`w-full flex items-center gap-2 px-4 py-3 text-left transition-colors ${isDragOverHeader ? "bg-blue-100 border-blue-300" : "bg-gray-50 hover:bg-gray-100"}`}
                onClick={() => toggleSection(sectionName)}
                onDragOver={(e) => handleDragOverSectionHeader(e, sectionName)}
                onDragLeave={() => setDragOverSection(null)}
                onDrop={(e) => handleDropOnSectionHeader(e, sectionName)}
              >
                {(expandedSections.has(sectionName) || (search.trim() && attrs.length > 0))
                  ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                <span className="font-semibold text-gray-700 text-sm">{sectionName}</span>
                <span className="ml-1 text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">{attrs.length}</span>
                {isDragOverHeader && (
                  <span className="ml-auto text-xs text-blue-600 font-medium">Drop to move here</span>
                )}
              </button>

              {(expandedSections.has(sectionName) || (search.trim() && attrs.length > 0)) && (
                <div className="divide-y divide-gray-100">
                  {attrs.map((attr) => {
                    const meta = TYPE_META[attr.attributeType] ?? TYPE_META.TEXT;
                    const TypeIcon = meta.icon;
                    const isDragging = draggingId === attr.id;
                    const isOver = dragOverId === attr.id;
                    return (
                      <div
                        key={attr.id}
                        className={`flex items-center gap-3 px-4 py-3 group transition-colors ${isDragging ? "opacity-40 bg-blue-50" : isOver ? "bg-blue-50 border-t-2 border-t-blue-400" : "hover:bg-gray-50"}`}
                        onDragOver={(e) => handleDragOverAttr(e, attr.id)}
                        onDragLeave={() => setDragOverId(null)}
                        onDrop={(e) => handleDropOnAttr(e, attr.id, sectionName)}
                      >
                        {/* Drag handle — only this element is draggable */}
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, attr.id)}
                          onDragEnd={handleDragEnd}
                          className="cursor-grab active:cursor-grabbing shrink-0 touch-none"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <GripVertical className="h-4 w-4 text-gray-200 group-hover:text-gray-400 transition-colors" />
                        </div>

                        {/* Type icon */}
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                          <TypeIcon className="h-4 w-4" />
                        </div>

                        {/* Main info */}
                        <div className={`flex-1 min-w-0 ${!attr.isActive ? "opacity-50" : ""}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{attr.label}</span>
                            <code className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">{attr.key}</code>
                            {attr.isCore && <span className="text-xs text-blue-500 font-medium">core</span>}
                            {!attr.isActive && (
                              <span className="text-xs text-gray-500 font-medium bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">hidden</span>
                            )}
                          </div>
                          {attr.description && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-lg">{attr.description}</p>
                          )}
                        </div>

                        {/* Right-side metadata */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${REQ_STYLE[attr.requirement] ?? REQ_STYLE.OPTIONAL}`}>
                            {attr.requirement}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${meta.color}`}>
                            {meta.label}{attr.maxValues > 1 ? ` ×${attr.maxValues}` : ""}
                          </span>
                          {attr.lovItems.length > 0 && (
                            <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                              {attr.lovItems.length} option{attr.lovItems.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {attr.category ? (
                            <span className="text-xs text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded">
                              {attr.category.name}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                              Global
                            </span>
                          )}
                          {attr.salsifyEnabled && (
                            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                              <Zap className="h-3 w-3" />
                              Salsify
                            </span>
                          )}
                          <button
                            onClick={() => toggleActive(attr)}
                            className={`ml-1 p-1.5 rounded transition-colors ${attr.isActive ? "text-gray-300 hover:text-gray-600 hover:bg-gray-100" : "text-amber-500 hover:text-amber-600 hover:bg-amber-50"}`}
                            title={attr.isActive ? "Hide from grids, forms, and exports" : "Hidden — click to show again"}
                          >
                            {attr.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => setEditTarget(attr)}
                            className="p-1.5 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {!attr.isCore && (
                            <button
                              onClick={() => deleteAttribute(attr)}
                              className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Delete attribute"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(editTarget || createOpen) && (
        <AttributeDialog
          attr={editTarget}
          categories={categories}
          sections={sections}
          onClose={() => { setEditTarget(null); setCreateOpen(false); }}
          onSaved={(saved) => {
            setAttributes((prev) => {
              const idx = prev.findIndex((a) => a.id === saved.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = saved;
                return next;
              }
              return [saved, ...prev];
            });
            setEditTarget(null);
            setCreateOpen(false);
          }}
        />
      )}

      {sectionManagerOpen && (
        <SectionManager
          sections={sections}
          onSectionsChange={setSections}
          onClose={() => setSectionManagerOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Section Manager Modal ────────────────────────────────────────────────────

interface SectionManagerProps {
  sections: Section[];
  onSectionsChange: (sections: Section[]) => void;
  onClose: () => void;
}

function SectionManager({ sections, onSectionsChange, onClose }: SectionManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);

  const startEdit = (s: Section) => {
    setEditingId(s.id);
    setEditName(s.name);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const persistOrder = async (newSections: Section[]) => {
    onSectionsChange(newSections);
    try {
      const res = await fetch("/api/attributes/sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: newSections.map((s) => s.id) }),
      });
      if (res.ok) {
        const updated: Section[] = await res.json();
        onSectionsChange(updated);
      }
    } catch { /* optimistic update already applied */ }
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next.map((s, i) => ({ ...s, sortOrder: i })));
  };

  const handleSectionDragStart = (e: React.DragEvent, id: string) => {
    setDraggingSectionId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleSectionDragOver = (e: React.DragEvent, id: string) => {
    if (id === draggingSectionId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSectionId(id);
  };

  const handleSectionDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingSectionId || draggingSectionId === targetId) {
      setDraggingSectionId(null);
      setDragOverSectionId(null);
      return;
    }
    const fromIdx = sections.findIndex((s) => s.id === draggingSectionId);
    const toIdx = sections.findIndex((s) => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...sections];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setDraggingSectionId(null);
    setDragOverSectionId(null);
    persistOrder(next.map((s, i) => ({ ...s, sortOrder: i })));
  };

  const handleSectionDragEnd = () => {
    setDraggingSectionId(null);
    setDragOverSectionId(null);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/attributes/sections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) { setError("Failed to rename"); return; }
      const updated = await res.json();
      onSectionsChange(sections.map((s) => (s.id === id ? updated : s)));
      setEditingId(null);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const deleteSection = async (id: string) => {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/attributes/sections/${id}`, { method: "DELETE" });
      if (!res.ok) { setError("Failed to delete"); return; }
      onSectionsChange(sections.filter((s) => s.id !== id));
    } catch {
      setError("Network error");
    } finally {
      setDeleting(null);
    }
  };

  const createSection = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/attributes/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) { setError("Failed to create"); return; }
      const created = await res.json();
      onSectionsChange([...sections, created]);
      setNewName("");
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Manage Attribute Groups</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {sections.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-4">No groups yet</p>
          )}
          {sections.map((s, idx) => {
            const isDragging = draggingSectionId === s.id;
            const isOver = dragOverSectionId === s.id;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-2 p-2 border rounded-lg transition-colors ${isDragging ? "opacity-40 bg-blue-50 border-blue-200" : isOver ? "bg-blue-50 border-blue-400" : "border-gray-200"}`}
                onDragOver={(e) => handleSectionDragOver(e, s.id)}
                onDragLeave={() => setDragOverSectionId(null)}
                onDrop={(e) => handleSectionDrop(e, s.id)}
              >
                <div
                  draggable
                  onDragStart={(e) => handleSectionDragStart(e, s.id)}
                  onDragEnd={handleSectionDragEnd}
                  className="cursor-grab active:cursor-grabbing shrink-0 touch-none"
                >
                  <GripVertical className="h-4 w-4 text-gray-300 hover:text-gray-500" />
                </div>

                {editingId === s.id ? (
                  <>
                    <Input
                      className="flex-1 h-8 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(s.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(s.id)}
                      disabled={saving}
                      className="p-1.5 rounded text-green-600 hover:bg-green-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={cancelEdit} className="p-1.5 rounded text-gray-400 hover:bg-gray-100">
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-gray-800">{s.name}</span>
                    <div className="flex flex-col">
                      <button
                        onClick={() => moveSection(idx, -1)}
                        disabled={idx === 0}
                        className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => moveSection(idx, 1)}
                        disabled={idx === sections.length - 1}
                        className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => startEdit(s)}
                      className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteSection(s.id)}
                      disabled={deleting === s.id}
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Input
              placeholder="New group name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createSection(); }}
              className="flex-1"
            />
            <Button size="sm" onClick={createSection} disabled={!newName.trim() || saving}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          <p className="text-xs text-gray-400">Drag groups to reorder. Deleting a group moves its attributes to &quot;Global&quot;.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Attribute Edit Dialog ─────────────────────────────────────────────────────

interface DialogProps {
  attr: AttributeDef | null;
  categories: Category[];
  sections: Section[];
  onClose: () => void;
  onSaved: (attr: AttributeDef) => void;
}

function AttributeDialog({ attr, categories, sections, onClose, onSaved }: DialogProps) {
  const isNew = !attr;
  const [form, setForm] = useState({
    key: attr?.key ?? "",
    label: attr?.label ?? "",
    description: attr?.description ?? "",
    attributeType: attr?.attributeType ?? "TEXT",
    requirement: attr?.requirement ?? "OPTIONAL",
    maxValues: attr?.maxValues ?? 1,
    categoryId: attr?.categoryId ?? "",
    sectionId: attr?.sectionId ?? "",
    salsifyEnabled: attr?.salsifyEnabled ?? false,
    salsifyPropertyId: attr?.salsifyPropertyId ?? "",
    salsifyLocale: (attr as AttributeDef & { salsifyLocale?: string | null })?.salsifyLocale ?? "",
  });

  const [lovItems, setLovItems] = useState<LovItem[]>(attr?.lovItems ?? []);
  const [lovLabel, setLovLabel] = useState("");
  const [lovValue, setLovValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        maxValues: Math.max(1, Number(form.maxValues) || 1),
        categoryId: form.categoryId || null,
        sectionId: form.sectionId || null,
        salsifyPropertyId: form.salsifyPropertyId || null,
        salsifyLocale: form.salsifyLocale || null,
      };

      const res = isNew
        ? await fetch("/api/attributes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/attributes/${attr!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Save failed");
      } else {
        const saved = await res.json();
        const targetSection = sections.find((s) => s.id === form.sectionId) ?? null;
        onSaved({
          ...saved,
          lovItems,
          section: targetSection ? { name: targetSection.name } : null,
          category: categories.find((c) => c.id === form.categoryId) ?? null,
        });
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const addLov = async () => {
    if (!lovLabel.trim() || !lovValue.trim() || !attr?.id) return;
    const res = await fetch(`/api/attributes/${attr.id}/lov`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: lovLabel.trim(), value: lovValue.trim(), sortOrder: lovItems.length }),
    });
    if (res.ok) {
      const item = await res.json();
      setLovItems((prev) => [...prev, item]);
      setLovLabel("");
      setLovValue("");
    }
  };

  const removeLov = async (lovId: string) => {
    if (!attr?.id) return;
    const res = await fetch(`/api/attributes/${attr.id}/lov?lovId=${lovId}`, { method: "DELETE" });
    if (res.ok) setLovItems((prev) => prev.filter((l) => l.id !== lovId));
  };

  const moveLov = async (index: number, direction: -1 | 1) => {
    if (!attr?.id) return;
    const target = index + direction;
    if (target < 0 || target >= lovItems.length) return;
    const next = [...lovItems];
    [next[index], next[target]] = [next[target], next[index]];
    setLovItems(next);
    const items = next.map((item, i) => ({ id: item.id, sortOrder: i }));
    await fetch(`/api/attributes/${attr.id}/lov`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
  };

  const showLov = form.attributeType === "SELECT" || form.attributeType === "MULTI_SELECT";
  const isMultiValue = Number(form.maxValues) > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold">{isNew ? "New Attribute" : `Edit: ${attr.label}`}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label *</label>
              <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Key *</label>
              <Input
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                disabled={!isNew}
                className={!isNew ? "bg-gray-50 text-gray-500" : ""}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Group / Section</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900"
                value={form.sectionId}
                onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value }))}
              >
                <option value="">— Global (no group) —</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category scope</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900"
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">— Global (all categories) —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900"
                value={form.attributeType}
                onChange={(e) => setForm((f) => ({ ...f, attributeType: e.target.value }))}
              >
                {ATTR_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Requirement</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900"
                value={form.requirement}
                onChange={(e) => setForm((f) => ({ ...f, requirement: e.target.value }))}
              >
                {REQUIREMENTS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max Values</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.maxValues}
                onChange={(e) => setForm((f) => ({ ...f, maxValues: parseInt(e.target.value) || 1 }))}
              />
              <p className="text-xs text-gray-400 mt-1">{isMultiValue ? `Up to ${form.maxValues} values` : "Single value"}</p>
            </div>
          </div>

          {/* Salsify section */}
          <div className="border border-green-200 rounded-lg p-4 space-y-3 bg-green-50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-green-800">Salsify Integration</span>
              {isMultiValue && <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">sends as array</span>}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.salsifyEnabled}
                onChange={(e) => setForm((f) => ({ ...f, salsifyEnabled: e.target.checked }))}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-gray-700">Enabled for Salsify</span>
            </label>
            {form.salsifyEnabled && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Salsify Property ID</label>
                  <Input
                    placeholder="e.g. product_description"
                    value={form.salsifyPropertyId}
                    onChange={(e) => setForm((f) => ({ ...f, salsifyPropertyId: e.target.value }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {isMultiValue
                      ? "Values will be sent as a JSON array to this Salsify property"
                      : "The Salsify property name where this attribute's value will be saved"}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Locale <span className="text-gray-400 font-normal">(optional)</span></label>
                  <Input
                    placeholder="e.g. en-US"
                    value={form.salsifyLocale}
                    onChange={(e) => setForm((f) => ({ ...f, salsifyLocale: e.target.value }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    If this Salsify property is localizable, enter the locale (e.g. <code className="bg-gray-100 px-1 rounded">en-US</code>). Leave blank for non-localizable properties.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* LOV items */}
          {showLov && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">List of Values (Options)</label>
              {isNew ? (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-md">
                  Save this attribute first, then re-open it to add options.
                </p>
              ) : (
                <>
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden">
                    {lovItems.length === 0 && (
                      <p className="text-xs text-gray-400 px-3 py-2 italic">No options yet</p>
                    )}
                    {lovItems.map((item, i) => (
                      <div key={item.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group">
                        <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                        <span className="flex-1 text-sm">{item.label}</span>
                        <code className="text-xs text-gray-400 bg-gray-100 px-1.5 rounded">{item.value}</code>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => moveLov(i, -1)}
                            disabled={i === 0}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => moveLov(i, 1)}
                            disabled={i === lovItems.length - 1}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => removeLov(item.id)}
                            className="text-gray-300 hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Label (displayed)"
                      value={lovLabel}
                      onChange={(e) => setLovLabel(e.target.value)}
                      className="flex-1"
                      onKeyDown={(e) => e.key === "Enter" && addLov()}
                    />
                    <Input
                      placeholder="Value (stored)"
                      value={lovValue}
                      onChange={(e) => setLovValue(e.target.value)}
                      className="flex-1"
                      onKeyDown={(e) => e.key === "Enter" && addLov()}
                    />
                    <Button size="sm" onClick={addLov} disabled={!lovLabel.trim() || !lovValue.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.key || !form.label}>
            {saving ? "Saving…" : isNew ? "Create" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
