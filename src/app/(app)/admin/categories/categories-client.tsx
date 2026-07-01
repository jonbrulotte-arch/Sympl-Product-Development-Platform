"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, ToggleLeft, ToggleRight, Tag, Trash2 } from "lucide-react";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number; projects: number };
};

export function CategoriesClient({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", description: "", parentId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", parentId: "" });
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({ name: cat.name, description: cat.description ?? "", parentId: cat.parentId ?? "" });
    setError(null);
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { ...form, parentId: form.parentId || null };
      if (editing) {
        const res = await fetch("/api/admin/categories", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...body, parentId: form.parentId || null }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
        const updated = await res.json();
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const res = await fetch("/api/admin/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
        const created = await res.json();
        setCategories((prev) => [...prev, created]);
      }
      setDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (cat: Category) => {
    if (!confirm(`Delete "${cat.name}"? This cannot be undone.`)) return;
    const res = await fetch("/api/admin/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cat.id }),
    });
    if (res.ok) {
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Delete failed");
    }
  };

  const toggleActive = async (cat: Category) => {
    const res = await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cat.id, isActive: !cat.isActive }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    }
  };

  const rootCategories = categories.filter((c) => !c.parentId);
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            {categories.length} categor{categories.length === 1 ? "y" : "ies"}
          </CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add Category
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {categories.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No categories yet. Add one to get started.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Description</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Parent</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Products</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Projects</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rootCategories.map((cat) => (
                  <React.Fragment key={cat.id}>
                    <CategoryRow
                      cat={cat}
                      indent={0}
                      allCategories={categories}
                      onEdit={openEdit}
                      onToggle={toggleActive}
                      onDelete={deleteCategory}
                    />
                    {childrenOf(cat.id).map((child) => (
                      <CategoryRow
                        key={child.id}
                        cat={child}
                        indent={1}
                        allCategories={categories}
                        onEdit={openEdit}
                        onToggle={toggleActive}
                        onDelete={deleteCategory}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Outdoor Furniture"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Parent Category</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.parentId}
                onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
              >
                <option value="">— None (top-level) —</option>
                {categories
                  .filter((c) => !editing || c.id !== editing.id)
                  .filter((c) => !c.parentId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name.trim() || saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryRow({
  cat, indent, allCategories, onEdit, onToggle, onDelete,
}: {
  cat: Category; indent: number;
  allCategories: Category[];
  onEdit: (c: Category) => void;
  onToggle: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  const parent = allCategories.find((c) => c.id === cat.parentId);
  const canDelete = cat._count.products === 0 && cat._count.projects === 0 &&
    allCategories.filter((c) => c.parentId === cat.id).length === 0;
  return (
    <tr className={`hover:bg-gray-50 ${!cat.isActive ? "opacity-50" : ""}`}>
      <td className="px-4 py-2.5">
        <span style={{ paddingLeft: indent * 16 }} className="flex items-center gap-1.5">
          {indent > 0 && <span className="text-gray-300">↳</span>}
          <span className="font-medium text-gray-900">{cat.name}</span>
        </span>
        <span className="text-xs text-gray-400 pl-1">{cat.slug}</span>
      </td>
      <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">{cat.description ?? "—"}</td>
      <td className="px-4 py-2.5 text-gray-500">{parent?.name ?? "—"}</td>
      <td className="px-4 py-2.5 text-center text-gray-600">{cat._count.products}</td>
      <td className="px-4 py-2.5 text-center text-gray-600">{cat._count.projects}</td>
      <td className="px-4 py-2.5 text-center">
        <Badge variant={cat.isActive ? "success" : "secondary"}>
          {cat.isActive ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => onEdit(cat)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onToggle(cat)} className="p-1 text-gray-400 hover:text-gray-700 transition-colors" title={cat.isActive ? "Deactivate" : "Activate"}>
            {cat.isActive ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onDelete(cat)}
            disabled={!canDelete}
            className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={canDelete ? "Delete" : "Cannot delete: category is in use or has sub-categories"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
