"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, X } from "lucide-react";

type StatusConfig = {
  id: string | null;
  code: string;
  label: string;
  color: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

const COLOR_OPTIONS = [
  { value: "gray",   label: "Gray",   cls: "bg-gray-100 text-gray-700" },
  { value: "blue",   label: "Blue",   cls: "bg-blue-100 text-blue-700" },
  { value: "green",  label: "Green",  cls: "bg-green-100 text-green-700" },
  { value: "yellow", label: "Yellow", cls: "bg-yellow-100 text-yellow-700" },
  { value: "orange", label: "Orange", cls: "bg-orange-100 text-orange-700" },
  { value: "red",    label: "Red",    cls: "bg-red-100 text-red-700" },
  { value: "purple", label: "Purple", cls: "bg-purple-100 text-purple-700" },
  { value: "teal",   label: "Teal",   cls: "bg-teal-100 text-teal-700" },
  { value: "pink",   label: "Pink",   cls: "bg-pink-100 text-pink-700" },
];

const BUILT_IN_CODES = new Set([
  "DRAFT","IN_PROGRESS","NEEDS_REVIEW","CHANGES_REQUESTED","APPROVED","EXPORT_READY","ARCHIVED",
]);

function colorClass(color: string) {
  return COLOR_OPTIONS.find((c) => c.value === color)?.cls ?? "bg-gray-100 text-gray-700";
}

const EMPTY_NEW = { code: "", label: "", color: "gray", description: "" };

export function ProjectStatusesClient() {
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<StatusConfig>>({});
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/admin/project-statuses")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setStatuses(data); })
      .catch(() => {});
  }, []);

  const showMsg = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  };

  const startEdit = (s: StatusConfig) => {
    setEditing(s.code);
    setEditState({ label: s.label, color: s.color, description: s.description ?? "", sortOrder: s.sortOrder, isActive: s.isActive });
    setMsg(null);
    setCreateOpen(false);
  };

  const saveEdit = async (code: string) => {
    setSaving(true);
    const res = await fetch("/api/admin/project-statuses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, ...editState }),
    });
    if (res.ok) {
      const updated = await res.json();
      setStatuses((prev) => prev.map((s) => s.code === code ? { ...s, ...updated } : s));
      setEditing(null);
      showMsg("Saved");
    } else {
      showMsg("Save failed", false);
    }
    setSaving(false);
  };

  const quickToggle = async (s: StatusConfig) => {
    setToggling(s.code);
    const res = await fetch("/api/admin/project-statuses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: s.code, isActive: !s.isActive }),
    });
    if (res.ok) {
      setStatuses((prev) => prev.map((p) => p.code === s.code ? { ...p, isActive: !s.isActive } : p));
    }
    setToggling(null);
  };

  const deleteStatus = async (code: string) => {
    if (!window.confirm(`Delete status "${code}"? This cannot be undone.`)) return;
    setDeleting(code);
    const res = await fetch("/api/admin/project-statuses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      setStatuses((prev) => prev.filter((s) => s.code !== code));
      showMsg("Status deleted");
    } else {
      const data = await res.json();
      showMsg(data.error ?? "Delete failed", false);
    }
    setDeleting(null);
  };

  const createStatus = async () => {
    if (!newForm.code.trim() || !newForm.label.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/project-statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: newForm.code.trim(),
        label: newForm.label.trim(),
        color: newForm.color,
        description: newForm.description.trim() || null,
        sortOrder: statuses.length,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setStatuses((prev) => [...prev, created]);
      setNewForm(EMPTY_NEW);
      setCreateOpen(false);
      showMsg("Status created");
    } else {
      const data = await res.json();
      showMsg(data.error ?? "Create failed", false);
    }
    setSaving(false);
  };

  const cancelEdit = () => { setEditing(null); setEditState({}); };

  return (
    <Card>
      <CardHeader className="py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Project Statuses</CardTitle>
          <Button size="sm" onClick={() => { setCreateOpen((o) => !o); setEditing(null); }}>
            <Plus className="h-4 w-4" />
            New Status
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-gray-500 mb-3">
          Customize labels, colors, and descriptions for each project status. Statuses are used across workflows and the projects list.
        </p>

        {msg && (
          <div className={`text-xs px-3 py-2 rounded-md mb-2 flex items-center justify-between ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)}><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* Create form */}
        {createOpen && (
          <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3 mb-2">
            <p className="text-xs font-semibold text-blue-800">New Status</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Code *</label>
                <Input
                  value={newForm.code}
                  onChange={(e) => setNewForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, "_") }))}
                  placeholder="e.g. PENDING_LEGAL"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-400 mt-0.5">Uppercase, underscores only</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Label *</label>
                <Input
                  value={newForm.label}
                  onChange={(e) => setNewForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Pending Legal Review"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setNewForm((f) => ({ ...f, color: c.value }))}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-all ${c.cls} ${newForm.color === c.value ? "border-blue-500 scale-105" : "border-transparent"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
              <Input
                value={newForm.description}
                onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description (optional)"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={createStatus} disabled={saving || !newForm.code.trim() || !newForm.label.trim()}>
                {saving ? "Creating…" : "Create Status"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setCreateOpen(false); setNewForm(EMPTY_NEW); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {statuses.map((s) => (
          <div
            key={s.code}
            className={`border rounded-lg overflow-hidden ${!s.isActive ? "opacity-60" : ""}`}
          >
            {editing === s.code ? (
              <div className="p-4 space-y-3 bg-blue-50 border-blue-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400 w-36 shrink-0">{s.code}</span>
                  <Input
                    className="flex-1"
                    value={editState.label ?? ""}
                    onChange={(e) => setEditState((p) => ({ ...p, label: e.target.value }))}
                    placeholder="Display label"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setEditState((p) => ({ ...p, color: c.value }))}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-all ${c.cls} ${editState.color === c.value ? "border-blue-500 scale-105" : "border-transparent"}`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Description</label>
                  <Input
                    value={editState.description ?? ""}
                    onChange={(e) => setEditState((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Short description (optional)"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(s.code)} disabled={saving || !editState.label?.trim()}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-white">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${colorClass(s.color)}`}>
                  {s.label}
                </span>
                <span className="text-xs font-mono text-gray-400 shrink-0">{s.code}</span>
                <span className="flex-1 text-xs text-gray-500 truncate">{s.description}</span>

                {/* Enable / Disable toggle */}
                <button
                  onClick={() => quickToggle(s)}
                  disabled={toggling === s.code}
                  title={s.isActive ? "Click to disable" : "Click to enable"}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none ${s.isActive ? "bg-blue-600" : "bg-gray-200"} ${toggling === s.code ? "opacity-50" : ""}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${s.isActive ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                {!s.isActive && <span className="text-xs text-gray-400 italic shrink-0">disabled</span>}

                <button
                  onClick={() => startEdit(s)}
                  className="text-xs text-blue-600 hover:underline shrink-0"
                >
                  Edit
                </button>

                {/* Delete — only for custom (non-built-in) statuses */}
                {!BUILT_IN_CODES.has(s.code) && (
                  <button
                    onClick={() => deleteStatus(s.code)}
                    disabled={deleting === s.code}
                    className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                    title="Delete status"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
