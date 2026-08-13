"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, Search, ArrowRight, Users, CheckCircle2, RefreshCw, Trash2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

type Person = { id: string; name: string | null; email: string; role: string };
type Owner = Person & { isActive: boolean; _count: { ownedProjects: number } };
type Category = { id: string; name: string; parentId: string | null };
type ProjectRow = {
  id: string;
  name: string;
  status: string;
  brand: string | null;
  isArchived: boolean;
  updatedAt: string;
  categoryId: string | null;
  owner: { id: string; name: string | null; email: string };
  category: { id: string; name: string } | null;
  _count: { products: number };
};

type Action = "transfer" | "status" | "delete";

const label = (p: { name: string | null; email: string }) => p.name ?? p.email;

export function BulkProjectsClient({ isAdmin }: { isAdmin: boolean }) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [eligible, setEligible] = useState<Person[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [fromOwner, setFromOwner] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [action, setAction] = useState<Action>("transfer");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [keepAsMember, setKeepAsMember] = useState(true);
  const [newStatus, setNewStatus] = useState("");
  const [hardDelete, setHardDelete] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fromOwner) params.set("ownerId", fromOwner);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (includeArchived) params.set("includeArchived", "true");
    try {
      const res = await fetch(`/api/admin/bulk-projects?${params}`);
      if (!res.ok) throw new Error("Could not load projects");
      const data = await res.json();
      setProjects(data.projects ?? []);
      setOwners(data.owners ?? []);
      setEligible(data.eligibleOwners ?? []);
      setCategories(data.categories ?? []);
      setStatuses(data.statuses ?? []);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, [fromOwner, categoryFilter, includeArchived]);

  useEffect(() => { load(); }, [load]);

  const visible = projects.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q)
      || (p.brand ?? "").toLowerCase().includes(q)
      || label(p.owner).toLowerCase().includes(q)
      || (p.category?.name ?? "").toLowerCase().includes(q);
  });

  // Rows that would be no-ops for the current action — skipped from the count.
  const effective = [...selected].filter((id) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return false;
    if (action === "transfer") return p.owner.id !== newOwnerId;
    if (action === "status") return p.status !== newStatus;
    return true;
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const allSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
    setSelected(allSelected ? new Set() : new Set(visible.map((p) => p.id)));
  }

  const canSubmit = (() => {
    if (selected.size === 0) return false;
    if (action === "transfer") return !!newOwnerId && effective.length > 0;
    if (action === "status") return !!newStatus && effective.length > 0;
    if (action === "delete") return true;
    return false;
  })();

  async function submit() {
    setWorking(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        action,
        projectIds: [...selected],
      };
      if (action === "transfer") {
        payload.newOwnerId = newOwnerId;
        payload.keepAsMember = keepAsMember;
      } else if (action === "status") {
        payload.status = newStatus;
      } else if (action === "delete") {
        payload.hard = hardDelete;
      }
      const res = await fetch("/api/admin/bulk-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Operation failed");
        return;
      }
      if (action === "transfer") {
        setResult(
          `Transferred ${data.transferred} project${data.transferred !== 1 ? "s" : ""} to ${label(data.newOwner)}.` +
          (data.skipped > 0 ? ` ${data.skipped} already had that owner and ${data.skipped === 1 ? "was" : "were"} skipped.` : "")
        );
        setNewOwnerId("");
      } else if (action === "status") {
        setResult(
          `Updated ${data.updated} project${data.updated !== 1 ? "s" : ""} to ${String(data.status).replace(/_/g, " ")}.` +
          (data.skipped > 0 ? ` ${data.skipped} already had that status.` : "")
        );
        setNewStatus("");
      } else if (action === "delete") {
        setResult(
          hardDelete
            ? `Permanently deleted ${data.deleted} project${data.deleted !== 1 ? "s" : ""}.`
            : `Archived ${data.archived} project${data.archived !== 1 ? "s" : ""}.`
        );
        setHardDelete(false);
      }
      setConfirmOpen(false);
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setWorking(false);
    }
  }

  const newOwner = eligible.find((e) => e.id === newOwnerId);

  const parentCategories = categories.filter((c) => !c.parentId);
  const subCategoriesByParent = categories.reduce<Record<string, Category[]>>((acc, c) => {
    if (c.parentId) (acc[c.parentId] ??= []).push(c);
    return acc;
  }, {});

  const ActionTab = ({ id, label: text, icon: Icon }: { id: Action; label: string; icon: React.ComponentType<{ className?: string }> }) => (
    <button
      onClick={() => setAction(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${
        action === id
          ? "bg-blue-50 border-blue-200 text-blue-700"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {text}
    </button>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bulk Project Actions</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Transfer ownership, change status, or archive/delete projects in bulk.
        </p>
      </div>

      {result && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">{result}</div>
          <button onClick={() => setResult(null)} className="text-xs underline">Dismiss</button>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="from-owner" className="block text-xs font-medium text-gray-700 mb-1">
              Current owner
            </label>
            <select
              id="from-owner"
              value={fromOwner}
              onChange={(e) => setFromOwner(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white min-w-64"
            >
              <option value="">All owners</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {label(o)} ({o._count.ownedProjects}){o.isActive ? "" : " — deactivated"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="category" className="block text-xs font-medium text-gray-700 mb-1">
              Product category
            </label>
            <select
              id="category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white min-w-56"
            >
              <option value="">All categories</option>
              {parentCategories.map((parent) => (
                <optgroup key={parent.id} label={parent.name}>
                  <option value={parent.id}>{parent.name} (top level)</option>
                  {(subCategoriesByParent[parent.id] ?? []).map((sub) => (
                    <option key={sub.id} value={sub.id}>&nbsp;&nbsp;{sub.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-52">
            <label htmlFor="search" className="block text-xs font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                id="search"
                className="pl-8"
                placeholder="Project, brand, owner, or category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Include archived
          </label>
        </CardContent>
      </Card>

      {/* Project list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
            </div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">No projects match.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all visible"
                      checked={visible.length > 0 && visible.every((p) => selected.has(p.id))}
                      onChange={toggleAllVisible}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600">Project</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600">Category</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600">Current owner</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600">Products</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    className={`cursor-pointer hover:bg-gray-50 ${selected.has(p.id) ? "bg-blue-50/50" : ""}`}
                    onClick={() => toggle(p.id)}
                  >
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{p.name}</p>
                      {p.brand && <p className="text-xs text-gray-500">{p.brand}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{p.category?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-700">{label(p.owner)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-600">{p.status.replace(/_/g, " ")}</span>
                        {p.isArchived && <Badge variant="secondary">Archived</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{p._count.products}</td>
                    <td className="px-4 py-2.5 text-gray-500">{formatDate(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
              <Users className="h-4 w-4 text-gray-400" />
              {selected.size} selected
            </span>
            <div className="flex items-center gap-2">
              <ActionTab id="transfer" label="Transfer" icon={ArrowRight} />
              <ActionTab id="status" label="Change status" icon={RefreshCw} />
              <ActionTab id="delete" label="Archive / delete" icon={Trash2} />
            </div>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {action === "transfer" && (
              <>
                <select
                  value={newOwnerId}
                  onChange={(e) => setNewOwnerId(e.target.value)}
                  aria-label="New owner"
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white min-w-56"
                >
                  <option value="">Choose new owner…</option>
                  {eligible.map((e) => (
                    <option key={e.id} value={e.id}>{label(e)} — {e.role.replace(/_/g, " ")}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={keepAsMember}
                    onChange={(e) => setKeepAsMember(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Keep previous owner as an editing member
                </label>
              </>
            )}

            {action === "status" && (
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                aria-label="New status"
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white min-w-56"
              >
                <option value="">Choose new status…</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            )}

            {action === "delete" && (
              <label className={`flex items-center gap-2 text-sm ${isAdmin ? "text-red-700" : "text-gray-400"}`}>
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={hardDelete}
                  onChange={(e) => setHardDelete(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                Permanently delete instead of archive
                {!isAdmin && <span className="text-xs">(admins only)</span>}
              </label>
            )}

            <div className="flex-1" />
            <Button
              size="sm"
              variant={action === "delete" ? "destructive" : "default"}
              onClick={() => setConfirmOpen(true)}
              disabled={!canSubmit}
            >
              {action === "transfer" && `Transfer ${effective.length || ""}`}
              {action === "status" && `Update ${effective.length || ""}`}
              {action === "delete" && (hardDelete ? `Delete ${selected.size}` : `Archive ${selected.size}`)}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "transfer" && "Transfer ownership?"}
              {action === "status" && "Change project status?"}
              {action === "delete" && (hardDelete ? "Permanently delete projects?" : "Archive projects?")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-gray-600">
            {action === "transfer" && (
              <>
                <p>
                  <strong>{effective.length}</strong> project{effective.length !== 1 ? "s" : ""} will be
                  reassigned to <strong>{newOwner ? label(newOwner) : ""}</strong>.
                </p>
                <p>
                  {keepAsMember
                    ? "Each previous owner stays on their project as a member with edit access."
                    : "Previous owners will lose access to these projects entirely unless they are already members."}
                </p>
              </>
            )}
            {action === "status" && (
              <>
                <p>
                  <strong>{effective.length}</strong> project{effective.length !== 1 ? "s" : ""} will be set to{" "}
                  <strong>{newStatus.replace(/_/g, " ")}</strong>.
                </p>
                {newStatus === "ARCHIVED" && (
                  <p className="text-amber-700">
                    Archived projects are hidden from the default project list.
                  </p>
                )}
              </>
            )}
            {action === "delete" && (
              <>
                <p>
                  <strong>{selected.size}</strong> project{selected.size !== 1 ? "s" : ""} will be{" "}
                  {hardDelete ? (
                    <strong className="text-red-700">permanently deleted</strong>
                  ) : (
                    <strong>archived</strong>
                  )}.
                </p>
                {hardDelete && (
                  <p className="text-red-700">
                    This removes the project and all its products, workflow stages, activity history,
                    and comments. This cannot be undone.
                  </p>
                )}
              </>
            )}
            <p className="text-xs text-gray-500">
              Every change is recorded in the activity log
              {action !== "delete" ? " and affected owners are notified" : ""}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={working}
              variant={action === "delete" && hardDelete ? "destructive" : "default"}
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {working ? "Working…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
