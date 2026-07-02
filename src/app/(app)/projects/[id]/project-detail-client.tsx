"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { ProductGrid } from "@/components/grid/product-grid";
import { formatDate } from "@/lib/utils";
import {
  Package, Calendar, Download, ArrowLeft, Users,
  MessageSquare, Clock, CheckCircle, RefreshCw, Plus, Trash2, Settings, Pencil, X, Lock, ShieldCheck, ClipboardCheck,
  ChevronUp, ChevronDown, AlertTriangle,
} from "lucide-react";
import type { ProjectWithRelations, ProductWithAttributes } from "@/types";
import { SalsifySyncModal } from "@/components/salsify/salsify-sync-modal";
import Link from "next/link";
import { Input } from "@/components/ui/input";

interface AttributeDef {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  attributeType: string;
  requirement: string;
  maxValues: number;
  salsifyEnabled: boolean;
  salsifyPropertyId: string | null;
  section: { id: string; name: string } | null;
  lovItems: { id: string; value: string; label: string; sortOrder: number }[];
}

interface CategoryOption { id: string; name: string; }

interface Props {
  project: ProjectWithRelations;
  initialProducts: ProductWithAttributes[];
  globalAttrs?: AttributeDef[];
  categoryAttrs?: AttributeDef[];
  coreAttrDefs?: AttributeDef[];
  allCategories?: CategoryOption[];
  canEdit: boolean;
  currentUserId: string;
  userRole?: string;
}

