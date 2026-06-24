"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X, GripVertical } from "lucide-react";

type EventType = {
  id: string; name: string; description: string | null; color: string;
  isActive: boolean; sortOrder: number;
};

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-5 h-5 rounded-full border-2 transition-transform ${value === c ? "border-gray-700 scale-110" : "border-transparent"}`}
          style={{ backgroundColor: c }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-5 h-5 rounded cursor-pointer border border-gray-200"
        title="Custom color"
      />
    </div>
  );
}

export function ComplianceTypesManager() {
  const [types, setTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EventType | null>(null);

  async function load() {
    const res = await fetch("/api/compliance/event-types");
    if (res.ok) setTypes(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/compliance/event-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc || null, color: newColor, sortOrder: types.length }),
    });
    if (res.ok) {
      const created = await res.json();
      setTypes((prev) => [...prev, created]);
      setNewName(""); setNewDesc(""); setNewColor(PRESET_COLORS[0]); setCreating(false);
    }
    setSaving(false);
  }

  async function saveEdit() {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/compliance/event-types/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name, description: editing.description, color: editing.color }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTypes((prev) => prev.map((t) => t.id === updated.id ? updated : t));
      setEditing(null);
    }
    setSaving(false);
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this event type? Existing events will not be affected.")) return;
    const res = await fetch(`/api/compliance/event-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    if (res.ok) setTypes((prev) => prev.filter((t) => t.id !== id));
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Compliance Event Types</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define the categories of compliance events tracked across products.</p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Type
          </Button>
        )}
      </div>

      {creating && (
        <div className="bg-white border border-indigo-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">New Event Type</p>
          <div className="space-y-2">
            <Input
              placeholder="Type name (e.g. Prop 65, REACH, CPSC)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Color</p>
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={saving || !newName.trim()}>
              {saving ? "Saving…" : "Create"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {types.length === 0 && !creating && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No event types yet. Add one to start tracking compliance events.
          </div>
        )}
        {types.map((type) =>
          editing?.id === type.id ? (
            <div key={type.id} className="bg-white border border-indigo-200 rounded-lg p-4 space-y-3">
              <div className="space-y-2">
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                />
                <Input
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value || null })}
                  placeholder="Description (optional)"
                />
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Color</p>
                  <ColorPicker value={editing.color} onChange={(c) => setEditing({ ...editing, color: c })} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={saveEdit} disabled={saving}>
                  <Check className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div key={type.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3 group">
              <GripVertical className="h-4 w-4 text-gray-300 cursor-grab" />
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: type.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{type.name}</p>
                {type.description && <p className="text-xs text-gray-400 mt-0.5">{type.description}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditing(type)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deactivate(type.id)}
                  className="p-1.5 rounded hover:bg-red-50 text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
