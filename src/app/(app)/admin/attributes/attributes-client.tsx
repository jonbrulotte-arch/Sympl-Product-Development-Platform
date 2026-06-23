"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Edit2, ChevronDown, ChevronRight } from "lucide-react";

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
  isCore: boolean;
  salsifyEnabled: boolean;
  salsifyPropertyId: string | null;
  categoryId: string | null;
  sectionId: string | null;
  sortOrder: number;
  section: { name: string } | null;
  category: { name: string } | null;
  lovItems: LovItem[];
}

interface Category {
  id: string;
  name: string;
}

interface Props {
  initialAttributes: AttributeDef[];
  categories: Category[];
}

const ATTR_TYPES = ["TEXT","TEXTAREA","NUMBER","DECIMAL","BOOLEAN","DATE","SELECT","MULTI_SELECT","URL","EMAIL","UPC","GTIN"];
const REQUIREMENTS = ["REQUIRED","CONDITIONAL","OPTIONAL"];

export function AttributesClient({ initialAttributes, categories }: Props) {
  const [attributes, setAttributes] = useState<AttributeDef[]>(initialAttributes);
  const [editTarget, setEditTarget] = useState<AttributeDef | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["global"]));

  // Group by section
  const grouped: Record<string, AttributeDef[]> = {};
  for (const attr of attributes) {
    if (attr.label.toLowerCase().includes(search.toLowerCase()) || attr.key.toLowerCase().includes(search.toLowerCase())) {
      const key = attr.section?.name ?? "Global";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(attr);
    }
  }

  const toggleSection = (name: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attribute Definitions</h1>
          <p className="text-gray-500 text-sm mt-1">{attributes.length} attributes configured</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Attribute
        </Button>
      </div>

      <Input
        placeholder="Search attributes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-xs"
      />

      <div className="space-y-3">
        {Object.entries(grouped).map(([section, attrs]) => (
          <div key={section} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
              onClick={() => toggleSection(section)}
            >
              {expandedSections.has(section) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-medium text-gray-700">{section}</span>
              <span className="text-xs text-gray-400">({attrs.length})</span>
            </button>

            {expandedSections.has(section) && (
              <div className="divide-y divide-gray-100">
                {attrs.map((attr) => (
                  <div key={attr.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{attr.label}</span>
                        <code className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{attr.key}</code>
                        <Badge variant={attr.requirement === "REQUIRED" ? "destructive" : "secondary"} className="text-xs">
                          {attr.requirement}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{attr.attributeType}</Badge>
                        {attr.category && <Badge variant="outline" className="text-xs text-purple-600">{attr.category.name}</Badge>}
                        {attr.salsifyEnabled && <Badge variant="outline" className="text-xs text-green-600">Salsify</Badge>}
                        {attr.lovItems.length > 0 && (
                          <span className="text-xs text-gray-400">{attr.lovItems.length} options</span>
                        )}
                      </div>
                      {attr.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{attr.description}</p>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditTarget(attr)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {(editTarget || createOpen) && (
        <AttributeDialog
          attr={editTarget}
          categories={categories}
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
    </div>
  );
}

// ─── Attribute Edit Dialog ─────────────────────────────────────────────────────

interface DialogProps {
  attr: AttributeDef | null;
  categories: Category[];
  onClose: () => void;
  onSaved: (attr: AttributeDef) => void;
}

function AttributeDialog({ attr, categories, onClose, onSaved }: DialogProps) {
  const isNew = !attr;
  const [form, setForm] = useState({
    key: attr?.key ?? "",
    label: attr?.label ?? "",
    description: attr?.description ?? "",
    attributeType: attr?.attributeType ?? "TEXT",
    requirement: attr?.requirement ?? "OPTIONAL",
    categoryId: attr?.categoryId ?? "",
    salsifyEnabled: attr?.salsifyEnabled ?? false,
    salsifyPropertyId: attr?.salsifyPropertyId ?? "",
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
        categoryId: form.categoryId || null,
        salsifyPropertyId: form.salsifyPropertyId || null,
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
        onSaved({ ...saved, lovItems, section: attr?.section ?? null, category: categories.find((c) => c.id === form.categoryId) ?? null });
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

  const showLov = form.attributeType === "SELECT" || form.attributeType === "MULTI_SELECT";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold">{isNew ? "New Attribute" : `Edit: ${attr.label}`}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Core fields */}
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
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={form.attributeType}
                onChange={(e) => setForm((f) => ({ ...f, attributeType: e.target.value }))}
              >
                {ATTR_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Requirement</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={form.requirement}
                onChange={(e) => setForm((f) => ({ ...f, requirement: e.target.value }))}
              >
                {REQUIREMENTS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category (leave blank for global)</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            >
              <option value="">— Global (applies to all) —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Salsify section */}
          <div className="border border-green-200 rounded-lg p-4 space-y-3 bg-green-50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-green-800">Salsify Integration</span>
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Salsify Property ID</label>
                <Input
                  placeholder="e.g. product_description"
                  value={form.salsifyPropertyId}
                  onChange={(e) => setForm((f) => ({ ...f, salsifyPropertyId: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">
                  The Salsify property name where this attribute&apos;s value will be saved
                </p>
              </div>
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
                        <button
                          onClick={() => removeLov(item.id)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
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
