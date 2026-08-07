"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X, GripVertical } from "lucide-react";

type AttrDef = {
  id: string; key: string; label: string; description: string | null;
  attributeType: string; sortOrder: number; options: string[]; isActive: boolean;
};

const ATTR_TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Text Area" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "SELECT", label: "Select (dropdown)" },
  { value: "BOOLEAN", label: "Yes / No" },
];

function OptionsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((opt, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 text-xs px-2 py-0.5 rounded-full">
            {opt}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add option…"
          className="text-sm h-7"
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              e.preventDefault();
              onChange([...value, input.trim()]);
              setInput("");
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => { if (input.trim()) { onChange([...value, input.trim()]); setInput(""); } }}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function PsirAttributesManager() {
  const [attrs, setAttrs] = useState<AttrDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AttrDef | null>(null);
  const [saving, setSaving] = useState(false);

  // Create form
  const [nLabel, setNLabel] = useState("");
  const [nKey, setNKey] = useState("");
  const [nDesc, setNDesc] = useState("");
  const [nType, setNType] = useState("TEXT");
  const [nOptions, setNOptions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/psir/attributes")
      .then((r) => r.json())
      .then((data) => { setAttrs(data); setLoading(false); });
  }, []);

  async function create() {
    if (!nLabel.trim()) return;
    setSaving(true);
    const res = await fetch("/api/psir/attributes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: nLabel.trim(), key: nKey.trim() || nLabel.trim(),
        description: nDesc || null, attributeType: nType,
        sortOrder: attrs.length, options: nOptions,
      }),
    });
    if (res.ok) {
      const attr = await res.json();
      setAttrs((prev) => [...prev, attr]);
      setNLabel(""); setNKey(""); setNDesc(""); setNType("TEXT"); setNOptions([]);
      setCreating(false);
    }
    setSaving(false);
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const res = await fetch(`/api/psir/attributes/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: editing.label, description: editing.description,
        attributeType: editing.attributeType, options: editing.options,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setAttrs((prev) => prev.map((a) => a.id === updated.id ? updated : a));
      setEditing(null);
    }
    setSaving(false);
  }

  async function deactivate(id: string) {
    if (!confirm("Remove this attribute? Existing values will not be deleted.")) return;
    await fetch(`/api/psir/attributes/${id}`, { method: "DELETE" });
    setAttrs((prev) => prev.filter((a) => a.id !== id));
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inspection Attributes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define additional fields to capture on inspection reports.</p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Attribute
          </Button>
        )}
      </div>

      {creating && (
        <div className="bg-white border border-violet-200 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800">New Attribute</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label <span className="text-red-500">*</span></label>
              <Input value={nLabel} onChange={(e) => { setNLabel(e.target.value); if (!nKey) setNKey(e.target.value.toLowerCase().replace(/\s+/g, "_")); }} placeholder="e.g. AQL Level" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Key</label>
              <Input value={nKey} onChange={(e) => setNKey(e.target.value)} placeholder="auto-generated from label" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={nType} onChange={(e) => setNType(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500">
                {ATTR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <Input value={nDesc} onChange={(e) => setNDesc(e.target.value)} placeholder="Optional helper text" />
            </div>
            {nType === "SELECT" && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Options</label>
                <OptionsEditor value={nOptions} onChange={setNOptions} />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={saving || !nLabel.trim()}>{saving ? "Saving…" : "Create"}</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {attrs.length === 0 && !creating && (
          <div className="text-center py-12 text-gray-500 text-sm">
            No custom attributes yet. Add one to start capturing additional data on PSIRs.
          </div>
        )}
        {attrs.map((attr) =>
          editing?.id === attr.id ? (
            <div key={attr.id} className="bg-white border border-violet-200 rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                  <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} autoFocus />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <Input value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value || null })} placeholder="Optional helper text" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={editing.attributeType} onChange={(e) => setEditing({ ...editing, attributeType: e.target.value })}
                    className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500">
                    {ATTR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {editing.attributeType === "SELECT" && (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Options</label>
                    <OptionsEditor value={editing.options} onChange={(opts) => setEditing({ ...editing, options: opts })} />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
                <Button size="sm" onClick={saveEdit} disabled={saving}><Check className="h-3.5 w-3.5 mr-1" />{saving ? "Saving…" : "Save"}</Button>
              </div>
            </div>
          ) : (
            <div key={attr.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 group">
              <GripVertical className="h-4 w-4 text-gray-300" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{attr.label}</p>
                  <span className="text-xs bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-mono">{attr.attributeType}</span>
                  {attr.options.length > 0 && (
                    <span className="text-xs text-gray-500">{attr.options.length} options</span>
                  )}
                </div>
                {attr.description && <p className="text-xs text-gray-500 mt-0.5">{attr.description}</p>}
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{attr.key}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditing(attr)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => deactivate(attr.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
