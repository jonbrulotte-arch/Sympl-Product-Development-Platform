"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, X, MessageCircleQuestion, CheckCheck, RotateCcw, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { categoryPaths, type CategoryOption } from "@/lib/category-paths";
import { RequestStatusBadge, type RequestStatus } from "@/components/category-requests/status-badge";
import { CategoryRequestForm } from "@/components/category-requests/request-form";

type Person = { id: string; name: string | null; email: string } | null;
type Attr = { name: string; type: string; required: boolean; values?: string; notes?: string };
type Req = {
  id: string; name: string; parentCategoryId: string | null; newParentName: string | null;
  description: string | null; note: string | null; exampleProducts: string | null;
  attributes: Attr[]; status: RequestStatus; reviewNote: string | null; reviewedAt: string | null; createdAt: string;
  requestedBy: NonNullable<Person>; reviewedBy: Person; createdCategory: { id: string; name: string } | null;
};
type HistoryRow = { id: string; action: string; newValue: string | null; createdAt: string; metadata: { note?: string } | null; user: { name: string | null; email: string } };

const who = (p: { name: string | null; email: string }) => p.name ?? p.email;

export function RequestDetailClient({
  request: r, history, categories, parentPath, isReviewer, isOwner,
}: {
  request: Req; history: HistoryRow[]; categories: CategoryOption[]; parentPath: string; isReviewer: boolean; isOwner: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [createdCategoryId, setCreatedCategoryId] = useState(r.createdCategory?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paths = useMemo(() => categoryPaths(categories), [categories]);
  const open = r.status === "PENDING" || r.status === "NEEDS_INFO";

  async function review(action: string) {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/category-requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note, createdCategoryId: createdCategoryId || undefined }),
    });
    setBusy(null);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Update failed"); return; }
    setNote("");
    router.refresh();
  }

  async function withdraw() {
    if (!confirm("Withdraw this request? It will be deleted.")) return;
    const res = await fetch(`/api/category-requests/${r.id}`, { method: "DELETE" });
    if (res.ok) router.push("/category-requests?tab=mine");
    else setError((await res.json().catch(() => ({}))).error ?? "Could not withdraw");
  }

  if (editing) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit Category Request</h1>
        <CategoryRequestForm categories={categories} requestId={r.id} initial={{ ...r, attributes: r.attributes }} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/category-requests" className="mt-1.5 text-gray-400 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{r.name}</h1>
              <RequestStatusBadge status={r.status} />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {parentPath ? `${parentPath} > ${r.name}` : "New top-level category"} · requested by {who(r.requestedBy)} · {formatDateTime(r.createdAt)}
            </p>
          </div>
        </div>
        {isOwner && open && (
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-1" /> {r.status === "NEEDS_INFO" ? "Edit & Resubmit" : "Edit"}</Button>
            <Button variant="outline" size="sm" onClick={withdraw}><Trash2 className="h-4 w-4 mr-1" /> Withdraw</Button>
          </div>
        )}
      </div>

      {r.reviewNote && r.status !== "PENDING" && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${r.status === "REJECTED" ? "bg-red-50 border-red-200 text-red-700" : r.status === "NEEDS_INFO" ? "bg-purple-50 border-purple-200 text-purple-800" : "bg-green-50 border-green-200 text-green-800"}`}>
          <span className="font-semibold">{r.reviewedBy ? who(r.reviewedBy) : "Reviewer"}:</span> {r.reviewNote}
        </div>
      )}
      {r.createdCategory && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Created as category <Link href="/admin/categories" className="font-semibold underline">{paths.find((p) => p.id === r.createdCategory!.id)?.label ?? r.createdCategory.name}</Link>.
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6 grid gap-4 md:grid-cols-2">
        {[
          ["Description", r.description],
          ["Example products", r.exampleProducts],
          ["Note from requester", r.note],
        ].map(([k, v]) => (
          <div key={k} className={k === "Note from requester" ? "md:col-span-2" : ""}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{k}</p>
            <p className="text-sm text-gray-900 whitespace-pre-line">{v || <span className="text-gray-400">—</span>}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Required Attributes</h2>
          <Badge variant="secondary">{r.attributes.length}</Badge>
        </div>
        {r.attributes.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No attributes listed.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>{["Attribute", "Type", "Required", "Allowed values", "Notes"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>)}</tr>
            </thead>
            <tbody>
              {r.attributes.map((a, i) => (
                <tr key={i} className="border-t border-gray-200 align-top">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-3 text-gray-700">{a.type}</td>
                  <td className="px-4 py-3">{a.required ? <Badge variant="default">Required</Badge> : <span className="text-gray-400">Optional</span>}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-pre-line">{a.values ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-pre-line">{a.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isReviewer && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6 space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Review</h2>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the requester (required for Needs Info and Reject)" />
          {(r.status === "APPROVED" || r.status === "COMPLETED") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category created for this request</label>
              <select value={createdCategoryId} onChange={(e) => setCreatedCategoryId(e.target.value)} className="h-9 w-full md:w-96 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900">
                <option value="">— choose after creating it in Admin › Categories —</option>
                {paths.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="flex flex-wrap gap-2">
            {open && <Button onClick={() => review("approve")} disabled={!!busy}><Check className="h-4 w-4 mr-1" /> {busy === "approve" ? "Approving…" : "Approve"}</Button>}
            {open && <Button variant="outline" onClick={() => review("needs_info")} disabled={!!busy}><MessageCircleQuestion className="h-4 w-4 mr-1" /> Needs Info</Button>}
            {open && <Button variant="destructive" onClick={() => review("reject")} disabled={!!busy}><X className="h-4 w-4 mr-1" /> Reject</Button>}
            {r.status === "APPROVED" && <Button onClick={() => review("complete")} disabled={!!busy}><CheckCheck className="h-4 w-4 mr-1" /> Mark Completed</Button>}
            {r.status === "APPROVED" && <Link href="/admin/categories"><Button variant="outline">Open Categories</Button></Link>}
            {r.status === "COMPLETED" && <Button variant="outline" onClick={() => review("complete")} disabled={!!busy}>Update linked category</Button>}
            {(r.status === "REJECTED" || r.status === "APPROVED") && <Button variant="ghost" onClick={() => review("reopen")} disabled={!!busy}><RotateCcw className="h-4 w-4 mr-1" /> Reopen</Button>}
          </div>
        </div>
      )}
      {!isReviewer && error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">History</h2>
        <ol className="space-y-3">
          {history.map((h) => (
            <li key={h.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
              <div>
                <p className="text-gray-900"><span className="font-medium">{who(h.user)}</span> {h.action === "SUBMITTED" && h.newValue !== "Resubmitted" ? "submitted the request" : h.newValue === "Resubmitted" ? "resubmitted the request" : h.newValue === "Edited" ? "edited the request" : `set status to ${h.newValue}`}</p>
                {h.metadata?.note && <p className="text-gray-600">“{h.metadata.note}”</p>}
                <p className="text-xs text-gray-400">{formatDateTime(h.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