export function ProjectDetailClient({ project, initialProducts, globalAttrs = [], categoryAttrs = [], coreAttrDefs = [], allCategories = [], canEdit, currentUserId, userRole }: Props) {
  const [activeTab, setActiveTab] = useState("grid");
  const [salsifySyncing, setSalsifySyncing] = useState(false);
  const [salsifySyncResult, setSalsifySyncResult] = useState<string | null>(null);
  const [showSalsifyModal, setShowSalsifyModal] = useState(false);
  const [salsifySelectedIds, setSalsifySelectedIds] = useState<string[] | null>(null);
  const [gridReloadKey, setGridReloadKey] = useState(0);
  const router = useRouter();

  const openSalsifyModal = (selectedIds?: string[]) => {
    setSalsifySelectedIds(selectedIds && selectedIds.length > 0 ? selectedIds : null);
    setShowSalsifyModal(true);
  };

  const handleSalsifySync = async (skipKeys: string[]) => {
    setShowSalsifyModal(false);
    setSalsifySyncing(true);
    setSalsifySyncResult(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/salsify-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipAttributeKeys: skipKeys, ...(salsifySelectedIds ? { productIds: salsifySelectedIds } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        const errSummary = data.errors?.length ? ` — ${data.errors.length} error(s): ${data.errors[0]}` : "";
        setSalsifySyncResult(`Synced ${data.synced} of ${data.total} product(s) to Salsify${errSummary}`);
        // Refresh grid rows so the Salsify drift column reflects the new sync timestamps
        setGridReloadKey((k) => k + 1);
      } else {
        setSalsifySyncResult(data.error ?? "Sync failed");
      }
    } catch {
      setSalsifySyncResult("Sync failed — network error");
    } finally {
      setSalsifySyncing(false);
    }
  };

  const handleExport = async () => {
    const res = await fetch(`/api/projects/${project.id}/export`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9]/gi, "_")}_export.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStatusChange = async (newStatus: string) => {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) router.refresh();
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Project header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Link href="/projects" className="mt-1 text-gray-400 hover:text-gray-600 shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 truncate">{project.name}</h1>
                <ProjectStatusBadge status={project.status} />
                {(() => {
                  const overdue = ((project.workflowStages ?? []) as unknown as Stage[]).filter(
                    (s) => s.dueDate && !["APPROVED", "REJECTED", "SKIPPED"].includes(s.status) && new Date(s.dueDate) < new Date()
                  ).length;
                  return overdue > 0 ? (
                    <button
                      onClick={() => setActiveTab("workflow")}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 hover:bg-red-200"
                      title="Workflow stages past their due date — click to view"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {overdue} stage{overdue !== 1 ? "s" : ""} overdue
                    </button>
                  ) : null;
                })()}
                {project.brand && (
                  <Badge variant="secondary">{project.brand}</Badge>
                )}
                {project.category && (
                  <Badge variant="outline">{project.category.name}</Badge>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" />
                  {project._count.products} products
                </span>
                {project.targetLaunchDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Launch: {formatDate(project.targetLaunchDate)}
                  </span>
                )}
                <span>Owner: {project.owner.name}</span>
                <span>Updated: {formatDate(project.updatedAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEdit && project.status === "DRAFT" && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("IN_PROGRESS")}>
                Start Review
              </Button>
            )}
            {canEdit && project.status === "IN_PROGRESS" && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("NEEDS_REVIEW")}>
                Submit for Review
              </Button>
            )}
            {project.status === "EXPORT_READY" && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => openSalsifyModal()}
                  disabled={salsifySyncing}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${salsifySyncing ? "animate-spin" : ""}`} />
                  {salsifySyncing ? "Syncing…" : "Sync to Salsify"}
                </Button>
                {salsifySyncResult && (
                  <span className="text-xs text-gray-600">{salsifySyncResult}</span>
                )}
              </div>
            )}
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex gap-0 -mb-px overflow-x-auto scrollbar-none">
          {[
            { id: "grid", label: "Products", icon: Package },
            { id: "workflow", label: "Workflow", icon: CheckCircle },
            { id: "compliance", label: "Compliance", icon: ShieldCheck },
            { id: "inspections", label: "Inspections", icon: ClipboardCheck },
            { id: "comments", label: "Comments", icon: MessageSquare },
            { id: "activity", label: "Activity", icon: Clock },
            { id: "members", label: "Members", icon: Users },
            { id: "settings", label: "Settings", icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {/* ProductGrid stays mounted so in-progress edits survive tab switches */}
        <div className={activeTab === "grid" ? "absolute inset-0 flex flex-col" : "hidden"}>
          <ProductGrid
            projectId={project.id}
            initialProducts={initialProducts as never}
            globalAttrs={globalAttrs as never}
            categoryAttrs={categoryAttrs as never}
            coreAttrDefs={coreAttrDefs as never}
            canEdit={canEdit}
            onExport={handleExport}
            onImport={() => router.push(`/import?projectId=${project.id}`)}
            onSalsifySync={project.status === "EXPORT_READY" ? openSalsifyModal : undefined}
            reloadKey={gridReloadKey}
          />
        </div>

        {activeTab === "workflow" && (
          <WorkflowView project={project} canEdit={canEdit} currentUserId={currentUserId} />
        )}

        {activeTab === "compliance" && (
          <ProjectComplianceView projectId={project.id} />
        )}

        {activeTab === "inspections" && (
          <ProjectInspectionsView projectId={project.id} />
        )}

        {activeTab === "comments" && (
          <CommentsView projectId={project.id} currentUserId={currentUserId} userRole={userRole} />
        )}

        {activeTab === "activity" && (
          <ActivityView projectId={project.id} members={project.members ?? []} />
        )}

        {activeTab === "members" && (
          <MembersView project={project} canEdit={canEdit} />
        )}

        {activeTab === "settings" && (
          <SettingsView project={project} canEdit={canEdit} onSaved={() => router.refresh()} allCategories={allCategories} userRole={userRole} />
        )}
      </div>
      {showSalsifyModal && (
        <SalsifySyncModal
          mode="project"
          syncProductCount={salsifySelectedIds?.length}
          syncing={salsifySyncing}
          onConfirm={handleSalsifySync}
          onClose={() => setShowSalsifyModal(false)}
        />
      )}
    </div>
  );
}

// ─── Workflow View ─────────────────────────────────────────────────────────────

type StageApproval = {
  id: string; status: string; comments: string | null;
  approver: { id: string; name: string | null; email: string; image?: string | null };
};
type Stage = {
  id: string; name: string; description: string | null;
  status: string; sortOrder: number; completedAt: string | Date | null;
  dueDate: string | null;
  onApproveSetStatus: string | null;
  onRejectSetStatus: string | null;
  dependsOnStageId: string | null;
  dependsOnStage: { id: string; name: string; status: string } | null;
  complianceEventId: string | null;
  complianceEvent: { id: string; title: string; status: string; type: { name: string; color: string } } | null;
  psirId: string | null;
  psir: { id: string; title: string; result: string; referenceNumber: string | null } | null;
  approvals: StageApproval[];
};

type ComplianceEventOption = {
  id: string;
  title: string;
  status: string;
  severity: string;
  type: { name: string; color: string };
  products: { product: { id: string; partNumber: string | null; itemName: string | null } }[];
};

type PsirOption = {
  id: string;
  title: string;
  referenceNumber: string | null;
  result: string;
  status: string;
  products: { product: { id: string; partNumber: string | null; itemName: string | null } }[];
};

type StatusOption = { code: string; label: string; color: string; isActive: boolean };

type TemplateOption = { id: string; name: string; description: string | null; stageTemplates: { name: string }[] };
type UserOption = { id: string; name: string | null; email: string; role: string };

function statusColor(status: string) {
  if (status === "APPROVED") return "bg-green-100 text-green-700 border-green-200";
  if (status === "REJECTED") return "bg-red-100 text-red-700 border-red-200";
  if (status === "IN_REVIEW") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-gray-100 text-gray-500 border-gray-200";
}

function WorkflowView({
  project, canEdit, currentUserId,
}: {
  project: ProjectWithRelations; canEdit: boolean; currentUserId: string;
}) {
  const router = useRouter();
  const [stages, setStages] = useState<Stage[]>((project.workflowStages ?? []) as unknown as Stage[]);
  const [addingStage, setAddingStage] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newOnApprove, setNewOnApprove] = useState("");
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [votingFor, setVotingFor] = useState<string | null>(null);
  const [voteComment, setVoteComment] = useState("");
  const [editingDescFor, setEditingDescFor] = useState<string | null>(null);
  const [editDescValue, setEditDescValue] = useState("");
  const [projectStatuses, setProjectStatuses] = useState<StatusOption[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [complianceEvents, setComplianceEvents] = useState<ComplianceEventOption[]>([]);
  const [psirOptions, setPsirOptions] = useState<PsirOption[]>([]);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${project.id}/psir`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setPsirOptions(data); })
      .catch(() => {});
    fetch(`/api/projects/${project.id}/compliance-events`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setComplianceEvents(data); })
      .catch(() => {});
    fetch("/api/admin/workflow-templates")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setTemplates(data); })
      .catch(() => {});
    fetch("/api/admin/project-statuses")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setProjectStatuses(data.filter((s: StatusOption) => s.isActive)); })
      .catch(() => {});
    fetch("/api/users")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setAllUsers(data); })
      .catch(() => {});
  }, []);

  const addStage = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setWorkflowError(null);
    const res = await fetch(`/api/projects/${project.id}/workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDesc.trim() || null,
        sortOrder: stages.length,
        onApproveSetStatus: newOnApprove || null,
      }),
    });
    if (res.ok) {
      const stage = await res.json();
      setStages((prev) => [...prev, stage]);
      setNewName(""); setNewDesc(""); setNewOnApprove(""); setAddingStage(false);
    } else {
      const err = await res.json().catch(() => ({}));
      setWorkflowError(err.error ?? `Save failed (${res.status})`);
    }
    setSaving(false);
  };

  const applyStageUpdate = (updated: Stage) => {
    setStages((prev) => prev.map((s) => {
      if (s.id === updated.id) return updated;
      if (s.dependsOnStage?.id === updated.id) {
        return { ...s, dependsOnStage: { ...s.dependsOnStage, status: updated.status } };
      }
      return s;
    }));
  };

  const patchStage = async (stageId: string, patch: Record<string, unknown>) => {
    setWorkflowError(null);
    const res = await fetch(`/api/projects/${project.id}/workflow`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, ...patch }),
    });
    if (res.ok) {
      const updated = await res.json();
      applyStageUpdate(updated);
    } else {
      const err = await res.json().catch(() => ({}));
      setWorkflowError(err.error ?? `Save failed (${res.status})`);
    }
    return res.ok;
  };

  const saveDescription = async (stageId: string) => {
    await patchStage(stageId, { description: editDescValue.trim() || null });
    setEditingDescFor(null);
  };

  const updateStatus = async (stageId: string, status: string) => {
    const ok = await patchStage(stageId, { status });
    if (ok) router.refresh();
  };

  const resetVote = async (stageId: string) => {
    setSaving(true);
    const res = await fetch(`/api/projects/${project.id}/workflow`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, reset: true }),
    });
    if (res.ok) {
      const updated = await res.json();
      applyStageUpdate(updated);
    }
    setSaving(false);
  };

  const deleteStage = async (stageId: string) => {
    const res = await fetch(`/api/projects/${project.id}/workflow`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    if (res.ok) setStages((prev) => prev.filter((s) => s.id !== stageId));
  };

  const moveStage = async (stageId: string, direction: -1 | 1) => {
    const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === stageId);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    // Swap sortOrders
    const reorder = [
      { id: sorted[idx].id, sortOrder: sorted[swapIdx].sortOrder },
      { id: sorted[swapIdx].id, sortOrder: sorted[idx].sortOrder },
    ];

    // Optimistic update
    setStages((prev) =>
      prev.map((s) => {
        const r = reorder.find((x) => x.id === s.id);
        return r ? { ...s, sortOrder: r.sortOrder } : s;
      })
    );

    await fetch(`/api/projects/${project.id}/workflow`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reorder }),
    });
  };

  const applyTemplate = async (templateId: string) => {
    setSaving(true);
    const res = await fetch(`/api/projects/${project.id}/workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applyTemplateId: templateId }),
    });
    if (res.ok) {
      const newStages = await res.json();
      setStages((prev) => [...prev, ...newStages]);
      setShowTemplatePicker(false);
    }
    setSaving(false);
  };

  const assignApprover = async (stageId: string, userId: string) => {
    setWorkflowError(null);
    const res = await fetch(`/api/projects/${project.id}/workflow/approvers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, userId }),
    });
    if (res.ok) {
      const approval = await res.json();
      setStages((prev) => prev.map((s) =>
        s.id === stageId
          ? { ...s, approvals: s.approvals.some((a) => a.approver.id === userId)
              ? s.approvals.map((a) => a.approver.id === userId ? approval : a)
              : [...s.approvals, approval] }
          : s
      ));
    } else {
      const err = await res.json().catch(() => ({}));
      setWorkflowError(err.error ?? `Assign failed (${res.status})`);
    }
  };

  const removeApprover = async (stageId: string, userId: string) => {
    const res = await fetch(`/api/projects/${project.id}/workflow/approvers`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, userId }),
    });
    if (res.ok) {
      setStages((prev) => prev.map((s) =>
        s.id === stageId
          ? { ...s, approvals: s.approvals.filter((a) => a.approver.id !== userId) }
          : s
      ));
    }
  };

  const castVote = async (stageId: string, vote: "APPROVED" | "REJECTED") => {
    setSaving(true);
    const res = await fetch(`/api/projects/${project.id}/workflow`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, vote, voteComment: voteComment || null }),
    });
    if (res.ok) {
      const updated = await res.json();
      applyStageUpdate(updated);
      setVotingFor(null);
      setVoteComment("");
      // Refresh server data in case project status changed due to onApproveSetStatus/onRejectSetStatus
      router.refresh();
    }
    setSaving(false);
  };

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full">
      <div className="space-y-4">
        {workflowError && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            <span>{workflowError}</span>
            <button onClick={() => setWorkflowError(null)} className="shrink-0 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        {/* Template picker toggle */}
        {canEdit && templates.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {stages.length} stage{stages.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={() => setShowTemplatePicker((v) => !v)}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Use a template
            </button>
          </div>
        )}

        {showTemplatePicker && (
          <div className="border border-blue-200 rounded-lg bg-blue-50 p-4 space-y-2">
            <p className="text-sm font-medium text-blue-800">Apply a workflow template</p>
            <p className="text-xs text-gray-500">Stages will be added to any existing stages.</p>
            <div className="space-y-2 mt-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  disabled={saving}
                  onClick={() => applyTemplate(t.id)}
                  className="w-full text-left px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                >
                  <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">{t.name}</p>
                  {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {t.stageTemplates.map((s) => s.name).join(" → ")}
                  </p>
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowTemplatePicker(false)} className="mt-1">
              Cancel
            </Button>
          </div>
        )}

        {stages.length === 0 && !addingStage && !showTemplatePicker && (
          <div className="text-center py-8 text-gray-400">
            <CheckCircle className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No workflow stages yet.</p>
            {canEdit && templates.length > 0 && (
              <button
                onClick={() => setShowTemplatePicker(true)}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Start from a template
              </button>
            )}
          </div>
        )}

        {[...stages].sort((a, b) => a.sortOrder - b.sortOrder).map((stage, idx) => {
          const myApproval = stage.approvals.find((a) => a.approver.id === currentUserId);
          // Blocked when the dependency stage exists and is not yet approved/skipped
          const depStage = stage.dependsOnStage;
          const isDepBlocked = !!depStage && depStage.status !== "APPROVED" && depStage.status !== "SKIPPED";
          // Blocked when the linked compliance event is not yet resolved/closed/waived
          const compEvent = stage.complianceEvent;
          const isCompBlocked = !!compEvent && !["RESOLVED", "CLOSED", "WAIVED"].includes(compEvent.status);
          // Blocked when the linked PSIR result is not PASS or CONDITIONAL
          const psirDep = stage.psir;
          const isPsirBlocked = !!psirDep && !["PASS", "CONDITIONAL"].includes(psirDep.result);
          const isBlocked = isDepBlocked || isCompBlocked || isPsirBlocked;
          const canVote = myApproval?.status === "PENDING" && stage.status === "IN_REVIEW" && !isBlocked;
          const isVoting = votingFor === stage.id;
          const isAssigning = assigningFor === stage.id;
          const assignedIds = new Set(stage.approvals.map((a) => a.approver.id));

          const sortedStages = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
          const isFirst = sortedStages[0]?.id === stage.id;
          const isLast = sortedStages[sortedStages.length - 1]?.id === stage.id;

          return (
            <div key={stage.id} className="flex items-start gap-4">
              {/* Step number + reorder buttons */}
              <div className="flex flex-col items-center gap-0.5">
                <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  stage.status === "APPROVED" ? "bg-green-100 text-green-700" :
                  stage.status === "IN_REVIEW" ? "bg-blue-100 text-blue-700" :
                  stage.status === "REJECTED" ? "bg-red-100 text-red-700" :
                  "bg-gray-100 text-gray-500"
                }`}>
                  {idx + 1}
                </div>
                {canEdit && (
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveStage(stage.id, -1)}
                      disabled={isFirst}
                      className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveStage(stage.id, 1)}
                      disabled={isLast}
                      className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
                {/* Stage header */}
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900">{stage.name}</h3>

                    {/* Description — inline editable */}
                    {editingDescFor === stage.id ? (
                      <div className="mt-1.5 flex gap-2">
                        <textarea
                          className="flex-1 border border-blue-300 rounded-lg p-1.5 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={2}
                          value={editDescValue}
                          onChange={(e) => setEditDescValue(e.target.value)}
                          autoFocus
                          placeholder="Describe what needs to be done in this stage…"
                        />
                        <div className="flex flex-col gap-1">
                          <button onClick={() => saveDescription(stage.id)}
                            className="text-green-600 hover:text-green-700 p-0.5">
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingDescFor(null)}
                            className="text-gray-400 hover:text-gray-600 p-0.5">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1 mt-0.5 group/desc">
                        {stage.description ? (
                          <p className="text-sm text-gray-500">{stage.description}</p>
                        ) : (
                          <p className="text-sm text-gray-300 italic">No description</p>
                        )}
                        {canEdit && stage.status !== "APPROVED" && stage.status !== "REJECTED" && (
                          <button
                            onClick={() => { setEditingDescFor(stage.id); setEditDescValue(stage.description ?? ""); }}
                            className="opacity-0 group-hover/desc:opacity-100 transition-opacity text-gray-400 hover:text-blue-500 shrink-0 mt-0.5"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}

                    {stage.complianceEvent && (
                      <div className="flex items-center gap-1 mt-1">
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: stage.complianceEvent.type.color }}
                        />
                        <span className="text-xs text-indigo-600">
                          Compliance: {stage.complianceEvent.title}
                          {" "}
                          <span className={`font-medium ${isCompBlocked ? "text-amber-600" : "text-green-600"}`}>
                            ({stage.complianceEvent.status.replace("_", " ")})
                          </span>
                        </span>
                      </div>
                    )}
                    {stage.psir && (
                      <div className="flex items-center gap-1 mt-1">
                        <ClipboardCheck className="h-3 w-3 text-violet-400 shrink-0" />
                        <span className="text-xs text-violet-600">
                          Inspection: {stage.psir.title}
                          {stage.psir.referenceNumber && <span className="text-violet-400"> #{stage.psir.referenceNumber}</span>}
                          {" "}
                          <span className={`font-medium ${isPsirBlocked ? "text-amber-600" : "text-green-600"}`}>
                            ({stage.psir.result})
                          </span>
                        </span>
                      </div>
                    )}
                    {/* Due date — inline editable, red when overdue */}
                    <div className="flex items-center gap-1.5 mt-1">
                      {(() => {
                        const isDone = stage.status === "APPROVED" || stage.status === "REJECTED" || stage.status === "SKIPPED";
                        const isOverdue = !!stage.dueDate && !isDone && new Date(stage.dueDate) < new Date();
                        return (
                          <>
                            {stage.dueDate ? (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isOverdue ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                                Due {formatDate(stage.dueDate)}{isOverdue && " — overdue"}
                              </span>
                            ) : null}
                            {canEdit && !isDone && (
                              <input
                                type="date"
                                className="text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-500 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                value={stage.dueDate ? new Date(stage.dueDate).toISOString().slice(0, 10) : ""}
                                onChange={(e) => patchStage(stage.id, { dueDate: e.target.value || null })}
                                title="Stage due date"
                              />
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {stage.completedAt && (
                      <p className="text-xs text-gray-400 mt-1">Completed: {formatDate(stage.completedAt as string)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColor(stage.status)}`}>
                      {stage.status.replace("_", " ")}
                    </span>
                    {canEdit && stage.status === "PENDING" && stage.approvals.length === 0 && (
                      <Button size="sm" variant="outline" className="text-blue-600 border-blue-200"
                        onClick={() => updateStatus(stage.id, "IN_REVIEW")}>
                        Start Review
                      </Button>
                    )}
                    {canEdit && stage.status === "PENDING" && stage.approvals.length > 0 && (
                      <Button size="sm" variant="outline" className="text-blue-600 border-blue-200"
                        onClick={() => updateStatus(stage.id, "IN_REVIEW")}>
                        Open for Voting
                      </Button>
                    )}
                    {canEdit && (stage.status === "APPROVED" || stage.status === "REJECTED") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-amber-600 border-amber-200 hover:bg-amber-50"
                        disabled={saving}
                        onClick={() => resetVote(stage.id)}
                      >
                        Reset Vote
                      </Button>
                    )}
                    {canEdit && (
                      <button onClick={() => deleteStage(stage.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dependency blocked banner */}
                {isDepBlocked && depStage && (
                  <div className="border-t border-amber-200 px-4 py-2 bg-amber-50 flex items-center gap-2 text-xs text-amber-700">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Blocked — waiting on <span className="font-semibold">{depStage.name}</span> (
                      {depStage.status === "REJECTED" ? "rejected" : "not yet approved"})
                    </span>
                  </div>
                )}

                {/* PSIR blocked banner */}
                {isPsirBlocked && psirDep && (
                  <div className="border-t border-violet-200 px-4 py-2 bg-violet-50 flex items-center gap-2 text-xs text-violet-700">
                    <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Inspection dependency unresolved —{" "}
                      <a href={`/psir/${psirDep.id}`} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                        {psirDep.title}
                      </a>{" "}
                      result is <span className="font-medium">{psirDep.result}</span>
                    </span>
                  </div>
                )}

                {/* Compliance blocked banner */}
                {isCompBlocked && compEvent && (
                  <div className="border-t border-indigo-200 px-4 py-2 bg-indigo-50 flex items-center gap-2 text-xs text-indigo-700">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Compliance dependency unresolved —{" "}
                      <a href="/compliance" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                        {compEvent.title}
                      </a>{" "}
                      is <span className="font-medium">{compEvent.status.replace("_", " ")}</span>
                    </span>
                  </div>
                )}

                {/* On Approval / On Rejection automations + Depends on — only show when editable and not complete */}
                {canEdit && stage.status !== "APPROVED" && stage.status !== "REJECTED" && (
                  <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 flex flex-wrap items-center gap-x-6 gap-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 shrink-0">On approval →</span>
                      <select
                        value={stage.onApproveSetStatus ?? ""}
                        onChange={(e) => patchStage(stage.id, { onApproveSetStatus: e.target.value || null })}
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-900"
                      >
                        <option value="">No status change</option>
                        {projectStatuses.map((ps) => (
                          <option key={ps.code} value={ps.code}>{ps.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 shrink-0">On rejection →</span>
                      <select
                        value={stage.onRejectSetStatus ?? ""}
                        onChange={(e) => patchStage(stage.id, { onRejectSetStatus: e.target.value || null })}
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-red-400 text-gray-900"
                      >
                        <option value="">No status change</option>
                        {projectStatuses.map((ps) => (
                          <option key={ps.code} value={ps.code}>{ps.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 shrink-0">Depends on →</span>
                      <select
                        value={stage.dependsOnStageId ?? ""}
                        onChange={(e) => patchStage(stage.id, { dependsOnStageId: e.target.value || null })}
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400 text-gray-900"
                      >
                        <option value="">No dependency</option>
                        {stages.filter((s) => s.id !== stage.id).map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      <span className="text-xs text-gray-400 shrink-0">Compliance →</span>
                      <select
                        value={stage.complianceEventId ?? ""}
                        onChange={(e) => patchStage(stage.id, { complianceEventId: e.target.value || null })}
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 text-gray-900 max-w-[220px]"
                      >
                        <option value="">No compliance requirement</option>
                        {complianceEvents.map((ce) => (
                          <option key={ce.id} value={ce.id}>
                            {ce.title} ({ce.status.replace("_", " ")})
                          </option>
                        ))}
                      </select>
                      {complianceEvents.length === 0 && (
                        <span className="text-xs text-gray-400 italic">No compliance events for this project&apos;s products</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                      <span className="text-xs text-gray-400 shrink-0">Inspection →</span>
                      <select
                        value={stage.psirId ?? ""}
                        onChange={(e) => patchStage(stage.id, { psirId: e.target.value || null })}
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 text-gray-900 max-w-[220px]"
                      >
                        <option value="">No inspection requirement</option>
                        {psirOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} ({p.result})
                          </option>
                        ))}
                      </select>
                      {psirOptions.length === 0 && (
                        <span className="text-xs text-gray-400 italic">No inspections for this project&apos;s products</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Completed stage decision summary */}
                {(stage.status === "APPROVED" || stage.status === "REJECTED") && stage.approvals.length > 0 && (
                  <div className={`border-t px-4 py-2 ${stage.status === "APPROVED" ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                    <p className={`text-xs font-medium mb-1 ${stage.status === "APPROVED" ? "text-green-700" : "text-red-700"}`}>
                      Decision Record
                    </p>
                    <div className="space-y-1">
                      {stage.approvals.map((a) => (
                        <div key={a.id} className="flex items-start gap-2 text-xs">
                          <div className={`h-4 w-4 rounded-full flex items-center justify-center font-bold text-[9px] shrink-0 mt-0.5 ${
                            a.status === "APPROVED" ? "bg-green-200 text-green-800" :
                            a.status === "REJECTED" ? "bg-red-200 text-red-800" : "bg-gray-200 text-gray-600"
                          }`}>
                            {a.approver.name?.[0] ?? "?"}
                          </div>
                          <div className="flex-1">
                            <span className="font-medium text-gray-800">{a.approver.name ?? a.approver.email}</span>
                            <span className={`ml-1.5 font-medium ${a.status === "APPROVED" ? "text-green-700" : a.status === "REJECTED" ? "text-red-700" : "text-gray-500"}`}>
                              {a.status}
                            </span>
                            {a.comments && <span className="ml-1.5 text-gray-500 italic">"{a.comments}"</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approvers section */}
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Approvers {stage.approvals.length > 0 && `(${stage.approvals.filter((a) => a.status === "APPROVED").length}/${stage.approvals.length} approved)`}
                    </p>
                    {canEdit && stage.status !== "APPROVED" && stage.status !== "REJECTED" && (
                      <button
                        onClick={() => setAssigningFor(isAssigning ? null : stage.id)}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                      >
                        <Plus className="h-3 w-3" /> Assign
                      </button>
                    )}
                  </div>

                  {stage.approvals.length === 0 && !isAssigning && (
                    <p className="text-xs text-gray-400 italic">No approvers assigned</p>
                  )}

                  {/* Approver chips */}
                  <div className="flex flex-wrap gap-2">
                    {stage.approvals.map((approval) => (
                      <div
                        key={approval.id}
                        className={`flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border text-xs font-medium ${statusColor(approval.status)}`}
                      >
                        <div className="h-5 w-5 rounded-full bg-white bg-opacity-60 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {approval.approver.name?.[0] ?? "?"}
                        </div>
                        <span>{approval.approver.name ?? approval.approver.email}</span>
                        <span className="opacity-60">·</span>
                        <span className="opacity-80">{approval.status}</span>
                        {approval.comments && (
                          <span className="opacity-60 max-w-[120px] truncate" title={approval.comments}>"{approval.comments}"</span>
                        )}
                        {canEdit && stage.status !== "APPROVED" && stage.status !== "REJECTED" && (
                          <button
                            onClick={() => removeApprover(stage.id, approval.approver.id)}
                            className="ml-0.5 opacity-40 hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Assign user dropdown */}
                  {isAssigning && (
                    <div className="mt-2 border border-blue-200 rounded-lg bg-white shadow-sm overflow-hidden">
                      {allUsers.filter((u) => !assignedIds.has(u.id)).length === 0 ? (
                        <p className="text-xs text-gray-400 p-3">All users are already assigned.</p>
                      ) : (
                        <div className="max-h-56 overflow-y-auto">
                          {allUsers
                            .filter((u) => !assignedIds.has(u.id))
                            .map((u) => (
                              <button
                                key={u.id}
                                onClick={() => { assignApprover(stage.id, u.id); setAssigningFor(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-colors text-left"
                              >
                                <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 text-xs flex items-center justify-center font-bold shrink-0">
                                  {u.name?.[0] ?? "?"}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800">{u.name ?? u.email}</p>
                                  <p className="text-xs text-gray-400">{u.email}</p>
                                </div>
                                <span className="text-xs text-gray-400 shrink-0">{u.role.replace("_", " ")}</span>
                              </button>
                            ))
                          }
                        </div>
                      )}
                      <div className="border-t border-gray-100 px-3 py-2">
                        <button onClick={() => setAssigningFor(null)} className="text-xs text-gray-400 hover:text-gray-600">Done</button>
                      </div>
                    </div>
                  )}

                  {/* Vote panel for current user */}
                  {canVote && !isVoting && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-blue-700 font-medium">Your vote:</span>
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => setVotingFor(stage.id)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-xs"
                        onClick={() => setVotingFor(stage.id)}>
                        Reject
                      </Button>
                    </div>
                  )}

                  {canVote && isVoting && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        className="w-full border border-gray-300 rounded-lg p-2 text-xs text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={2}
                        placeholder="Add a comment (optional)"
                        value={voteComment}
                        onChange={(e) => setVoteComment(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                          disabled={saving} onClick={() => castVote(stage.id, "APPROVED")}>
                          {saving ? "…" : "Approve"}
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 text-xs"
                          disabled={saving} onClick={() => castVote(stage.id, "REJECTED")}>
                          {saving ? "…" : "Reject"}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => { setVotingFor(null); setVoteComment(""); }}>
                          Cancel
                        </Button>
                      </div>
                      <p className="text-xs text-amber-600">Unanimous approval required — one rejection closes the stage.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Add stage form */}
        {addingStage ? (
          <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
            <p className="text-sm font-medium text-blue-800">New Workflow Stage</p>
            <Input
              placeholder="Stage name (e.g. Legal Review)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStage()}
              autoFocus
            />
            <Input
              placeholder="What needs to be done in this stage? (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">On Approval → set project status to</label>
              <select
                value={newOnApprove}
                onChange={(e) => setNewOnApprove(e.target.value)}
                className="w-full text-sm text-gray-900 border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No status change</option>
                {projectStatuses.map((ps) => (
                  <option key={ps.code} value={ps.code}>{ps.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addStage} disabled={!newName.trim() || saving}>
                {saving ? "Adding…" : "Add Stage"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAddingStage(false); setNewName(""); setNewDesc(""); setNewOnApprove(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : canEdit && (
          <button
            onClick={() => setAddingStage(true)}
            className="w-full border-2 border-dashed border-gray-200 rounded-lg py-3 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors flex items-center justify-center gap-1"
          >
            <Plus className="h-4 w-4" /> Add Workflow Stage
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Comment content parser ────────────────────────────────────────────────────

type Attachment = { name: string; url: string; size: number; type: string };

function parseComment(content: string): { text: string; attachments: Attachment[] } {
  const match = content.match(/<!--attachments:(\[.*?\])-->/s);
  if (!match) return { text: content, attachments: [] };
  let attachments: Attachment[] = [];
  try { attachments = JSON.parse(match[1]); } catch { /* ignore */ }
  const text = content.replace(/<!--attachments:\[.*?\]-->/s, "").trim();
  return { text, attachments };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return "🖼️";
  if (type === "application/pdf") return "📄";
  if (type.includes("spreadsheet") || type === "text/csv") return "📊";
  if (type.includes("word")) return "📝";
  return "📎";
}

// ─── Comments View ─────────────────────────────────────────────────────────────

function CommentsView({ projectId, currentUserId, userRole }: { projectId: string; currentUserId: string; userRole?: string }) {
  const [comments, setComments] = useState<Array<{
    id: string; content: string; createdAt: string;
    author: { id: string; name: string | null; email: string };
    replies: Array<{ id: string; content: string; createdAt: string; author: { id: string; name: string | null; email: string } }>;
  }>>([]);
  const [newComment, setNewComment] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/comments`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => { if (Array.isArray(data)) setComments(data); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [projectId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (res.ok) {
        const data = await res.json();
        setPendingAttachments((prev) => [...prev, data]);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const postComment = async () => {
    if (!newComment.trim() && pendingAttachments.length === 0) return;
    setPosting(true);
    let content = newComment;
    if (pendingAttachments.length > 0) {
      content += `<!--attachments:${JSON.stringify(pendingAttachments)}-->`;
    }
    const res = await fetch(`/api/projects/${projectId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const comment = await res.json();
      setComments((prev) => [comment, ...prev]);
      setNewComment("");
      setPendingAttachments([]);
    }
    setPosting(false);
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm("Delete this comment?")) return;
    const res = await fetch(`/api/projects/${projectId}/comments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId }),
    });
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const canDelete = (authorId: string) => authorId === currentUserId || userRole === "ADMIN";

  return (
    <div className="p-6 max-w-2xl space-y-4">
      {/* Compose box */}
      <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 bg-white">
        <textarea
          className="w-full p-3 text-sm text-gray-900 resize-none focus:outline-none"
          rows={3}
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment(); }}
        />
        {pendingAttachments.length > 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {pendingAttachments.map((a, i) => (
              <div key={i} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-xs text-gray-700">
                <span>{fileIcon(a.type)}</span>
                <span className="truncate max-w-[120px]">{a.name}</span>
                <button onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))} className="ml-1 text-gray-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-gray-400 hover:text-blue-500 transition-colors"
            title="Attach file"
          >
            {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
          <Button size="sm" onClick={postComment} disabled={posting || uploading || (!newComment.trim() && pendingAttachments.length === 0)}>
            {posting ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>

      {!loaded && <p className="text-sm text-gray-400">Loading…</p>}

      <div className="space-y-4">
        {comments.map((comment) => {
          const { text, attachments } = parseComment(comment.content);
          return (
            <div key={comment.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">
                  {comment.author.name?.[0] ?? "?"}
                </div>
                <span className="text-sm font-medium">{comment.author.name ?? comment.author.email}</span>
                <span className="text-xs text-gray-400">{formatDate(comment.createdAt)}</span>
                {canDelete(comment.author.id) && (
                  <button
                    onClick={() => deleteComment(comment.id)}
                    className="ml-auto text-gray-300 hover:text-red-400 transition-colors"
                    title="Delete comment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {text && <p className="text-sm text-gray-700 whitespace-pre-wrap">{text}</p>}
              {attachments.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {attachments.map((a, i) => (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-base">{fileIcon(a.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 truncate">{a.name}</p>
                        <p className="text-xs text-gray-400">{formatBytes(a.size)}</p>
                      </div>
                      <span className="text-xs text-gray-400 group-hover:text-blue-500 shrink-0">Download ↓</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Activity View ─────────────────────────────────────────────────────────────

type ActivityLog = {
  id: string; action: string; entityType: string; fieldKey: string | null;
  oldValue: string | null; newValue: string | null; createdAt: string;
  metadata: Record<string, unknown> | null;
  user: { id: string; name: string | null };
};

const ACTION_LABELS: Record<string, string> = {
  CREATED: "Created", UPDATED: "Updated", DELETED: "Deleted",
  STATUS_CHANGED: "Changed status of", APPROVED: "Approved", REJECTED: "Rejected",
  SUBMITTED: "Submitted", IMPORTED: "Imported", EXPORTED: "Exported",
  COMMENTED: "Commented on", ASSIGNED: "Assigned", ARCHIVED: "Archived",
  RESTORED: "Restored", DUPLICATED: "Duplicated",
};

const ENTITY_LABELS: Record<string, string> = {
  WorkflowStage: "workflow stage", ProductRecord: "product", Project: "project",
};

function activityDescription(log: ActivityLog): string {
  const action = ACTION_LABELS[log.action] ?? log.action;
  const entity = ENTITY_LABELS[log.entityType] ?? log.entityType;
  const meta = log.metadata as Record<string, unknown> | null;
  const stageName = meta?.stageName as string | undefined;
  const comment = meta?.comment as string | undefined;

  if (log.action === "APPROVED" || log.action === "REJECTED") {
    return `${action} ${stageName ? `"${stageName}"` : entity}${comment ? ` — "${comment}"` : ""}`;
  }
  if (log.action === "STATUS_CHANGED") {
    const reset = meta?.reset as boolean | undefined;
    return `${reset ? "Reset" : "Set"} ${stageName ? `"${stageName}"` : entity} status to ${log.newValue ?? ""}`;
  }
  if (log.action === "CREATED" && log.newValue) return `${action} ${entity} "${log.newValue}"`;
  if (log.action === "DELETED" && log.oldValue) return `${action} ${entity} "${log.oldValue}"`;
  return `${action} ${entity}${log.fieldKey ? ` (${log.fieldKey})` : ""}`;
}

const ACTION_ICON_COLOR: Record<string, string> = {
  APPROVED: "text-green-500", REJECTED: "text-red-500", DELETED: "text-red-400",
  STATUS_CHANGED: "text-blue-500", CREATED: "text-indigo-500",
};

function ActivityView({ projectId, members }: { projectId: string; members: Array<{ user: { id: string; name: string | null } }> }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterUserId, setFilterUserId] = useState("");

  useEffect(() => {
    setLoaded(false);
    const params = new URLSearchParams();
    if (filterEntityType) params.set("entityType", filterEntityType);
    if (filterAction) params.set("action", filterAction);
    if (filterUserId) params.set("userId", filterUserId);
    fetch(`/api/projects/${projectId}/activity?${params}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => { if (Array.isArray(data.data)) setLogs(data.data); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [projectId, filterEntityType, filterAction, filterUserId]);

  const hasFilters = filterEntityType || filterAction || filterUserId;

  return (
    <div className="p-6 max-w-3xl">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filterEntityType}
          onChange={(e) => setFilterEntityType(e.target.value)}
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All types</option>
          <option value="WorkflowStage">Workflow</option>
          <option value="ProductRecord">Products</option>
          <option value="Project">Project</option>
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All actions</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="STATUS_CHANGED">Status changed</option>
          <option value="CREATED">Created</option>
          <option value="UPDATED">Updated</option>
          <option value="DELETED">Deleted</option>
          <option value="COMMENTED">Commented</option>
          <option value="ASSIGNED">Assigned</option>
        </select>
        <select
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All users</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterEntityType(""); setFilterAction(""); setFilterUserId(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Log list */}
      <div className="space-y-0 divide-y divide-gray-100">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 py-3">
            <Clock className={`h-4 w-4 mt-0.5 shrink-0 ${ACTION_ICON_COLOR[log.action] ?? "text-gray-400"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-700">
                <span className="font-medium">{log.user.name}</span>{" "}
                {activityDescription(log)}
              </p>
              {log.oldValue && log.newValue && log.action === "UPDATED" && (
                <p className="text-xs text-gray-500 mt-0.5">{log.oldValue} → {log.newValue}</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(log.createdAt)}</p>
            </div>
          </div>
        ))}
        {loaded && logs.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No activity found.</p>
        )}
        {!loaded && (
          <p className="text-sm text-gray-400 text-center py-6">Loading...</p>
        )}
      </div>
    </div>
  );
}

// ─── Settings View ─────────────────────────────────────────────────────────────

function SettingsView({
  project, canEdit, onSaved, allCategories = [], userRole,
}: {
  project: ProjectWithRelations; canEdit: boolean; onSaved: () => void; allCategories?: CategoryOption[]; userRole?: string;
}) {
  const router = useRouter();

  // Project fields
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [brand, setBrand] = useState(project.brand ?? "");
  const [retailer, setRetailer] = useState(project.retailer ?? "");
  const [channel, setChannel] = useState(project.channel ?? "");
  const [categoryId, setCategoryId] = useState(project.categoryId ?? "");
  const [targetLaunchDate, setTargetLaunchDate] = useState(
    project.targetLaunchDate ? new Date(project.targetLaunchDate).toISOString().split("T")[0] : ""
  );
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(project.tags ?? []);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState<string | null>(null);

  // Members
  const [members, setMembers] = useState(project.members ?? []);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  // Owner reassignment (admin only)
  const [reassignOwnerId, setReassignOwnerId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignMsg, setReassignMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function reassignOwner() {
    if (!reassignOwnerId) return;
    setReassigning(true);
    setReassignMsg(null);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId: reassignOwnerId }),
    });
    if (res.ok) {
      setReassignMsg({ ok: true, text: "Owner updated. Reload to see changes." });
      setReassignOwnerId("");
      onSaved();
    } else {
      const d = await res.json();
      setReassignMsg({ ok: false, text: d.error ?? "Failed to reassign owner" });
    }
    setReassigning(false);
  }

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setAllUsers(data); })
      .catch(() => {});
  }, []);

  const saveDetails = async () => {
    if (!name.trim()) return;
    setSavingDetails(true);
    setDetailsMsg(null);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        brand: brand.trim() || undefined,
        retailer: retailer.trim() || undefined,
        channel: channel.trim() || undefined,
        targetLaunchDate: targetLaunchDate || undefined,
        categoryId: categoryId || null,
        tags,
      }),
    });
    if (res.ok) {
      setDetailsMsg("Saved");
      onSaved();
    } else {
      setDetailsMsg("Save failed");
    }
    setSavingDetails(false);
  };

  const addMember = async (user: UserOption) => {
    setAddingMember(true);
    const res = await fetch(`/api/projects/${project.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, role: "VIEWER", canEdit: false, canApprove: false }),
    });
    if (res.ok) {
      const m = await res.json();
      setMembers((prev) => [...prev, m]);
      setUserSearch(""); setShowUserSearch(false);
    }
    setAddingMember(false);
  };

  const removeMember = async (userId: string) => {
    const res = await fetch(`/api/projects/${project.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) setMembers((prev) => prev.filter((m) => m.user.id !== userId));
  };

  const updateMember = async (userId: string, patch: { role?: string; canEdit?: boolean; canApprove?: boolean }) => {
    const res = await fetch(`/api/projects/${project.id}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...patch }),
    });
    if (res.ok) {
      const updated = await res.json();
      setMembers((prev) => prev.map((m) => m.user.id === userId ? updated : m));
    }
  };

  const archiveProject = async () => {
    if (!confirm("Archive this project? It will be hidden from the projects list.")) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (res.ok) router.push("/projects");
  };

  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Manual status override (Admin / Product Manager)
  const [statusOverride, setStatusOverride] = useState(project.status);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const saveStatus = async () => {
    if (statusOverride === project.status) return;
    setSavingStatus(true);
    setStatusMsg(null);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusOverride }),
    });
    if (res.ok) {
      setStatusMsg({ ok: true, text: "Status updated." });
      onSaved();
    } else {
      const d = await res.json();
      setStatusMsg({ ok: false, text: d.error ?? "Failed to update status" });
    }
    setSavingStatus(false);
  };

  const deleteProject = async () => {
    if (deleteConfirmText !== project.name) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/projects/${project.id}?hard=true`, { method: "DELETE" });
    if (res.ok) {
      router.push("/projects");
    } else {
      const d = await res.json();
      setDeleteError(d.error ?? "Delete failed");
      setDeleting(false);
    }
  };

  const memberIds = new Set([project.owner.id, ...members.map((m) => m.user.id)]);
  const filteredUsers = allUsers.filter(
    (u) => !memberIds.has(u.id) &&
      (u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
       u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-2xl space-y-8 overflow-auto h-full">
      {/* Project Details */}
      {canEdit && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Project Details</h2>
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Project Name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Description</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional project description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Brand</label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Spyder" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Retailer</label>
                <Input value={retailer} onChange={(e) => setRetailer(e.target.value)} placeholder="e.g. Home Depot" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Channel</label>
                <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="e.g. Retail, eComm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Target Launch Date</label>
                <Input type="date" value={targetLaunchDate} onChange={(e) => setTargetLaunchDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Product Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— No category —</option>
                {allCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                    {tag}
                    <button onClick={() => setTags((prev) => prev.filter((t) => t !== tag))} className="opacity-50 hover:opacity-100">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag and press Enter"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagInput.trim()) {
                      setTags((prev) => prev.includes(tagInput.trim()) ? prev : [...prev, tagInput.trim()]);
                      setTagInput("");
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveDetails} disabled={!name.trim() || savingDetails}>
                {savingDetails ? "Saving…" : "Save Changes"}
              </Button>
              {detailsMsg && (
                <span className={`text-xs ${detailsMsg === "Saved" ? "text-green-600" : "text-red-500"}`}>{detailsMsg}</span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Members */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Team Members</h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Owner row */}
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b border-gray-100">
            <div className="h-8 w-8 rounded-full bg-blue-200 text-blue-800 text-sm flex items-center justify-center font-bold shrink-0">
              {project.owner.name?.[0] ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{project.owner.name}</p>
              <p className="text-xs text-gray-500">{project.owner.email}</p>
            </div>
            <Badge variant="default">Owner</Badge>
          </div>

          {/* Reassign owner — admin only */}
          {userRole === "ADMIN" && (
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
              <p className="text-xs font-medium text-gray-500">Reassign project owner</p>
              <div className="flex items-center gap-2">
                <select
                  value={reassignOwnerId}
                  onChange={(e) => setReassignOwnerId(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-md px-2.5 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select new owner…</option>
                  {allUsers.filter((u) => u.id !== project.owner.id).map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email} ({u.role.replace("_", " ")})</option>
                  ))}
                </select>
                <button
                  onClick={reassignOwner}
                  disabled={!reassignOwnerId || reassigning}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reassigning ? "Saving…" : "Reassign"}
                </button>
              </div>
              {reassignMsg && (
                <p className={`text-xs ${reassignMsg.ok ? "text-green-600" : "text-red-500"}`}>{reassignMsg.text}</p>
              )}
            </div>
          )}

          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
              <div className="h-8 w-8 rounded-full bg-gray-100 text-gray-700 text-sm flex items-center justify-center font-bold shrink-0">
                {member.user.name?.[0] ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{member.user.name}</p>
                <p className="text-xs text-gray-500">{member.user.email}</p>
              </div>
              {canEdit ? (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={member.role}
                    onChange={(e) => updateMember(member.user.id, { role: e.target.value })}
                    className="text-xs text-gray-900 border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    {["VIEWER","CONTRIBUTOR","REVIEWER","APPROVER","PRODUCT_MANAGER"].map((r) => (
                      <option key={r} value={r}>{r.replace("_", " ")}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={member.canEdit}
                      onChange={(e) => updateMember(member.user.id, { canEdit: e.target.checked })}
                      className="h-3.5 w-3.5 rounded"
                    />
                    Edit
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={member.canApprove}
                      onChange={(e) => updateMember(member.user.id, { canApprove: e.target.checked })}
                      className="h-3.5 w-3.5 rounded"
                    />
                    Approve
                  </label>
                  <button
                    onClick={() => removeMember(member.user.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1.5 shrink-0">
                  <Badge variant="secondary">{member.role.replace("_", " ")}</Badge>
                  {member.canEdit && <Badge variant="outline">Edit</Badge>}
                  {member.canApprove && <Badge variant="outline">Approve</Badge>}
                </div>
              )}
            </div>
          ))}

          {canEdit && (
            <div className="px-4 py-3 border-t border-gray-100">
              {showUserSearch ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Search by name or email…"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    autoFocus
                  />
                  {userSearch.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                      {filteredUsers.length === 0 ? (
                        <p className="text-xs text-gray-400 p-3">No users found.</p>
                      ) : (
                        filteredUsers.map((u) => (
                          <button
                            key={u.id}
                            disabled={addingMember}
                            onClick={() => addMember(u)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-colors text-left"
                          >
                            <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 text-xs flex items-center justify-center font-bold shrink-0">
                              {u.name?.[0] ?? "?"}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{u.name ?? u.email}</p>
                              <p className="text-xs text-gray-400">{u.email} · {u.role.replace("_", " ")}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { setShowUserSearch(false); setUserSearch(""); }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setShowUserSearch(true)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Member
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Status Override */}
      {(userRole === "ADMIN" || userRole === "PRODUCT_MANAGER") && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Project Status</h2>
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <p className="text-xs text-gray-500">Manually set the project status at any time. This overrides any workflow-driven status changes.</p>
            <div className="flex items-center gap-3">
              <select
                value={statusOverride}
                onChange={(e) => { setStatusOverride(e.target.value as typeof statusOverride); setStatusMsg(null); }}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="DRAFT">Draft</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="NEEDS_REVIEW">Needs Review</option>
                <option value="CHANGES_REQUESTED">Changes Requested</option>
                <option value="APPROVED">Approved</option>
                <option value="EXPORT_READY">Export Ready</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <Button
                size="sm"
                onClick={saveStatus}
                disabled={savingStatus || statusOverride === project.status}
              >
                {savingStatus ? "Saving…" : "Save Status"}
              </Button>
              {statusMsg && (
                <span className={`text-xs ${statusMsg.ok ? "text-green-600" : "text-red-600"}`}>
                  {statusMsg.text}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Danger Zone */}
      {canEdit && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide">Danger Zone</h2>
          <div className="bg-white border border-red-200 rounded-lg divide-y divide-red-100">
            <div className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-medium text-gray-900">Archive Project</p>
                <p className="text-xs text-gray-500 mt-0.5">Hide this project from the projects list. Can be restored by an admin.</p>
              </div>
              <Button variant="destructive" size="sm" onClick={archiveProject}>
                Archive
              </Button>
            </div>

            {userRole === "ADMIN" && (
              <div className="p-5 space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Delete Project</p>
                  <p className="text-xs text-gray-500 mt-0.5">Permanently delete this project and all its products, attributes, and history. <span className="font-semibold text-red-600">This cannot be undone.</span></p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600">Type <span className="font-mono font-semibold text-gray-800">{project.name}</span> to confirm:</p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteError(null); }}
                    placeholder={project.name}
                    className="text-sm max-w-sm"
                  />
                  {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteConfirmText !== project.name || deleting}
                    onClick={deleteProject}
                  >
                    {deleting ? "Deleting…" : "Permanently Delete"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

    </div>
  );
}

// ─── Members View ──────────────────────────────────────────────────────────────

function MembersView({ project }: { project: ProjectWithRelations; canEdit: boolean }) {
  return (
    <div className="p-6 max-w-xl">
      <div className="space-y-2">
        {/* Owner */}
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <div className="h-9 w-9 rounded-full bg-blue-200 text-blue-800 text-sm flex items-center justify-center font-bold">
            {project.owner.name?.[0] ?? "?"}
          </div>
          <div>
            <p className="font-medium text-gray-900">{project.owner.name}</p>
            <p className="text-xs text-gray-500">{project.owner.email}</p>
          </div>
          <Badge className="ml-auto" variant="default">Owner</Badge>
        </div>

        {project.members.map((member) => (
          <div key={member.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
            <div className="h-9 w-9 rounded-full bg-gray-100 text-gray-700 text-sm flex items-center justify-center font-bold">
              {member.user.name?.[0] ?? "?"}
            </div>
            <div>
              <p className="font-medium text-gray-900">{member.user.name}</p>
              <p className="text-xs text-gray-500">{member.user.email}</p>
            </div>
            <div className="ml-auto flex gap-2">
              <Badge variant="secondary">{member.role}</Badge>
              {member.canEdit && <Badge variant="outline">Can Edit</Badge>}
              {member.canApprove && <Badge variant="outline">Can Approve</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Project Compliance View ───────────────────────────────────────────────────

type ComplianceEvent = {
  id: string; title: string; status: string; severity: string | null;
  dueDate: string | null; createdAt: string;
  type: { name: string; color: string };
  createdBy: { name: string | null; email: string };
  products: { product: { id: string; partNumber: string; itemName: string | null } }[];
};

function ProjectComplianceView({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/compliance/events?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => { setEvents(d.events ?? []); setTotal(d.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const severityColor: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700",
    HIGH: "bg-orange-100 text-orange-700",
    MEDIUM: "bg-yellow-100 text-yellow-700",
    LOW: "bg-gray-100 text-gray-600",
  };
  const statusColor: Record<string, string> = {
    OPEN: "bg-red-100 text-red-700",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    RESOLVED: "bg-green-100 text-green-700",
    CLOSED: "bg-gray-100 text-gray-600",
    WAIVED: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-gray-700">{total} compliance event{total !== 1 ? "s" : ""}</p>
          <p className="text-xs text-gray-400 mt-0.5">Regulatory and compliance issues linked to products in this project.</p>
        </div>
        <Link href="/compliance" className="text-xs text-blue-600 hover:underline">Manage in Compliance module →</Link>
      </div>
      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {!loading && events.length === 0 && (
        <p className="text-sm text-gray-400">No compliance events linked to products in this project.</p>
      )}
      <div className="space-y-2">
        {events.map((ev) => (
          <div key={ev.id} className="border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="mt-1 h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ev.type.color ?? "#6b7280" }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">{ev.title}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600">{ev.type.name}</span>
                  {ev.severity && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${severityColor[ev.severity] ?? "bg-gray-100 text-gray-600"}`}>{ev.severity}</span>}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusColor[ev.status] ?? "bg-gray-100 text-gray-600"}`}>{ev.status.replace("_", " ")}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {ev.products.length} product{ev.products.length !== 1 ? "s" : ""}
                  {ev.dueDate && ` · Due ${formatDate(new Date(ev.dueDate))}`}
                  {` · by ${ev.createdBy.name ?? ev.createdBy.email}`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Project Inspections View ──────────────────────────────────────────────────

type PsirRow = {
  id: string; title: string; referenceNumber: string | null;
  inspectionDate: string | null; inspector: string | null;
  result: string; status: string;
  products: { product: { id: string; partNumber: string; itemName: string | null } }[];
};

function ProjectInspectionsView({ projectId }: { projectId: string }) {
  const [psirs, setPsirs] = useState<PsirRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/psir?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => { setPsirs(d.psirs ?? []); setTotal(d.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const resultColor: Record<string, string> = {
    PASS: "bg-green-100 text-green-700",
    FAIL: "bg-red-100 text-red-700",
    CONDITIONAL: "bg-yellow-100 text-yellow-700",
    PENDING: "bg-gray-100 text-gray-600",
  };
  const statusColor: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-600",
    SUBMITTED: "bg-blue-100 text-blue-700",
    APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-gray-700">{total} inspection report{total !== 1 ? "s" : ""}</p>
          <p className="text-xs text-gray-400 mt-0.5">Pre-shipment inspection reports linked to products in this project.</p>
        </div>
        <Link href="/psir" className="text-xs text-blue-600 hover:underline">Manage in Inspections module →</Link>
      </div>
      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {!loading && psirs.length === 0 && (
        <p className="text-sm text-gray-400">No inspection reports linked to products in this project.</p>
      )}
      <div className="space-y-2">
        {psirs.map((psir) => (
          <Link key={psir.id} href={`/psir/${psir.id}`} className="block border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">{psir.title}</p>
                  {psir.referenceNumber && <span className="text-xs text-gray-400">#{psir.referenceNumber}</span>}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${resultColor[psir.result] ?? "bg-gray-100 text-gray-600"}`}>{psir.result}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusColor[psir.status] ?? "bg-gray-100 text-gray-600"}`}>{psir.status}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {psir.products.length} product{psir.products.length !== 1 ? "s" : ""}
                  {psir.inspector && ` · ${psir.inspector}`}
                  {psir.inspectionDate && ` · ${formatDate(new Date(psir.inspectionDate))}`}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
