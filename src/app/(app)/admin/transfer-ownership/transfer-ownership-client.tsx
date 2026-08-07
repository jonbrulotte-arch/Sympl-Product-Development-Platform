"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Search, ArrowRight, Users, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

type Person = { id: string; name: string | null; email: string; role: string };
type Owner = Person & { isActive: boolean; _count: { ownedProjects: number } };
type ProjectRow = {
  id: string;
  name: string;
  status: string;
  brand: string | null;
  isArchived: boolean;
  updatedAt: string;
  owner: { id: string; name: string | null; email: string };
  _count: { products: number };
};

const label = (p: { name: string | null; email: string }) => p.name ?? p.email;

export function TransferOwnershipClient() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [eligible, setEligible] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  const [fromOwner, setFromOwner] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [newOwnerId, setNewOwnerId] = useState("");
  const [keepAsMember, setKeepAsMember] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fromOwner) params.set("ownerId", fromOwner);
    if (includeArchived) params.set("includeArchived", "true");
    try {
      const res = await fetch(`/api/admin/transfer-ownership?${params}`);
      if (!res.ok) throw new Error("Could not load projects");
      const data = await res.json();
      setProjects(data.projects ?? []);
      setOwners(data.owners ?? []);
      setEligible(data.eligibleOwners ?? []);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, [fromOwner, includeArchived]);

  useEffect(() => { load(); }, [load]);

  const visible = projects.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q)
      || (p.brand ?? "").toLowerCase().includes(q)
      || label(p.owner).toLowerCase().includes(q);
  });

  // Projects already owned by the target are no-ops; don't count them as work.
  const effective = [...selected].filter((id) => {
    const p = projects.find((x) => x.id === id);
    return p && p.owner.id !== newOwnerId;
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

  async function transfer() {
    setTransferring(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/transfer-ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds: [...selected], newOwnerId, keepAsMember }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Transfer failed");
        return;
      }
      setResult(
        `Transferred ${data.transferred} project${data.transferred !== 1 ? "s" : ""} to ${label(data.newOwner)}.` +
        (data.skipped > 0 ? ` ${data.skipped} already had that owner and ${data.skipped === 1 ? "was" : "were"} skipped.` : "")
      );
      setConfirmOpen(false);
      setNewOwnerId("");
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setTransferring(false);
    }
  }

  const newOwner = eligible.find((e) => e.id === newOwnerId);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transfer Project Ownership</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Reassign projects in bulk — when a manager leaves, changes teams, or hands off a portfolio.
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

          <div className="flex-1 min-w-52">
            <label htmlFor="search" className="block text-xs font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                id="search"
                className="pl-8"
                placeholder="Project, brand, or owner…"
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
        <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
            <Users className="h-4 w-4 text-gray-400" />
            {selected.size} selected
          </span>
          <ArrowRight className="h-4 w-4 text-gray-400" />
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
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!newOwnerId || effective.length === 0}>
            Transfer {effective.length > 0 ? effective.length : ""}
          </Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer ownership?</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              <strong>{effective.length}</strong> project{effective.length !== 1 ? "s" : ""} will be
              reassigned to <strong>{newOwner ? label(newOwner) : ""}</strong>.
            </p>
            <p>
              {keepAsMember
                ? "Each previous owner stays on their project as a member with edit access, so nothing they were working on becomes unreachable."
                : "Previous owners will lose access to these projects entirely unless they are already members."}
            </p>
            <p className="text-xs text-gray-500">
              Both the new and previous owners are notified, and every transfer is recorded in the
              project activity log.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={transfer} disabled={transferring}>
              {transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {transferring ? "Transferring…" : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
