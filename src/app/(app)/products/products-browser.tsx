"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { formatDate } from "@/lib/utils";
import {
  Search, Filter, X, ChevronLeft, ChevronRight,
  ExternalLink, Pencil, Save, Package, AlertTriangle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Project = { id: string; name: string; brand: string | null };
type Category = { id: string; name: string };

type ProductRow = {
  id: string;
  partNumber: string | null;
  modelNumber: string | null;
  itemName: string | null;
  brand: string | null;
  upc: string | null;
  inventoryStatus: string | null;
  inventoryStatusErp: string | null;
  packSize: string | null;
  material: string | null;
  size: string | null;
  htsCode: string | null;
  updatedAt: string;
  project: { id: string; name: string; status: string; brand: string | null };
  category: { id: string; name: string } | null;
  createdBy: { name: string | null };
  updatedBy: { name: string | null } | null;
  attributeValues: { attributeDefinition: { key: string; label: string }; textValue: string | null }[];
  duplicateOf: { productId: string; projectId: string; projectName: string } | null;
};

type Filters = {
  search: string;
  projectId: string;
  brand: string;
  inventoryStatus: string;
  categoryId: string;
};

// ─── Edit Drawer ─────────────────────────────────────────────────────────────

const EDITABLE_FIELDS: { key: keyof ProductRow; label: string }[] = [
  { key: "partNumber", label: "Part Number" },
  { key: "modelNumber", label: "Model Number" },
  { key: "itemName", label: "Item Name" },
  { key: "brand", label: "Brand" },
  { key: "upc", label: "UPC" },
  { key: "inventoryStatus", label: "Inventory Status" },
  { key: "packSize", label: "Pack Size" },
  { key: "material", label: "Material" },
  { key: "size", label: "Size" },
  { key: "htsCode", label: "HTS Code" },
];

function EditDrawer({
  product,
  onClose,
  onSaved,
}: {
  product: ProductRow;
  onClose: () => void;
  onSaved: (updated: ProductRow) => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const { key } of EDITABLE_FIELDS) {
      out[key] = (product[key] as string | null) ?? "";
    }
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const body: Record<string, string | null> = {};
    for (const { key } of EDITABLE_FIELDS) {
      body[key] = fields[key] || null;
    }
    const res = await fetch(
      `/api/projects/${product.project.id}/products/${product.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!res.ok) {
      setError("Failed to save. Please try again.");
      setSaving(false);
      return;
    }
    const updated = await res.json();
    onSaved({ ...product, ...updated });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="w-[480px] bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-500 font-medium">{product.project.name}</p>
            <h2 className="text-lg font-semibold text-gray-900 leading-tight">
              {product.itemName ?? product.partNumber ?? "Untitled Product"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${product.project.id}?product=${product.id}`}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Open in project"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Meta */}
          <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
            {product.category && <Badge variant="secondary">{product.category.name}</Badge>}
            <ProjectStatusBadge status={product.project.status as never} />
            {product.updatedAt && <span>Updated {formatDate(product.updatedAt)}</span>}
          </div>

          {/* Editable core fields */}
          {EDITABLE_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <Input
                value={fields[key]}
                onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={label}
              />
            </div>
          ))}

          {/* EAV attribute values (read-only display) */}
          {product.attributeValues.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Custom Attributes</p>
              <div className="space-y-2">
                {product.attributeValues.map((av, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-36 shrink-0 pt-0.5">{av.attributeDefinition.label}</span>
                    <span className="text-sm text-gray-800">{av.textValue ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Browser ─────────────────────────────────────────────────────────────

export function ProductsBrowser({
  projects,
  categories,
  inventoryStatuses,
}: {
  projects: Project[];
  categories: Category[];
  inventoryStatuses: string[];
}) {
  const [filters, setFilters] = useState<Filters>({
    search: "", projectId: "", brand: "", inventoryStatus: "", categoryId: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [filters.search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.inventoryStatus) params.set("inventoryStatus", filters.inventoryStatus);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);

    const res = await fetch(`/api/products?${params}`);
    if (res.ok) {
      const json = await res.json();
      setProducts(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    }
    setLoading(false);
  }, [page, debouncedSearch, filters.projectId, filters.brand, filters.inventoryStatus, filters.categoryId]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, filters.projectId, filters.brand, filters.inventoryStatus, filters.categoryId]);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const clearFilters = () => {
    setFilters({ search: "", projectId: "", brand: "", inventoryStatus: "", categoryId: "" });
    setDebouncedSearch("");
  };

  const hasActiveFilters =
    filters.projectId || filters.brand || filters.inventoryStatus || filters.categoryId || debouncedSearch;

  // Distinct brands from loaded projects
  const brands = [...new Set(projects.map((p) => p.brand).filter(Boolean))] as string[];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Products</h1>
            <p className="text-sm text-gray-500">
              {loading ? "Loading…" : `${total.toLocaleString()} product${total !== 1 ? "s" : ""} across all projects`}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search part number, item name, UPC…"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="pl-9 w-72"
            />
          </div>

          {/* Project */}
          <select
            value={filters.projectId}
            onChange={(e) => setFilter("projectId", e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Brand */}
          {brands.length > 0 && (
            <select
              value={filters.brand}
              onChange={(e) => setFilter("brand", e.target.value)}
              className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}

          {/* Inventory Status */}
          {inventoryStatuses.length > 0 && (
            <select
              value={filters.inventoryStatus}
              onChange={(e) => setFilter("inventoryStatus", e.target.value)}
              className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All statuses</option>
              {inventoryStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* Category */}
          {categories.length > 0 && (
            <select
              value={filters.categoryId}
              onChange={(e) => setFilter("categoryId", e.target.value)}
              className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Part #</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Item Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Brand</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">UPC</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Project</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Updated</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400">Loading…</td>
              </tr>
            )}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="text-center py-16">
                    <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No products found</p>
                    {hasActiveFilters && (
                      <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {!loading && products.map((product) => (
              <tr
                key={product.id}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer group"
                onClick={() => router.push(`/products/${product.id}`)}
              >
                <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {product.partNumber ?? <span className="text-gray-300">—</span>}
                    {product.duplicateOf && (
                      <span title={`Duplicate Part Number — also used in project "${product.duplicateOf.projectName}"`}>
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-900 max-w-xs truncate">
                  {product.itemName ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {product.brand ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                  {product.upc ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {[
                      ...(product.inventoryStatus ? product.inventoryStatus.split(/[\n,]+/) : []),
                      ...(product.inventoryStatusErp ? product.inventoryStatusErp.split(/[\n,]+/) : []),
                    ]
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((s, i) => (
                        <Badge key={i} variant="secondary" className="text-xs whitespace-nowrap">{s}</Badge>
                      ))
                    }
                    {!product.inventoryStatus && !product.inventoryStatusErp && (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link
                    href={`/projects/${product.project.id}`}
                    className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {product.project.name}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {product.category?.name ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {formatDate(product.updatedAt)}
                </td>
                <td className="px-4 py-3">
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-gray-200 text-gray-500"
                    onClick={(e) => { e.stopPropagation(); router.push(`/products/${product.id}`); }}
                    title="Edit product"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-white shrink-0">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} ({total.toLocaleString()} products)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
