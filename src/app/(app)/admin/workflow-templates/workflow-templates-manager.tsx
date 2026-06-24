"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Star, GripVertical,
  GitBranch, User, X, Pencil, Check,
} from "lucide-react";

type AssigneeUser = { id: string; name: string | null; email: string; role: string };
type StageTemplateAssignee = { id: string; userId: string; user: AssigneeUser };
type StageTemplate = {
  id: string; name: string; description: string | null;
  sortOrder: number; isRequired: boolean;
  defaultAssignees: StageTemplateAssignee[];
};
type WorkflowTemplate = {
  id: string; name: string; description: string | null;
  isDefault: boolean; isActive: boolean;
  stageTemplates: StageTemplate[];
};
type UserOption = { id: string; name: string | null; email: string; role: string };

export function WorkflowTemplatesManager() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingStageFor, setAddingStageFor] = useState<string | null>(null);
  const [stageName, setStageName] = useState("");
  const [stageDesc, setStageDesc] = useState("");
  const [stageRequired, setStageRequired] = useState(true);
  const [assigningFor, setAssigningFor] = useState<string | null>(null); // stageTemplateId
  const [editingStage, setEditingStage] = useState<{ templateId: string; stageId: string; name: string; desc: string } | null>(null);
  const [dragState, setDragState] = useState<{ templateId: string; dragIdx: number; overIdx: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/workflow-templates")
      .then((r) => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {});
    fetch("/api/users")
      .then((r) => r.ok ? r.json() : [])
      .then(setAllUsers)
      .catch(() => {});
  }, []);

  const patch = async (templateId: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/workflow-templates/${templateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res;
  };

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
    const res = await patch(id, { isDefault: true });
    if (res.ok) setTemplates((prev) => prev.map((t) => ({ ...t, isDefault: t.id === id })));
  };

  const addStage = async (templateId: string) => {
    if (!stageName.trim()) return;
    setSaving(true);
    const res = await patch(templateId, { addStage: { name: stageName, description: stageDesc, isRequired: stageRequired } });
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
    const res = await patch(templateId, { deleteStageId: stageId });
    if (res.ok) {
      setTemplates((prev) => prev.map((t) =>
        t.id === templateId ? { ...t, stageTemplates: t.stageTemplates.filter((s) => s.id !== stageId) } : t
      ));
    }
  };

  const saveStageEdit = async (templateId: string) => {
    if (!editingStage) return;
    const res = await patch(templateId, {
      updateStage: { id: editingStage.stageId, name: editingStage.name, description: editingStage.desc },
    });
    if (res.ok) {
      setTemplates((prev) => prev.map((t) =>
        t.id === templateId
          ? { ...t, stageTemplates: t.stageTemplates.map((s) =>
              s.id === editingStage.stageId ? { ...s, name: editingStage.name, description: editingStage.desc || null } : s
            )}
          : t
      ));
      setEditingStage(null);
    }
  };

  const addAssignee = async (templateId: string, stageTemplateId: string, userId: string) => {
    const res = await patch(templateId, { addAssignee: { stageTemplateId, userId } });
    if (res.ok) {
      const newAssignee = await res.json();
      setTemplates((prev) => prev.map((t) =>
        t.id === templateId
          ? { ...t, stageTemplates: t.stageTemplates.map((s) =>
              s.id === stageTemplateId
                ? { ...s, defaultAssignees: [...s.defaultAssignees, newAssignee] }
                : s
            )}
          : t
      ));
      setAssigningFor(null);
    }
  };

  const removeAssignee = async (templateId: string, stageTemplateId: string, userId: string) => {
    const res = await patch(templateId, { removeAssignee: { stageTemplateId, userId } });
    if (res.ok) {
      setTemplates((prev) => prev.map((t) =>
        t.id === templateId
          ? { ...t, stageTemplates: t.stageTemplates.map((s) =>
              s.id === stageTemplateId
                ? { ...s, defaultAssignees: s.defaultAssignees.filter((a) => a.userId !== userId) }
                : s
            )}
          : t
      ));
    }
  };

  // ── Drag-to-reorder ───────────────────────────────────────────────────────────
  const dragItem = useRef<number | null>(null);

  const onDragStart = (templateId: string, idx: number) => {
    dragItem.current = idx;
    setDragState({ templateId, dragIdx: idx, overIdx: idx });
  };

  const onDragEnter = (templateId: string, idx: number) => {
    if (dragState?.templateId !== templateId) return;
    setDragState((prev) => prev ? { ...prev, overIdx: idx } : null);
  };

  const onDragEnd = async (templateId: string) => {
    if (!dragState || dragState.dragIdx === dragState.overIdx) {
      setDragState(null);
      return;
    }
    const { dragIdx, overIdx } = dragState;
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const reordered = [...template.stageTemplates];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(overIdx, 0, moved);
    const withOrder = reordered.map((s, i) => ({ ...s, sortOrder: i }));

    setTemplates((prev) => prev.map((t) =>
      t.id === templateId ? { ...t, stageTemplates: withOrder } : t
    ));
    setDragState(null);

    await patch(templateId, {
      reorderStages: withOrder.map((s) => ({ id: s.id, sortOrder: s.sortOrder })),
    });
  };

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-gray-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Workflow Templates</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Define reusable approval workflows with default assignees. The default template is applied automatically when a new project is created.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreating(true)} disabled={creating}>
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </div>

      {/* Create form */}
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
        <div className="text-center py-16 text-gray-400">
          <GitBranch className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No workflow templates yet.</p>
          <button onClick={() => setCreating(true)} className="mt-2 text-sm text-blue-600 hover:underline">
            Create your first template
          </button>
        </div>
      )}

      {templates.map((template) => (
        <div
          key={template.id}
          className={`border rounded-xl overflow-hidden shadow-sm ${template.isDefault ? "border-blue-200" : "border-gray-200"}`}
        >
          {/* Template header */}
          <div
            className={`flex items-center gap-3 px-5 py-4 cursor-pointer select-none ${template.isDefault ? "bg-blue-50" : "bg-gray-50"}`}
            onClick={() => toggle(template.id)}
          >
            {expanded.has(template.id)
              ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
              : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{template.name}</span>
                {template.isDefault && (
                  <Badge className="text-xs bg-blue-600 text-white">
                    <Star className="h-3 w-3 mr-1" />Default
                  </Badge>
                )}
                {!template.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
              </div>
              {template.description && (
                <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 text-sm" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs text-gray-400">{template.stageTemplates.length} stage{template.stageTemplates.length !== 1 ? "s" : ""}</span>
              {!template.isDefault && (
                <button className="text-xs text-blue-600 hover:underline" onClick={() => setDefault(template.id)}>
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

          {/* Expanded stage list */}
          {expanded.has(template.id) && (
            <div className="bg-white divide-y divide-gray-100">
              {template.stageTemplates.length === 0 && addingStageFor !== template.id && (
                <p className="text-sm text-gray-400 text-center py-6">No stages yet.</p>
              )}

              {template.stageTemplates.map((stage, idx) => {
                const isDragging = dragState?.templateId === template.id && dragState.dragIdx === idx;
                const isOver = dragState?.templateId === template.id && dragState.overIdx === idx && dragState.dragIdx !== idx;
                const isEditing = editingStage?.stageId === stage.id;
                const isAssigningThis = assigningFor === stage.id;
                const assignedIds = new Set(stage.defaultAssignees.map((a) => a.userId));
                const unassigned = allUsers.filter((u) => !assignedIds.has(u.id));

                return (
                  <div
                    key={stage.id}
                    className={`transition-colors ${isDragging ? "opacity-40" : ""} ${isOver ? "border-t-2 border-blue-400" : ""}`}
                    draggable
                    onDragStart={() => onDragStart(template.id, idx)}
                    onDragEnter={() => onDragEnter(template.id, idx)}
                    onDragEnd={() => onDragEnd(template.id)}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="flex items-start gap-3 px-5 py-3 group">
                      {/* Drag handle */}
                      <div className="mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0">
                        <GripVertical className="h-4 w-4" />
                      </div>

                      {/* Step number */}
                      <div className="h-6 w-6 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                        {idx + 1}
                      </div>

                      {/* Stage content */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <Input
                              value={editingStage.name}
                              onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                              className="h-7 text-sm"
                              autoFocus
                            />
                            <Input
                              value={editingStage.desc}
                              onChange={(e) => setEditingStage({ ...editingStage, desc: e.target.value })}
                              placeholder="Description (optional)"
                              className="h-7 text-xs"
                            />
                            <div className="flex gap-1.5">
                              <button onClick={() => saveStageEdit(template.id)} className="text-green-600 hover:text-green-700">
                                <Check className="h-4 w-4" />
                              </button>
                              <button onClick={() => setEditingStage(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">{stage.name}</span>
                            {stage.isRequired && <Badge variant="outline" className="text-xs h-5">Required</Badge>}
                            {stage.description && (
                              <span className="text-xs text-gray-400 truncate max-w-[200px]">{stage.description}</span>
                            )}
                            <button
                              onClick={() => setEditingStage({ templateId: template.id, stageId: stage.id, name: stage.name, desc: stage.description ?? "" })}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-500 shrink-0"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        {/* Default assignees */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {stage.defaultAssignees.map((a) => (
                            <div key={a.id} className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-full pl-1.5 pr-1 py-0.5 text-xs text-gray-700">
                              <div className="h-4 w-4 rounded-full bg-blue-200 text-blue-800 text-[9px] flex items-center justify-center font-bold shrink-0">
                                {a.user.name?.[0] ?? "?"}
                              </div>
                              <span>{a.user.name ?? a.user.email}</span>
                              <button
                                onClick={() => removeAssignee(template.id, stage.id, a.userId)}
                                className="ml-0.5 text-gray-400 hover:text-red-500"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}

                          {/* Assign button */}
                          <button
                            onClick={() => setAssigningFor(isAssigningThis ? null : stage.id)}
                            className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            <User className="h-3 w-3" />
                            <span>{stage.defaultAssignees.length === 0 ? "Add default approver" : "Add"}</span>
                          </button>
                        </div>

                        {/* User picker dropdown */}
                        {isAssigningThis && (
                          <div className="mt-2 border border-blue-200 rounded-lg bg-white shadow-sm overflow-hidden max-w-xs">
                            {unassigned.length === 0 ? (
                              <p className="text-xs text-gray-400 p-3">All users already assigned.</p>
                            ) : (
                              <div className="max-h-48 overflow-y-auto">
                                {unassigned.map((u) => (
                                  <button
                                    key={u.id}
                                    onClick={() => addAssignee(template.id, stage.id, u.id)}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-left text-sm"
                                  >
                                    <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 text-xs flex items-center justify-center font-bold shrink-0">
                                      {u.name?.[0] ?? "?"}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-800">{u.name ?? u.email}</p>
                                      <p className="text-xs text-gray-400">{u.email}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="border-t px-3 py-1.5">
                              <button onClick={() => setAssigningFor(null)} className="text-xs text-gray-400 hover:text-gray-600">Done</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Delete stage */}
                      <button
                        className="mt-0.5 text-gray-200 hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={() => deleteStage(template.id, stage.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add stage */}
              {addingStageFor === template.id ? (
                <div className="px-5 py-4 bg-gray-50 border-t space-y-2">
                  <p className="text-sm font-medium text-gray-700">New Stage</p>
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
                <div className="px-5 py-2 border-t">
                  <button
                    onClick={() => { setAddingStageFor(template.id); setStageName(""); setStageDesc(""); setStageRequired(true); }}
                    className="w-full py-2 text-xs text-gray-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-1 border border-dashed border-gray-200 rounded-lg hover:border-blue-300"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Stage
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
