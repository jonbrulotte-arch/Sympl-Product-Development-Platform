"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { ProductGrid } from "@/components/grid/product-grid";
import { formatDate } from "@/lib/utils";
import {
  Package, Calendar, Edit2, Download, ArrowLeft, Users,
  MessageSquare, Clock, CheckCircle, Settings
} from "lucide-react";
import type { ProjectWithRelations, ProductWithAttributes } from "@/types";
import Link from "next/link";

interface Props {
  project: ProjectWithRelations;
  initialProducts: ProductWithAttributes[];
  canEdit: boolean;
  currentUserId: string;
}

export function ProjectDetailClient({ project, initialProducts, canEdit }: Props) {
  const [activeTab, setActiveTab] = useState("grid");
  const router = useRouter();

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
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
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
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            {canEdit && (
              <Link href={`/projects/${project.id}/settings`}>
                <Button size="sm" variant="outline">
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex gap-0 -mb-px">
          {[
            { id: "grid", label: "Products", icon: Package },
            { id: "workflow", label: "Workflow", icon: CheckCircle },
            { id: "comments", label: "Comments", icon: MessageSquare },
            { id: "activity", label: "Activity", icon: Clock },
            { id: "members", label: "Members", icon: Users },
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
      <div className="flex-1 overflow-hidden">
        {activeTab === "grid" && (
          <ProductGrid
            projectId={project.id}
            initialProducts={initialProducts as never}
            canEdit={canEdit}
            onExport={handleExport}
            onImport={() => router.push(`/import?projectId=${project.id}`)}
          />
        )}

        {activeTab === "workflow" && (
          <WorkflowView project={project} canEdit={canEdit} />
        )}

        {activeTab === "comments" && (
          <CommentsView projectId={project.id} />
        )}

        {activeTab === "activity" && (
          <ActivityView projectId={project.id} />
        )}

        {activeTab === "members" && (
          <MembersView project={project} canEdit={canEdit} />
        )}
      </div>
    </div>
  );
}

// ─── Workflow View ─────────────────────────────────────────────────────────────

function WorkflowView({ project, canEdit }: { project: ProjectWithRelations; canEdit: boolean }) {
  const stages = project.workflowStages ?? [];

  if (stages.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        <CheckCircle className="h-10 w-10 mx-auto mb-3 text-gray-300" />
        <p className="text-sm">No workflow stages configured for this project.</p>
        {canEdit && (
          <p className="text-xs mt-1">Go to Admin &gt; Workflow to configure approval templates.</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="space-y-4">
        {stages.map((stage, idx) => (
          <div key={stage.id} className="flex items-start gap-4">
            <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
              stage.status === "APPROVED" ? "bg-green-100 text-green-700" :
              stage.status === "IN_REVIEW" ? "bg-blue-100 text-blue-700" :
              stage.status === "REJECTED" ? "bg-red-100 text-red-700" :
              "bg-gray-100 text-gray-500"
            }`}>
              {idx + 1}
            </div>
            <div className="flex-1 bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">{stage.name}</h3>
                <Badge variant={
                  stage.status === "APPROVED" ? "success" :
                  stage.status === "IN_REVIEW" ? "default" :
                  stage.status === "REJECTED" ? "destructive" : "secondary"
                }>
                  {stage.status.replace("_", " ")}
                </Badge>
              </div>
              {stage.description && (
                <p className="text-sm text-gray-500 mt-1">{stage.description}</p>
              )}
              {stage.completedAt && (
                <p className="text-xs text-gray-400 mt-2">Completed: {formatDate(stage.completedAt)}</p>
              )}
              {stage.approvals.length > 0 && (
                <div className="mt-3 space-y-2">
                  {stage.approvals.map((approval) => (
                    <div key={approval.id} className="flex items-center gap-2 text-sm">
                      <div className="h-5 w-5 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-medium">
                        {approval.approver.name?.[0] ?? "?"}
                      </div>
                      <span className="text-gray-700">{approval.approver.name}</span>
                      <Badge variant={approval.status === "APPROVED" ? "success" : "secondary"}>
                        {approval.status}
                      </Badge>
                      {approval.comments && (
                        <span className="text-gray-500 italic">&quot;{approval.comments}&quot;</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Comments View ─────────────────────────────────────────────────────────────

function CommentsView({ projectId }: { projectId: string }) {
  const [comments, setComments] = useState<Array<{
    id: string; content: string; createdAt: string;
    author: { name: string | null; email: string };
    replies: Array<{ id: string; content: string; createdAt: string; author: { name: string | null; email: string } }>;
  }>>([]);
  const [newComment, setNewComment] = useState("");
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    fetch(`/api/projects/${projectId}/comments`)
      .then((r) => r.json())
      .then((data) => { setComments(data); setLoaded(true); });
  }

  const postComment = async () => {
    if (!newComment.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newComment }),
    });
    if (res.ok) {
      const comment = await res.json();
      setComments((prev) => [comment, ...prev]);
      setNewComment("");
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div className="flex gap-3">
        <textarea
          className="flex-1 border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <Button onClick={postComment} disabled={!newComment.trim()}>Post</Button>
      </div>

      <div className="space-y-4">
        {comments.map((comment) => (
          <div key={comment.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">
                {comment.author.name?.[0] ?? "?"}
              </div>
              <span className="text-sm font-medium">{comment.author.name ?? comment.author.email}</span>
              <span className="text-xs text-gray-400">{formatDate(comment.createdAt)}</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Activity View ─────────────────────────────────────────────────────────────

function ActivityView({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<Array<{
    id: string; action: string; entityType: string; fieldKey: string | null;
    oldValue: string | null; newValue: string | null; createdAt: string;
    user: { name: string | null };
  }>>([]);
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    fetch(`/api/projects/${projectId}/activity`)
      .then((r) => r.json())
      .then((data) => { setLogs(data.data ?? []); setLoaded(true); });
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
            <Clock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-gray-700">
                <span className="font-medium">{log.user.name}</span>{" "}
                {log.action.toLowerCase().replace("_", " ")}{" "}
                <span className="font-medium">{log.entityType}</span>
                {log.fieldKey && <span className="text-gray-500"> · {log.fieldKey}</span>}
              </p>
              {log.oldValue && log.newValue && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {log.oldValue} → {log.newValue}
                </p>
              )}
              <p className="text-xs text-gray-400">{formatDate(log.createdAt)}</p>
            </div>
          </div>
        ))}
        {loaded && logs.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No activity yet.</p>
        )}
      </div>
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
