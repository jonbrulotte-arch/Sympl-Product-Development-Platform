"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown, ChevronRight, Star, GripVertical } from "lucide-react";

type StageTemplate = {
  id: string; name: string; description: string | null;
  sortOrder: number; isRequired: boolean;
};

type WorkflowTemplate = {
  id: string; name: string; description: string | null;
  isDefault: boolean; isActive: boolean;
  stageTemplates: StageTemplate[];
};

export function WorkflowTemplatesClient() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingStageFor, setAddingStageFor] = useState<string | null>(null);
  const [stageName, setStageName] = useState("");
  const [stageDesc, setStageDesc] = useState("");
  const [stageRequired, setStageRequired] = useState(true);

  useEffect(() => {
    fetch("/api/admin/workflow-templates")
      .then((r) => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {});
  }, []);

  const createTemplate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/workflow-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
    });
    if (res.ok) {
      const t = await res.json();
      setTemplates((prev) => [...prev, t]);
      setExpanded((prev) => new Set([...prev, t.id]));
      setNewName(""); setNewDesc(""); setCreating(false);
    }
    setSaving(false);
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this workflow template?")) return;
    const res = await fetch(`/api/admin/workflow-templates/${id}`, { method: "DELETE" });
    if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const setDefault = async (id: string) => {
    const res = await fetch(`/api/admin/workflow-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (res.ok) {
      setTemplates((prev) => prev.map((t) => ({ ...t, isDefault: t.id === id })));
    }
  };

  const addStage = async (templateId: string) => {
    if (!stageName.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/admin/workflow-templates/${templateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addStage: { name: stageName, description: stageDesc, isRequired: stageRequired } }),
    });
    if (res.ok) {
      const stage = await res.json();
      setTemplates((prev) => prev.map((t) =>
        t.id === templateId ? { ...t, stageTemplates: [...t.stageTemplates, stage] } : t
      ));
      setStageName(""); setStageDesc(""); setStageRequired(true); setAddingStageFor(null);
    }
    setSaving(false);
  };

  const deleteStage = async (templateId: string, stageId: string) => {
    const res = await fetch(`/api/admin/workflow-templates/${templateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteStageId: stageId }),
    });
    if (res.ok) {
      setTemplates((prev) => prev.map((t) =>
        t.id === templateId
          ? { ...t, stageTemplates: t.stageTemplates.filter((s) => s.id !== stageId) }
          : t
      ));
    }
  };

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <CardTitle className="text-base">Workflow Templates</CardTitle>
        <Button size="sm" onClick={() => setCreating(true)} disabled={creating}>
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Define reusable approval workflows. The default template is applied automatically when a new project is created.
        </p>

        {creating && (
          <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-2">
            <p className="text-sm font-medium text-blue-800">New Template</p>
            <Input
              placeholder="Template name (e.g. Standard Approval)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createTemplate()}
              autoFocus
            />
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={createTemplate} disabled={!newName.trim() || saving}>
                {saving ? "Creating…" : "Create"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {templates.length === 0 && !creating && (
          <div className="text-center py-8 text-gray-400 text-sm">
            No workflow templates yet. Create one to define reusable approval stages.
          </div>
        )}

        {templates.map((template) => (
          <div key={template.id} className={`border rounded-lg overflow-hidden ${template.isDefault ? "border-blue-200" : "border-gray-200"}`}>
            <div
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${template.isDefault ? "bg-blue-50" : "bg-gray-50"} hover:bg-opacity-80`}
              onClick={() => toggle(template.id)}
            >
              {expanded.has(template.id)
                ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">{template.name}</span>
                  {template.isDefault && (
                    <Badge variant="default" className="text-xs">
                      <Star className="h-3 w-3 mr-1" />Default
                    </Badge>
                  )}
                  {!template.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                </div>
                {template.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs text-gray-400">{template.stageTemplates.length} stage{template.stageTemplates.length !== 1 ? "s" : ""}</span>
                {!template.isDefault && (
                  <button
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => setDefault(template.id)}
                  >
                    Set default
                  </button>
                )}
                <button
                  className="text-gray-300 hover:text-red-400 transition-colors"
                  onClick={() => deleteTemplate(template.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {expanded.has(template.id) && (
              <div className="p-4 space-y-2 bg-white">
                {template.stageTemplates.length === 0 && addingStageFor !== template.id && (
                  <p className="text-sm text-gray-400 text-center py-2">No stages yet.</p>
                )}

                {template.stageTemplates.map((stage, idx) => (
                  <div key={stage.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                    <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-bold shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{stage.name}</span>
                        {stage.isRequired && <Badge variant="outline" className="text-xs">Required</Badge>}
                      </div>
                      {stage.description && <p className="text-xs text-gray-500">{stage.description}</p>}
                    </div>
                    <button
                      className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                      onClick={() => deleteStage(template.id, stage.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {addingStageFor === template.id ? (
                  <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2 mt-2">
                    <Input
                      placeholder="Stage name (e.g. Legal Review)"
                      value={stageName}
                      onChange={(e) => setStageName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addStage(template.id)}
                      autoFocus
                    />
                    <Input
                      placeholder="Description (optional)"
                      value={stageDesc}
                      onChange={(e) => setStageDesc(e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stageRequired}
                        onChange={(e) => setStageRequired(e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-gray-700">Required stage</span>
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => addStage(template.id)} disabled={!stageName.trim() || saving}>
                        {saving ? "Adding…" : "Add Stage"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setAddingStageFor(null); setStageName(""); setStageDesc(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingStageFor(template.id); setStageName(""); setStageDesc(""); setStageRequired(true); }}
                    className="w-full border border-dashed border-gray-200 rounded-lg py-2 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors flex items-center justify-center gap-1 mt-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Stage
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
