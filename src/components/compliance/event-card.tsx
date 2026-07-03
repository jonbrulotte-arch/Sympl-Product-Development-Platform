"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, Clock, Circle, ExternalLink,
  Trash2, Pencil, ChevronDown, ChevronUp, Paperclip, FileText,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ComplianceProductRef = {
  id: string; partNumber: string | null; itemName: string | null;
  project: { id: string; name: string };
};

export type ComplianceDoc = {
  id: string; originalName: string; fileType: string | null; fileSize: number | null; filePath: string;
};

export type ComplianceEventCardData = {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: string;
  severity: string;
  dueDate: string | null;
  createdAt: string;
  type: { name: string; color: string };
  createdBy: { name: string | null; email: string };
  products: { product: ComplianceProductRef }[];
  documents: ComplianceDoc[];
};

// ─── Shared style constants ──────────────────────────────────────────────────

export const COMPLIANCE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "WAIVED"];

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

const STATUS_ICON: Record<string, React.ReactNode> = {
  OPEN: <Circle className="h-3.5 w-3.5" />,
  IN_PROGRESS: <Clock className="h-3.5 w-3.5" />,
  RESOLVED: <CheckCircle2 className="h-3.5 w-3.5" />,
  CLOSED: <CheckCircle2 className="h-3.5 w-3.5" />,
  WAIVED: <AlertTriangle className="h-3.5 w-3.5" />,
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

// ─── Card ────────────────────────────────────────────────────────────────────

// Expandable compliance-event block. Shared by the Compliance module and the
// project Compliance tab. Action handlers are optional so the same card can be
// used read-only (e.g. a viewer) or fully interactive.
export function EventCard({
  event,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  event: ComplianceEventCardData;
  onEdit?: () => void;
  onDelete?: () => void;
  onStatusChange?: (status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOverdue = event.dueDate && event.status === "OPEN" && new Date(event.dueDate) < new Date();

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: event.type.color }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
              <p className="text-xs text-gray-500">{event.type.name}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${SEVERITY_STYLES[event.severity] ?? ""}`}>
                {event.severity}
              </span>
              <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[event.status] ?? ""}`}>
                {STATUS_ICON[event.status]}
                {event.status.replace("_", " ")}
              </span>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-4 text-xs text-gray-400 flex-wrap">
            <span>{event.products.length} product{event.products.length !== 1 ? "s" : ""}</span>
            {event.documents.length > 0 && (
              <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{event.documents.length}</span>
            )}
            {event.dueDate && (
              <span className={isOverdue ? "text-red-500 font-medium" : ""}>
                Due {formatDate(event.dueDate)}
                {isOverdue && " (overdue)"}
              </span>
            )}
            <span>Created {formatDate(event.createdAt)}</span>
            <span>by {event.createdBy.name ?? event.createdBy.email}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setExpanded((x) => !x)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {onEdit && (
            <button onClick={onEdit} className="p-1.5 rounded hover:bg-gray-100 text-gray-400" title="Open">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 text-red-400" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
          {event.description && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
          {event.notes && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.notes}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Affected Products</p>
            <div className="space-y-1">
              {event.products.map(({ product }) => (
                <div key={product.id} className="flex items-center justify-between text-xs bg-white border border-gray-100 rounded px-2 py-1.5">
                  <span>
                    <span className="font-mono text-gray-500">{product.partNumber ?? "—"}</span>
                    {" "}<span className="text-gray-700">{product.itemName ?? ""}</span>
                  </span>
                  <a href={`/projects/${product.project.id}`} className="text-indigo-600 hover:underline flex items-center gap-1" target="_blank" rel="noreferrer">
                    {product.project.name} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>

          {event.documents.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Attachments</p>
              <div className="space-y-1">
                {event.documents.map((d) => (
                  <a key={d.id} href={`/${d.filePath}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-xs bg-white border border-gray-100 rounded px-2 py-1.5 hover:bg-indigo-50 group">
                    {isImageFile(d.originalName) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/${d.filePath}`} alt="" className="h-9 w-9 object-cover rounded shrink-0 border border-gray-200" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    )}
                    <span className="text-indigo-600 group-hover:underline truncate flex-1">{d.originalName}</span>
                    {d.fileSize && <span className="text-gray-400 shrink-0">{formatBytes(d.fileSize)}</span>}
                    <ExternalLink className="h-3 w-3 text-gray-300 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {onStatusChange && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Change status:</span>
              {COMPLIANCE_STATUSES.filter((s) => s !== event.status).map((s) => (
                <button key={s} onClick={() => onStatusChange(s)}
                  className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-100 text-gray-600">
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
