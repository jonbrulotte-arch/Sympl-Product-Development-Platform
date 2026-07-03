"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import {
  ChevronUp, ChevronDown, CheckCircle2, XCircle, Clock, AlertTriangle,
  FileText, Package, Pencil, Trash2, ExternalLink,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PsirProductRef = {
  id: string; partNumber: string | null; itemName: string | null;
  project: { id: string; name: string };
};

export type PsirDoc = { id: string; originalName: string; filePath: string; fileSize: number | null };

export type PsirCardData = {
  id: string;
  title: string;
  referenceNumber: string | null;
  inspectionDate: string | null;
  inspector: string | null;
  inspectionCompany: string | null;
  factory: string | null;
  countryOfOrigin: string | null;
  result: string;
  status: string;
  notes: string | null;
  createdAt: string;
  createdBy: { name: string | null; email: string };
  products: { product: PsirProductRef }[];
  documents: PsirDoc[];
};

// ─── Shared style constants ──────────────────────────────────────────────────

export const PSIR_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"];

const RESULT_STYLES: Record<string, { cls: string; icon: React.ReactNode }> = {
  PASS: { cls: "bg-green-100 text-green-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  FAIL: { cls: "bg-red-100 text-red-700", icon: <XCircle className="h-3.5 w-3.5" /> },
  CONDITIONAL: { cls: "bg-yellow-100 text-yellow-800", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  PENDING: { cls: "bg-gray-100 text-gray-600", icon: <Clock className="h-3.5 w-3.5" /> },
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
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

// Expandable inspection-report block. Shared by the Inspections module and the
// project Inspections tab. Action handlers are optional.
export function PsirCard({
  psir,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  psir: PsirCardData;
  onEdit?: () => void;
  onDelete?: () => void;
  onStatusChange?: (status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const resultMeta = RESULT_STYLES[psir.result] ?? RESULT_STYLES.PENDING;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-indigo-200 transition-colors">
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{psir.title}</p>
            {psir.referenceNumber && (
              <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{psir.referenceNumber}</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {psir.inspectionCompany && <span>{psir.inspectionCompany}</span>}
            {psir.factory && <span className="text-gray-400">· {psir.factory}</span>}
            {psir.inspectionDate && <span className="text-gray-400">· {formatDate(psir.inspectionDate)}</span>}
            {psir.inspector && <span className="text-gray-400">· {psir.inspector}</span>}
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-400 flex-wrap">
            <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {psir.products.length} product{psir.products.length !== 1 ? "s" : ""}</span>
            {psir.documents.length > 0 && (
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {psir.documents.length} file{psir.documents.length !== 1 ? "s" : ""}</span>
            )}
            <span>by {psir.createdBy.name ?? psir.createdBy.email} · {formatDate(psir.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${resultMeta.cls}`}>
            {resultMeta.icon} {psir.result}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[psir.status] ?? ""}`}>{psir.status}</span>
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
        <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50">
          {psir.notes && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{psir.notes}</p>
            </div>
          )}

          {psir.countryOfOrigin && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Country of Origin</p>
              <p className="text-sm text-gray-700">{psir.countryOfOrigin}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Products</p>
            <div className="space-y-1">
              {psir.products.length === 0 && (
                <p className="text-xs text-gray-400 italic">No products linked</p>
              )}
              {psir.products.map(({ product }) => (
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

          {psir.documents.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Attachments</p>
              <div className="space-y-1">
                {psir.documents.map((d) => (
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
              {PSIR_STATUSES.filter((s) => s !== psir.status).map((s) => (
                <button key={s} onClick={() => onStatusChange(s)}
                  className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-100 text-gray-600">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
