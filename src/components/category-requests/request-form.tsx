"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { categoryPaths, type CategoryOption } from "@/lib/category-paths";

export const ATTR_TYPES = ["Text", "Long text", "Number", "Decimal", "Yes/No", "Date", "List", "Multi-select", "URL", "UPC / GTIN"] as const;
type Row = { name: string; type: string; required: boolean; values: string; notes: string };
const blankRow = (): Row => ({ name: "", type: "Text", required: false, values: "", notes: "" });

export type RequestFormValues = {
  name: string;
  parentCategoryId: string | null;
  newParentName: string | null;
  description: string | null;
  note: string | null;
  exampleProducts: string | null;
  attributes: Partial<Row>[];
};

const NEW_PARENT = "__new__";
const TOP_LEVEL = "";
const label = "block text-sm font-medium text-gray-700 mb-1.5";

export function CategoryRequestForm({
  categories, initial, requestId,
}: {
  categories: CategoryOption[];
  initial?: RequestFormValues;
  /** When set, the form edits (and resubmits) this request. */
  requestId?: string;
}) {
  const router = useRouter();
  const paths = useMemo(() => categoryPaths(categories), [categories]);
  const [name, setName] = useState(initial?.name ?? "");
  const [parent, setParent] = useState(initial?.newParentName ? NEW_PARENT : initial?.parentCategoryId ?? TOP_LEVEL);
  const [newParentUnder, setNewParentUnder] = useState(initial?.newParentName ? initial.parentCategoryId ?? TOP_LEVEL : TOP_LEVEL);
  const [newParentName, setNewParentName] = useState(initial?.newParentName ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [examples, setExamples] = useState(initial?.exampleProducts ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.attributes?.length ? initial.attributes.map((r) => ({ ...blankRow(), ...r, values: r.values ?? "", notes: r.notes ?? "" })) : [blankRow(), blankRow(), blankRow()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const parentLabel = parent === NEW_PARENT
    ? [paths.find((p) => p.id === newParentUnder)?.label, newParentName || "(new parent)"].filter(Boolean).join(" > ")
    : paths.find((p) => p.id === parent)?.label ?? "";

  async function submit() {
    setSaving(true);
    setError(null);
    const body = {
      name,
      parentCategoryId: parent === NEW_PARENT ? newParentUnder || null : parent || null,
      newParentName: parent === NEW_PARENT ? newParentName : null,
      description, note, exampleProducts: examples,
      attributes: rows,
    };
    const res = await fetch(requestId ? `/api/category-requests/${requestId}` : "/api/category-requests", {
      method: requestId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Could not submit the request"); return; }
    router.push(`/category-requests/${data.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Category</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={label}>Where should it go?</label>
            <select value={parent} onChange={(e) => setParent(e.target.value)} className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value={TOP_LEVEL}>— Top level (new Category) —</option>
              {paths.map((p) => <option key={p.id} value={p.id}>{"   ".repeat(p.depth)}{p.depth ? "↳ " : ""}{p.label.split(" > ").pop()}</option>)}
              <option value={NEW_PARENT}>+ Under a new parent category…</option>
            </select>
          </div>
          <div>
            <label className={label}>Requested category name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Framing Blades" />
          </div>
          {parent === NEW_PARENT && (
            <>
              <div>
                <label className={label}>New parent goes under</label>
                <select value={newParentUnder} onChange={(e) => setNewParentUnder(e.target.value)} className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value={TOP_LEVEL}>— Top level —</option>
                  {paths.map((p) => <option key={p.id} value={p.id}>{"   ".repeat(p.depth)}{p.depth ? "↳ " : ""}{p.label.split(" > ").pop()}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>New parent category name</label>
                <Input value={newParentName} onChange={(e) => setNewParentName(e.target.value)} placeholder="e.g. Circular Saw Blades" />
              </div>
            </>
          )}
        </div>
        {name.trim() && (
          <p className="text-sm text-gray-500">Will be: <span className="font-medium text-gray-900">{parentLabel ? `${parentLabel} > ` : ""}{name.trim()}</span></p>
        )}
        <div>
          <label className={label}>Description <span className="text-gray-400 font-normal">(what products belong here)</span></label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className={label}>Example products <span className="text-gray-400 font-normal">(optional — part numbers or links)</span></label>
          <Textarea rows={2} value={examples} onChange={(e) => setExamples(e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Required Attributes</h2>
            <p className="text-sm text-gray-500">The fields products in this category need. Blank rows are ignored.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setRows([...rows, blankRow()])}><Plus className="h-4 w-4 mr-1" /> Add attribute</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Attribute name", "Type", "Required", "Allowed values", "Notes", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-200 align-top">
                  <td className="px-3 py-2 min-w-48"><Input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="e.g. Tooth Count" /></td>
                  <td className="px-3 py-2 min-w-36">
                    <select value={r.type} onChange={(e) => setRow(i, { type: e.target.value })} className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900">
                      {ATTR_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" className="mt-2.5 h-4 w-4" checked={r.required} onChange={(e) => setRow(i, { required: e.target.checked })} /></td>
                  <td className="px-3 py-2 min-w-48">
                    {r.type === "List" || r.type === "Multi-select"
                      ? <Input value={r.values} onChange={(e) => setRow(i, { values: e.target.value })} placeholder="Comma-separated" />
                      : <span className="block pt-2 text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 min-w-56"><Input value={r.notes} onChange={(e) => setRow(i, { notes: e.target.value })} placeholder="Units, format, source…" /></td>
                  <td className="px-2 py-2">
                    <button type="button" title="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="mt-1 p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-gray-100"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6 space-y-3">
        <label className={label}>Note for the reviewers</label>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it's needed, timing, project it's for…" />
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !name.trim() || (parent === NEW_PARENT && !newParentName.trim())}>
            {saving ? "Submitting…" : requestId ? "Save & Resubmit" : "Submit Request"}
          </Button>
        </div>
      </div>
    </div>
  );
}
