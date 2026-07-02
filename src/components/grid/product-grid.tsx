"use client";

import { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type ColumnPinningState,
  type ColumnSizingState,
  type Row,
  type Column,
} from "@tanstack/react-table";
import { Plus, Download, Upload, Trash2, Copy, Search, ChevronUp, ChevronDown, Edit3, Pin, PinOff, HelpCircle, RefreshCw, AlertTriangle, Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ProductRecord } from "@prisma/client";

interface AttrDef {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  attributeType: string;
  requirement: string;
  maxValues: number;
  section: { id: string; name: string; sortOrder?: number } | null;
  lovItems: { value: string; label: string }[];
}

// True when an attribute can hold multiple values — covers both explicit maxValues > 1
// and MULTI_SELECT type (where maxValues may still be at the default of 1).
function isMultiValueAttr(attr: AttrDef): boolean {
  return attr.maxValues > 1 || attr.attributeType === "MULTI_SELECT";
}

// key → joined display string; raw arrays kept in _eavArrays
type EavMap = Record<string, string | undefined>;
type EavArrayMap = Record<string, string[]>;

type ProductRow = ProductRecord & {
  _saveStatus?: "idle" | "saving" | "saved" | "error";
  _eavValues?: EavMap;
  _eavArrays?: EavArrayMap;
  duplicateOf?: { productId: string; projectId: string; projectName: string } | null;
};

// Portal tooltip that escapes overflow-auto scroll containers
function GridTooltip({ label, description }: { label: string; description: string }) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left + r.width / 2 });
  }

  const tooltip = pos
    ? createPortal(
        <div
          className="fixed z-[9999] w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none leading-relaxed -translate-x-1/2"
          style={{ top: pos.top, left: pos.left }}
        >
          <span className="font-medium block mb-0.5">{label}</span>
          {description}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div
        ref={triggerRef}
        className="shrink-0 cursor-default"
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        onClick={(e) => e.stopPropagation()}
      >
        <HelpCircle className="h-3 w-3 text-gray-400 opacity-0 group-hover/hdr:opacity-100 transition-opacity" />
      </div>
      {tooltip}
    </>
  );
}

const CORE_COLUMNS: ColumnDef<ProductRow>[] = [
  {
    id: "rowActions",
    size: 36,
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: () => null, // rendered separately
  },
  {
    accessorKey: "partNumber",
    header: "Part Number",
    size: 140,
    meta: { required: true, section: "Core Data" },
  },
  {
    accessorKey: "modelNumber",
    header: "Model Number",
    size: 130,
    meta: { section: "Core Data" },
  },
  {
    accessorKey: "itemName",
    header: "Item Name",
    size: 220,
    meta: { required: true, section: "Core Data" },
  },
  {
    accessorKey: "brand",
    header: "Brand",
    size: 110,
    meta: { section: "Core Data" },
  },
  {
    accessorKey: "upc",
    header: "UPC",
    size: 130,
    meta: { section: "Core Data" },
  },
  {
    accessorKey: "inventoryStatus",
    header: "Inventory Status",
    size: 140,
    meta: { section: "Status" },
  },
  {
    accessorKey: "inventoryStatusErp",
    header: "Inventory Status (ERP)",
    size: 160,
    meta: { section: "Status" },
  },
  {
    accessorKey: "projectFolder",
    header: "Project Folder",
    size: 160,
    meta: { section: "Status" },
  },
  {
    accessorKey: "wrikeUrl",
    header: "Wrike URL",
    size: 160,
    meta: { section: "Status" },
  },
  {
    accessorKey: "psir",
    header: "PSIR",
    size: 140,
    meta: { section: "Status" },
  },
  {
    accessorKey: "warrantyInfo",
    header: "Warranty",
    size: 160,
    meta: { section: "Regulatory" },
  },
  {
    accessorKey: "htsCode",
    header: "HTS Code",
    size: 110,
    meta: { section: "Regulatory" },
  },
  {
    accessorKey: "htsCodeCanada",
    header: "HTS Code (CA)",
    size: 120,
    meta: { section: "Regulatory" },
  },
  {
    accessorKey: "productComposition",
    header: "Product Composition",
    size: 180,
    meta: { section: "Regulatory" },
  },
  {
    accessorKey: "needsProp65",
    header: "Needs Prop 65",
    size: 120,
    meta: { section: "Regulatory", fieldType: "boolean" },
  },
  {
    accessorKey: "batteriesRequired",
    header: "Batteries Required",
    size: 140,
    meta: { section: "Regulatory" },
  },
  {
    accessorKey: "packagingType",
    header: "Packaging Type",
    size: 140,
    meta: { section: "Product" },
  },
  {
    accessorKey: "packagingLangType",
    header: "Packaging Language Type",
    size: 160,
    meta: { section: "Product" },
  },
  {
    accessorKey: "packSize",
    header: "Pack Size",
    size: 100,
    meta: { section: "Product" },
  },
  {
    accessorKey: "numberOfPieces",
    header: "# Pieces",
    size: 90,
    meta: { section: "Product" },
  },
  {
    accessorKey: "individualOrSet",
    header: "Individual/Set",
    size: 120,
    meta: { section: "Product" },
  },
  {
    accessorKey: "material",
    header: "Material",
    size: 140,
    meta: { section: "Product" },
  },
  {
    accessorKey: "size",
    header: "Size",
    size: 100,
    meta: { section: "Product" },
  },
  {
    accessorKey: "jspCategory",
    header: "JSP Category",
    size: 140,
    meta: { section: "Product" },
  },
  {
    accessorKey: "userManual",
    header: "User Manual",
    size: 160,
    meta: { section: "Product" },
  },
  {
    accessorKey: "cutSheets",
    header: "Cut Sheets",
    size: 160,
    meta: { section: "Product" },
  },
  {
    accessorKey: "upcHeight",
    header: "UPC H (in)",
    size: 100,
    meta: { section: "Selling Unit" },
  },
  {
    accessorKey: "upcWidth",
    header: "UPC W (in)",
    size: 100,
    meta: { section: "Selling Unit" },
  },
  {
    accessorKey: "upcLength",
    header: "UPC L (in)",
    size: 100,
    meta: { section: "Selling Unit" },
  },
  {
    accessorKey: "upcWeight",
    header: "UPC Wt (lbs)",
    size: 110,
    meta: { section: "Selling Unit" },
  },
  {
    accessorKey: "itemHeight",
    header: "Item H (in)",
    size: 100,
    meta: { section: "Item (Unpackaged)" },
  },
  {
    accessorKey: "itemWidth",
    header: "Item W (in)",
    size: 100,
    meta: { section: "Item (Unpackaged)" },
  },
  {
    accessorKey: "itemLength",
    header: "Item L (in)",
    size: 100,
    meta: { section: "Item (Unpackaged)" },
  },
  {
    accessorKey: "itemWeight",
    header: "Item Wt (lbs)",
    size: 110,
    meta: { section: "Item (Unpackaged)" },
  },
  {
    accessorKey: "innerCartonGtin",
    header: "IC GTIN-14",
    size: 130,
    meta: { section: "Inner Carton" },
  },
  {
    accessorKey: "innerCartonHeight",
    header: "IC H (in)",
    size: 90,
    meta: { section: "Inner Carton" },
  },
  {
    accessorKey: "innerCartonWidth",
    header: "IC W (in)",
    size: 90,
    meta: { section: "Inner Carton" },
  },
  {
    accessorKey: "innerCartonLength",
    header: "IC L (in)",
    size: 90,
    meta: { section: "Inner Carton" },
  },
  {
    accessorKey: "innerCartonWeight",
    header: "IC Wt (lbs)",
    size: 100,
    meta: { section: "Inner Carton" },
  },
  {
    accessorKey: "innerCartonQty",
    header: "IC Qty",
    size: 80,
    meta: { section: "Inner Carton" },
  },
  {
    accessorKey: "masterCartonGtin",
    header: "MC GTIN-14",
    size: 130,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "masterCartonHeight",
    header: "MC H (in)",
    size: 90,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "masterCartonWidth",
    header: "MC W (in)",
    size: 90,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "masterCartonLength",
    header: "MC L (in)",
    size: 90,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "masterCartonWeight",
    header: "MC Wt (lbs)",
    size: 100,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "masterCartonQty",
    header: "MC Qty",
    size: 80,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "altCartonGtin",
    header: "Alt Carton GTIN",
    size: 130,
    meta: { section: "Alt Carton" },
  },
  {
    accessorKey: "altCartonType",
    header: "Alt Carton Type",
    size: 130,
    meta: { section: "Alt Carton" },
  },
  {
    accessorKey: "altCartonHeight",
    header: "Alt C. H (in)",
    size: 100,
    meta: { section: "Alt Carton" },
  },
  {
    accessorKey: "altCartonWidth",
    header: "Alt C. W (in)",
    size: 100,
    meta: { section: "Alt Carton" },
  },
  {
    accessorKey: "altCartonLength",
    header: "Alt C. L (in)",
    size: 100,
    meta: { section: "Alt Carton" },
  },
  {
    accessorKey: "altCartonWeight",
    header: "Alt C. Wt (lbs)",
    size: 110,
    meta: { section: "Alt Carton" },
  },
  {
    accessorKey: "altCartonQty",
    header: "Alt C. Qty",
    size: 90,
    meta: { section: "Alt Carton" },
  },
  {
    accessorKey: "palletGtin",
    header: "Pallet GTIN",
    size: 120,
    meta: { section: "Pallet" },
  },
  {
    accessorKey: "palletHeight",
    header: "Pallet H (in)",
    size: 100,
    meta: { section: "Pallet" },
  },
  {
    accessorKey: "palletWidth",
    header: "Pallet W (in)",
    size: 100,
    meta: { section: "Pallet" },
  },
  {
    accessorKey: "palletLength",
    header: "Pallet L (in)",
    size: 100,
    meta: { section: "Pallet" },
  },
  {
    accessorKey: "palletWeight",
    header: "Pallet Wt (lbs)",
    size: 110,
    meta: { section: "Pallet" },
  },
  {
    accessorKey: "palletStackable",
    header: "Pallet Stackable",
    size: 120,
    meta: { section: "Pallet", fieldType: "boolean" },
  },
  {
    accessorKey: "layersPerPallet",
    header: "Layers/Pallet",
    size: 110,
    meta: { section: "Pallet" },
  },
  {
    accessorKey: "palletQty",
    header: "Pallet Qty",
    size: 90,
    meta: { section: "Pallet" },
  },
];

// Width of the manually-rendered checkbox column that sits outside TanStack's column model
const CHECKBOX_COL_WIDTH = 36;

interface ProductGridProps {
  projectId: string;
  initialProducts: ProductRow[];
  globalAttrs?: AttrDef[];
  categoryAttrs?: AttrDef[];
  coreAttrDefs?: AttrDef[];
  canEdit: boolean;
  onExport?: () => void;
  onImport?: () => void;
  onSalsifySync?: (selectedIds: string[]) => void;
}

export function ProductGrid({
  projectId,
  initialProducts,
  globalAttrs = [],
  categoryAttrs = [],
  coreAttrDefs = [],
  canEdit,
  onExport,
  onImport,
  onSalsifySync,
}: ProductGridProps) {
  const enriched = (initialProducts as (ProductRow & {
    attributeValues?: { attributeDefinition: { key: string }; valueIndex: number; textValue?: string | null }[]
  })[]).map((p) => {
    const arrays: EavArrayMap = {};
    for (const av of (p.attributeValues ?? []).sort((a, b) => a.valueIndex - b.valueIndex)) {
      const k = av.attributeDefinition.key;
      if (!arrays[k]) arrays[k] = [];
      arrays[k].push(av.textValue ?? "");
    }
    return {
      ...p,
      _eavArrays: arrays,
      _eavValues: Object.fromEntries(Object.entries(arrays).map(([k, vals]) => [k, vals.join(" · ")])),
    };
  });

  const [products, setProducts] = useState<ProductRow[]>(enriched);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({ left: [], right: [] });
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  // Load saved column sizes after mount to avoid SSR/client hydration mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`grid-col-sizes-${projectId}`);
      if (saved) setColumnSizing(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [projectId]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const saveTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const saveCell = useCallback(
    async (productId: string, field: string, value: unknown, attrDef?: AttrDef) => {
      const key = `${productId}-${field}`;
      const existing = saveTimeouts.current.get(key);
      if (existing) clearTimeout(existing);

      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, _saveStatus: "saving" } : p))
      );

      const timeout = setTimeout(async () => {
        try {
          let body: Record<string, unknown>;
          if (attrDef) {
            const raw = value != null ? String(value) : "";
            const vals = isMultiValueAttr(attrDef)
              ? raw.split("\n").map((s) => s.trim()).filter(Boolean)
              : raw.trim() ? [raw.trim()] : [];
            body = {
              attributeValues: vals.map((textValue, valueIndex) => ({
                attributeDefinitionId: attrDef.id,
                valueIndex,
                textValue,
              })),
            };
          } else {
            body = { [field]: value };
          }

          const res = await fetch(`/api/projects/${projectId}/products/${productId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error("Save failed");
          const updated = await res.json().catch(() => null);
          setProducts((prev) =>
            prev.map((p) => (p.id === productId
              ? { ...p, _saveStatus: "saved", duplicateOf: updated?.duplicateOf ?? null }
              : p))
          );
          setTimeout(() => {
            setProducts((prev) =>
              prev.map((p) => (p.id === productId ? { ...p, _saveStatus: "idle" } : p))
            );
          }, 1500);
        } catch {
          setProducts((prev) =>
            prev.map((p) => (p.id === productId ? { ...p, _saveStatus: "error" } : p))
          );
        }
        saveTimeouts.current.delete(key);
      }, 500);

      saveTimeouts.current.set(key, timeout);
    },
    [projectId]
  );

  const addRow = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const newProduct = await res.json();
      setProducts((prev) => [...prev, { ...newProduct, _saveStatus: "idle" }]);
    }
  }, [projectId]);

  const deleteSelected = useCallback(async () => {
    if (selectedRows.size === 0) return;
    const ids = [...selectedRows];
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/projects/${projectId}/products/${id}`, { method: "DELETE" })
      )
    );
    setProducts((prev) => prev.filter((p) => !selectedRows.has(p.id)));
    setSelectedRows(new Set());
  }, [selectedRows, projectId]);

  const duplicateSelected = useCallback(async () => {
    for (const id of selectedRows) {
      const product = products.find((p) => p.id === id);
      if (!product) continue;
      const res = await fetch(`/api/projects/${projectId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...product,
          id: undefined,
          partNumber: product.partNumber ? `${product.partNumber}-COPY` : undefined,
          isDuplicate: true,
          sourceProductId: id,
        }),
      });
      if (res.ok) {
        const newProduct = await res.json();
        setProducts((prev) => [...prev, { ...newProduct, _saveStatus: "idle" }]);
      }
    }
    setSelectedRows(new Set());
  }, [selectedRows, products, projectId]);

  const allAttrs = useMemo(() => [...globalAttrs, ...categoryAttrs], [globalAttrs, categoryAttrs]);

  // Build a unified column list: core columns ordered by coreAttrDefs, then EAV columns,
  // all grouped into shared section groups so the same section name never appears twice.
  const columns = useMemo<ColumnDef<ProductRow>[]>(() => {
    const colMap = new Map(
      CORE_COLUMNS.map((col) => [(col as { accessorKey?: string; id?: string }).accessorKey ?? (col as { id?: string }).id ?? "", col])
    );
    const rowActionsCol = CORE_COLUMNS.find((c) => (c as { id?: string }).id === "rowActions");

    // section name → ordered child column defs
    const sectionMap = new Map<string, ColumnDef<ProductRow>[]>();
    // section name → section sort order (from attr defs) for final group ordering
    const sectionSortOrder = new Map<string, number>();

    const addToSection = (sectionName: string, col: ColumnDef<ProductRow>, secSortOrder = 999) => {
      if (!sectionMap.has(sectionName)) {
        sectionMap.set(sectionName, []);
        sectionSortOrder.set(sectionName, secSortOrder);
      }
      sectionMap.get(sectionName)!.push(col);
    };

    // 0. Computed completeness column — % of REQUIRED attributes filled
    const requiredCore = coreAttrDefs.filter((a) => a.requirement === "REQUIRED").map((a) => a.key);
    const requiredEav = allAttrs.filter((a) => a.requirement === "REQUIRED").map((a) => a.key);
    if (requiredCore.length + requiredEav.length > 0) {
      addToSection("Core Data", {
        id: "completeness",
        header: "Complete",
        size: 90,
        enableSorting: true,
        meta: { computed: true },
        accessorFn: (row: ProductRow) => {
          let filled = 0;
          for (const key of requiredCore) {
            const v = (row as unknown as Record<string, unknown>)[key];
            if (v !== null && v !== undefined && v !== "") filled++;
          }
          for (const key of requiredEav) {
            const vals = row._eavArrays?.[key];
            if (vals && vals.some((x) => x !== "")) filled++;
          }
          return Math.round((filled / (requiredCore.length + requiredEav.length)) * 100);
        },
      }, 0);
    }

    // Computed Salsify drift column: 2 = synced & unchanged, 1 = changed
    // since last sync, 0 = never synced (numeric for sortability)
    addToSection("Core Data", {
      id: "salsifyState",
      header: "Salsify",
      size: 90,
      enableSorting: true,
      meta: { computed: true, computedKind: "salsify" },
      accessorFn: (row: ProductRow) => {
        const synced = (row as unknown as { salsifyLastSyncedAt?: string | Date | null }).salsifyLastSyncedAt;
        if (!synced) return 0;
        return new Date(row.updatedAt) > new Date(synced) ? 1 : 2;
      },
    }, 0);

    // 1. Core columns in attr-def order (section.sortOrder → attr.sortOrder)
    const seenCoreKeys = new Set<string>();
    for (const attr of coreAttrDefs) {
      const col = colMap.get(attr.key);
      if (col && !seenCoreKeys.has(attr.key)) {
        const sectionName = attr.section?.name ?? "General";
        const secOrder = attr.section?.sortOrder ?? 999;
        addToSection(sectionName, { ...col, meta: { ...col.meta, attrDef: attr } }, secOrder);
        seenCoreKeys.add(attr.key);
      }
    }
    // Append any CORE_COLUMNS not covered by an attr def
    for (const col of CORE_COLUMNS) {
      const key = (col as { accessorKey?: string }).accessorKey;
      if (key && !seenCoreKeys.has(key) && (col as { id?: string }).id !== "rowActions") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fallbackSection = ((col.meta as any)?.section as string | undefined) ?? "General";
        addToSection(fallbackSection, col);
        seenCoreKeys.add(key);
      }
    }

    // 2. EAV columns after core, sharing section groups where names match
    for (const attr of allAttrs) {
      const sectionName = attr.section?.name ?? "General";
      const secOrder = attr.section?.sortOrder ?? 999;
      const eavCol: ColumnDef<ProductRow> = {
        id: `eav_${attr.key}`,
        header: attr.label,
        size: 180,
        minSize: 80,
        meta: { eav: true, attrDef: attr },
        accessorFn: (row: ProductRow) => (row as ProductRow & { _eavValues?: EavMap })._eavValues?.[attr.key] ?? "",
      };
      addToSection(sectionName, eavCol, secOrder);
    }

    // Build groups sorted by section sort order
    const groups = [...sectionMap.entries()]
      .sort((a, b) => (sectionSortOrder.get(a[0]) ?? 999) - (sectionSortOrder.get(b[0]) ?? 999))
      .map(([sectionName, cols]) => ({
        id: `section_${sectionName}`,
        header: sectionName,
        meta: { isGroup: true, section: sectionName },
        columns: cols,
      } as ColumnDef<ProductRow>));

    return rowActionsCol ? [rowActionsCol, ...groups] : groups;
  }, [coreAttrDefs, allAttrs]);

  const table = useReactTable({
    data: products,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter, columnPinning, columnSizing },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onColumnPinningChange: setColumnPinning,
    onColumnSizingChange: (updater) => {
      setColumnSizing((old) => {
        const next = typeof updater === "function" ? updater(old) : updater;
        try { localStorage.setItem(`grid-col-sizes-${projectId}`, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    },
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 60 },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
  });

  // Returns sticky positioning style for a pinned leaf column
  const getPinnedStyle = useCallback((column: Column<ProductRow>): React.CSSProperties => {
    if (column.getIsPinned() !== "left") return {};
    return {
      position: "sticky",
      left: CHECKBOX_COL_WIDTH + column.getStart("left"),
      zIndex: 2,
    };
  }, []);

  const navigateCell = useCallback(
    (direction: 1 | -1) => {
      setEditingCell((current) => {
        if (!current) return current;
        const rows = table.getRowModel().rows;
        const leafCols = table.getVisibleLeafColumns().filter((c) => c.id !== "rowActions");
        const rowIdx = rows.findIndex((r) => r.id === current.rowId);
        const colIdx = leafCols.findIndex((c) => c.id === current.columnId);
        if (rowIdx === -1 || colIdx === -1) return null;

        let nextRow = rowIdx;
        let nextCol = colIdx + direction;
        if (nextCol < 0) { nextRow--; nextCol = leafCols.length - 1; }
        else if (nextCol >= leafCols.length) { nextRow++; nextCol = 0; }
        if (nextRow < 0 || nextRow >= rows.length) return null;
        return { rowId: rows[nextRow].id, columnId: leafCols[nextCol].id };
      });
    },
    [table]
  );

  useEffect(() => {
    const timeouts = saveTimeouts.current;
    return () => { timeouts.forEach(clearTimeout); };
  }, []);

  const headerGroups = table.getHeaderGroups();

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 p-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
          {selectedRows.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{selectedRows.size} selected</span>
              {onSalsifySync && (
                <Button size="sm" variant="outline" onClick={() => onSalsifySync([...selectedRows])}
                  className="text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync to Salsify
                </Button>
              )}
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setBulkEditOpen(true)}>
                  <Edit3 className="h-3.5 w-3.5" />
                  Bulk Edit
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={duplicateSelected}>
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </Button>
              <Button size="sm" variant="destructive" onClick={deleteSelected}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <SavedViewsMenu
            projectId={projectId}
            getCurrentView={() => ({ sorting, columnVisibility, columnPinning, globalFilter })}
            applyView={(v) => {
              setSorting(v.sorting ?? []);
              setColumnVisibility(v.columnVisibility ?? {});
              setColumnPinning(v.columnPinning ?? { left: [], right: [] });
              setGlobalFilter(v.globalFilter ?? "");
            }}
          />
          {onImport && (
            <Button size="sm" variant="outline" onClick={onImport}>
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
          )}
          {onExport && (
            <Button size="sm" variant="outline" onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table
          className="border-collapse text-sm"
          style={{ width: CHECKBOX_COL_WIDTH + table.getTotalSize(), tableLayout: "fixed" }}
        >
          {/* colgroup is the authoritative source for fixed-layout column widths;
              without it, grouped header colSpans confuse the browser's width distribution */}
          <colgroup>
            <col style={{ width: CHECKBOX_COL_WIDTH }} />
            {table.getVisibleLeafColumns()
              .filter((c) => c.id !== "rowActions")
              .map((col) => (
                <col key={col.id} style={{ width: col.getSize() }} />
              ))}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-gray-50">
            {headerGroups.map((headerGroup, groupIdx) => (
              <tr key={headerGroup.id}>
                {/* Checkbox — sticky, spans all header rows */}
                {groupIdx === 0 && (
                  <th
                    rowSpan={headerGroups.length}
                    className="w-9 border-b border-r border-gray-200 bg-gray-50 px-2 sticky left-0 z-20"
                    style={{ width: CHECKBOX_COL_WIDTH }}
                  >
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedRows.size === products.length && products.length > 0}
                      onChange={(e) => {
                        setSelectedRows(e.target.checked ? new Set(products.map((p) => p.id)) : new Set());
                      }}
                    />
                  </th>
                )}
                {headerGroup.headers
                  .filter((h) => h.column.id !== "rowActions")
                  .map((header) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const meta = header.column.columnDef.meta as any;
                  const isEav = !!meta?.eav;
                  const isGroup = !!meta?.isGroup;
                  const isLeaf = header.subHeaders.length === 0;
                  // Only leaf columns can be pinned; group headers span multiple cols and can't be sticky
                  const isPinned = isLeaf && header.column.getIsPinned() === "left";
                  const pinnedStyle = isPinned ? getPinnedStyle(header.column) : {};

                  // Placeholder cells must render an empty <th> to keep colspans correct;
                  // returning null removes the cell and shifts section headers left.
                  if (header.isPlaceholder) {
                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        className="border-b border-r border-gray-200 bg-gray-50"
                      />
                    );
                  }

                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{
                        width: isLeaf ? header.getSize() : undefined,
                        ...pinnedStyle,
                      }}
                      className={cn(
                        "border-b border-r border-gray-200 px-2 py-2 text-left text-xs font-semibold whitespace-nowrap select-none relative overflow-visible hover:z-30",
                        (isEav || isGroup) ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-gray-600",
                        isGroup && "text-center font-bold border-t-2 border-amber-300",
                        isPinned && "!bg-blue-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.2)]"
                      )}
                      onClick={isLeaf ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className={cn("flex items-center gap-1 group/hdr", isLeaf && "cursor-pointer")}>
                        <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        {header.column.getIsSorted() === "asc" && <ChevronUp className="h-3 w-3 shrink-0" />}
                        {header.column.getIsSorted() === "desc" && <ChevronDown className="h-3 w-3 shrink-0" />}
                        {isLeaf && meta?.attrDef?.description && (
                          <GridTooltip label={meta.attrDef.label} description={meta.attrDef.description} />
                        )}
                        {isLeaf && (
                          <button
                            className={cn(
                              "ml-auto p-0.5 rounded hover:bg-gray-200 transition-colors shrink-0",
                              isPinned ? "opacity-100 text-blue-600" : "opacity-0 group-hover/hdr:opacity-100 text-gray-400"
                            )}
                            title={isPinned ? "Unfreeze column" : "Freeze column"}
                            onClick={(e) => {
                              e.stopPropagation();
                              header.column.pin(isPinned ? false : "left");
                            }}
                          >
                            {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                      {isLeaf && (
                        <div
                          onMouseDown={(e) => { e.stopPropagation(); header.getResizeHandler()(e); }}
                          onTouchStart={(e) => { e.stopPropagation(); header.getResizeHandler()(e); }}
                          className={cn(
                            "absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none group/resize",
                            "hover:bg-blue-400/60",
                            header.column.getIsResizing() && "bg-blue-500"
                          )}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <GridRow
                key={row.id}
                row={row}
                selected={selectedRows.has(row.original.id)}
                onSelect={(checked) => {
                  setSelectedRows((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(row.original.id);
                    else next.delete(row.original.id);
                    return next;
                  });
                }}
                editingCell={editingCell}
                onCellEdit={(columnId) => setEditingCell({ rowId: row.id, columnId })}
                onCellBlur={() => setEditingCell(null)}
                onNavigateCell={navigateCell}
                onCellChange={(field, value, attrDef) => {
                  setProducts((prev) =>
                    prev.map((p) => {
                      if (p.id !== row.original.id) return p;
                      if (attrDef) {
                        const raw = String(value);
                        const vals = isMultiValueAttr(attrDef)
                          ? raw.split("\n").map((s) => s.trim()).filter(Boolean)
                          : [raw];
                        const displayStr = vals.join(" · ");
                        return {
                          ...p,
                          _eavValues: { ...p._eavValues, [attrDef.key]: displayStr },
                          _eavArrays: { ...p._eavArrays, [attrDef.key]: vals },
                        };
                      }
                      return { ...p, [field]: value };
                    })
                  );
                  if (canEdit) saveCell(row.original.id, field, value, attrDef);
                }}
                saveStatus={row.original._saveStatus ?? "idle"}
                canEdit={canEdit}
                getPinnedStyle={getPinnedStyle}
              />
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="py-12 text-center text-gray-400 text-sm">
                  No products yet.{canEdit && " Click \"Add Row\" to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-white text-xs text-gray-500">
        <span>{table.getFilteredRowModel().rows.length} of {products.length} products</span>
        <span>
          {products.some((p) => p._saveStatus === "saving") && "Saving..."}
          {products.every((p) => p._saveStatus !== "saving") &&
            products.some((p) => p._saveStatus === "saved") && "All changes saved"}
          {products.some((p) => p._saveStatus === "error") && (
            <span className="text-red-500">Save error — please retry</span>
          )}
        </span>
      </div>

      {bulkEditOpen && (
        <BulkEditDialog
          selectedIds={[...selectedRows]}
          products={products}
          allAttrs={allAttrs}
          coreAttrDefs={coreAttrDefs}
          projectId={projectId}
          onClose={() => setBulkEditOpen(false)}
          onApplied={(updatedProducts) => {
            setProducts((prev) =>
              prev.map((p) => {
                const u = updatedProducts.find((u) => u.id === p.id);
                if (!u) return p;
                // Rebuild EAV maps entirely from the API response (which returns all attributeValues).
                // Do NOT start from p._eavArrays — that would duplicate values that are already in the response.
                const raw = u as typeof u & { attributeValues?: { attributeDefinition: { key: string }; valueIndex: number; textValue?: string | null }[] };
                const arrays: EavArrayMap = {};
                for (const av of (raw.attributeValues ?? []).sort((a, b) => a.valueIndex - b.valueIndex)) {
                  const k = av.attributeDefinition.key;
                  if (!arrays[k]) arrays[k] = [];
                  arrays[k].push(av.textValue ?? "");
                }
                // Preserve any EAV keys the API response didn't include (shouldn't happen, but safe fallback)
                const merged = { ...p._eavArrays, ...arrays };
                return {
                  ...p,
                  ...u,
                  _eavArrays: merged,
                  _eavValues: Object.fromEntries(Object.entries(merged).map(([k, vals]) => [k, (vals as string[]).join(" · ")])),
                };
              })
            );
            setSelectedRows(new Set());
            setBulkEditOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Individual row component ──────────────────────────────────────────────────

// ─── Multi-Select Checkbox Dropdown ───────────────────────────────────────────

interface MultiSelectDropdownProps {
  lovItems: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  onClose: () => void;
  maxValues?: number;
}

function MultiSelectDropdown({ lovItems, selected, onChange, onClose, maxValues }: MultiSelectDropdownProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set(selected));
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Position the portal below the cell
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.closest("td");
    if (parent) {
      const r = parent.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: Math.max(r.width, 180) });
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Keep open if clicking inside the dropdown portal
      const portal = document.getElementById("ms-dropdown-portal");
      if (portal && portal.contains(target)) return;
      commit();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [checked]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    onChange([...checked]);
    onClose();
  };

  const toggle = (val: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(val)) {
        next.delete(val);
      } else {
        if (maxValues && next.size >= maxValues) return prev;
        next.add(val);
      }
      return next;
    });
  };

  const menu = (
    <div
      id="ms-dropdown-portal"
      style={pos ? { position: "absolute", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999 } : { display: "none" }}
      className="bg-white border border-gray-200 rounded-md shadow-lg py-1 max-h-52 overflow-y-auto"
    >
      {lovItems.map((item) => (
        <label
          key={item.value}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm text-gray-800"
          onMouseDown={(e) => { e.preventDefault(); toggle(item.value); }}
        >
          <input
            type="checkbox"
            className="rounded"
            checked={checked.has(item.value)}
            readOnly
          />
          {item.label}
        </label>
      ))}
      <div className="border-t border-gray-100 px-3 py-1.5 mt-1 flex justify-end">
        <button
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          onMouseDown={(e) => { e.preventDefault(); commit(); }}
        >
          Done
        </button>
      </div>
    </div>
  );

  return (
    <div ref={ref} className="w-full h-full min-h-[32px]">
      {pos && createPortal(menu, document.body)}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

interface GridRowProps {
  row: Row<ProductRow>;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  editingCell: { rowId: string; columnId: string } | null;
  onCellEdit: (columnId: string) => void;
  onCellBlur: () => void;
  onCellChange: (field: string, value: unknown, attrDef?: AttrDef) => void;
  onNavigateCell: (direction: 1 | -1) => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
  canEdit: boolean;
  getPinnedStyle: (column: Column<ProductRow>) => React.CSSProperties;
}

function GridRow({
  row,
  selected,
  onSelect,
  editingCell,
  onCellEdit,
  onCellBlur,
  onCellChange,
  onNavigateCell,
  saveStatus,
  canEdit,
  getPinnedStyle,
}: GridRowProps) {
  const navigatingRef = useRef(false);
  const isEditing = (colId: string) =>
    editingCell?.rowId === row.id && editingCell?.columnId === colId;

  return (
    <tr
      className={cn(
        "group border-b border-gray-100 hover:bg-blue-50/30 transition-colors",
        selected && "bg-blue-50",
        saveStatus === "saving" && "opacity-70",
        saveStatus === "error" && "bg-red-50"
      )}
    >
      {/* Checkbox — always sticky */}
      <td
        className="border-r border-gray-100 px-2 py-1 text-center bg-white sticky left-0 z-10"
        style={{ width: CHECKBOX_COL_WIDTH }}
      >
        <div className="flex items-center gap-1">
          <input
            type="checkbox"
            className="rounded"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
          />
          {saveStatus === "saving" && (
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          )}
          {saveStatus === "saved" && (
            <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
          )}
          {saveStatus === "error" && (
            <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
          )}
        </div>
      </td>

      {/* Data cells */}
      {row.getVisibleCells().filter((c) => c.column.id !== "rowActions").map((cell) => {
        const value = cell.getValue();
        const colId = cell.column.id;
        const editing = isEditing(colId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attrDef: AttrDef | undefined = (cell.column.columnDef.meta as any)?.attrDef;
        const isEav = !!(cell.column.columnDef.meta as any)?.eav;
        const isPinned = cell.column.getIsPinned() === "left";
        const pinnedStyle = getPinnedStyle(cell.column);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isBoolean = (cell.column.columnDef.meta as any)?.fieldType === "boolean";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isComputed = (cell.column.columnDef.meta as any)?.computed === true;

        if (isComputed) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const kind = (cell.column.columnDef.meta as any)?.computedKind;
          const n = typeof value === "number" ? value : 0;
          let chip: React.ReactNode;
          if (kind === "salsify") {
            chip = n === 2
              ? <span className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700" title="Synced — no changes since last sync">Synced</span>
              : n === 1
              ? <span className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800" title="Product changed since last Salsify sync">Changed</span>
              : <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400" title="Never synced to Salsify">—</span>;
          } else {
            chip = (
              <span className={cn(
                "inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-full",
                n >= 100 ? "bg-green-100 text-green-700" : n >= 50 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-700"
              )}>
                {n}%
              </span>
            );
          }
          return (
            <td
              key={cell.id}
              style={{ width: cell.column.getSize(), ...pinnedStyle }}
              className={cn("border-r border-gray-100 px-2 py-1", isPinned && "bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]")}
            >
              {chip}
            </td>
          );
        }

        const commit = (raw: string, navigate?: 1 | -1) => {
          if (isEav) {
            onCellChange(colId, raw, attrDef);
          } else {
            const parsed = typeof value === "number" ? parseFloat(raw) || 0 : raw;
            onCellChange(colId, parsed);
          }
          if (navigate !== undefined) {
            navigatingRef.current = true;
            onNavigateCell(navigate);
          } else {
            onCellBlur();
          }
        };

        const handleBlur = (raw: string) => {
          if (navigatingRef.current) { navigatingRef.current = false; return; }
          commit(raw);
        };

        return (
          <td
            key={cell.id}
            style={{ width: cell.column.getSize(), ...pinnedStyle }}
            className={cn(
              "border-r border-gray-100 px-0 py-0 relative",
              isEav && !isPinned && "bg-amber-50/40",
              isPinned && "bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]",
              editing && "ring-2 ring-inset ring-blue-500 z-10"
            )}
            onClick={() => {
              if (isBoolean && canEdit) {
                onCellChange(colId, !value);
              } else {
                canEdit && onCellEdit(colId);
              }
            }}
          >
            {isBoolean ? (
              <div className="px-2 py-1 text-sm min-h-[32px] flex items-center">
                <span className={cn("text-xs font-medium", value ? "text-green-600" : "text-gray-400")}>
                  {value ? "Yes" : "No"}
                </span>
              </div>
            ) : editing ? (() => {
              const isMulti = attrDef && isMultiValueAttr(attrDef);
              // For core fields, current value is a \n-joined string; for EAV fields use _eavArrays
              const multiVals: string[] = isMulti
                ? (isEav
                    ? ((row.original as ProductRow)._eavArrays?.[attrDef!.key] ?? [])
                    : (value != null ? String(value).split("\n").filter(Boolean) : []))
                : [];
              const editDefault = isMulti
                ? multiVals.join("\n")
                : (value != null ? String(value) : "");

              if (isMulti) {
                if (attrDef!.lovItems?.length) {
                  return (
                    <MultiSelectDropdown
                      lovItems={attrDef!.lovItems}
                      selected={multiVals}
                      maxValues={attrDef!.maxValues > 1 ? attrDef!.maxValues : undefined}
                      onChange={(vals) => {
                        // Core fields: no attrDef → saves to ProductRecord column directly
                        // EAV fields: pass attrDef → saves to ProductAttributeValue rows
                        if (isEav) {
                          onCellChange(colId, vals.join("\n"), attrDef);
                        } else {
                          onCellChange(colId, vals.join("\n"));
                        }
                        onCellBlur();
                      }}
                      onClose={onCellBlur}
                    />
                  );
                }
                return (
                  <textarea
                    autoFocus
                    rows={Math.min(attrDef!.maxValues, 5)}
                    className="w-full px-2 py-1 text-sm outline-none bg-white resize-none text-gray-900"
                    defaultValue={editDefault}
                    placeholder={`One value per line (max ${attrDef!.maxValues})`}
                    onBlur={(e) => handleBlur(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") onCellBlur();
                      if (e.key === "Tab") { e.preventDefault(); commit(e.currentTarget.value, e.shiftKey ? -1 : 1); }
                    }}
                  />
                );
              }
              if (attrDef?.lovItems?.length) {
                return (
                  <select
                    autoFocus
                    className="w-full h-full px-2 py-1 text-sm outline-none bg-white text-gray-900"
                    defaultValue={editDefault}
                    onChange={(e) => commit(e.target.value)}
                    onBlur={(e) => handleBlur(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Tab") { e.preventDefault(); commit(e.currentTarget.value, e.shiftKey ? -1 : 1); }
                      if (e.key === "Escape") onCellBlur();
                    }}
                  >
                    <option value="">—</option>
                    {attrDef.lovItems.map((lov) => (
                      <option key={lov.value} value={lov.value}>{lov.label}</option>
                    ))}
                  </select>
                );
              }
              return (
                <input
                  autoFocus
                  className="w-full h-full px-2 py-1 text-sm outline-none bg-white text-gray-900"
                  defaultValue={editDefault}
                  onBlur={(e) => handleBlur(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Tab") { e.preventDefault(); commit(e.currentTarget.value, e.shiftKey ? -1 : 1); return; }
                    if (e.key === "Enter") commit(e.currentTarget.value);
                    if (e.key === "Escape") onCellBlur();
                  }}
                />
              );
            })() : (
              <div className={cn("px-2 py-1 text-sm truncate min-h-[32px] flex items-center gap-1 flex-wrap", isEav ? "text-amber-900" : "text-gray-700")}>
                {colId === "partNumber" && (row.original as ProductRow).duplicateOf && (
                  <span
                    title={`Duplicate Part Number — also used in project "${(row.original as ProductRow).duplicateOf!.projectName}"`}
                    className="shrink-0"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  </span>
                )}
                {value != null && String(value) !== "" ? (() => {
                  if (attrDef && isMultiValueAttr(attrDef)) {
                    const vals = isEav
                      ? ((row.original as ProductRow)._eavArrays?.[attrDef.key] ?? [])
                      : String(value).split("\n").filter(Boolean);
                    const chipClass = isEav
                      ? "inline-block bg-amber-100 text-amber-800 text-xs px-1.5 py-0.5 rounded"
                      : "inline-block bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 rounded";
                    if (attrDef.lovItems?.length) {
                      return vals.map((v, i) => {
                        const label = attrDef.lovItems.find((l) => l.value === v)?.label ?? v;
                        return <span key={i} className={chipClass}>{label}</span>;
                      });
                    }
                    return vals.map((v, i) => (
                      <span key={i} className={chipClass}>{v}</span>
                    ));
                  }
                  if (attrDef?.lovItems?.length) {
                    return attrDef.lovItems.find((l) => l.value === String(value))?.label ?? String(value);
                  }
                  return String(value);
                })() : (
                  <span className="text-gray-300 italic text-xs">—</span>
                )}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ─── Bulk Edit Dialog ─────────────────────────────────────────────────────────

interface BulkEditDialogProps {
  selectedIds: string[];
  products: ProductRow[];
  allAttrs: AttrDef[];
  coreAttrDefs: AttrDef[];
  projectId: string;
  onClose: () => void;
  onApplied: (updated: ProductRow[]) => void;
}

function BulkEditDialog({ selectedIds, products, allAttrs, coreAttrDefs, projectId, onClose, onApplied }: BulkEditDialogProps) {
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [writeMode, setWriteMode] = useState<"" | "overwrite" | "append">("");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Build section-grouped field options from coreAttrDefs + allAttrs,
  // preserving their server-sorted order and grouping by section name.
  const fieldGroups = useMemo(() => {
    const groups = new Map<string, { sectionOrder: number; fields: { value: string; label: string }[] }>();
    for (const attr of coreAttrDefs) {
      const sec = attr.section?.name ?? "Core Fields";
      const ord = attr.section?.sortOrder ?? 0;
      if (!groups.has(sec)) groups.set(sec, { sectionOrder: ord, fields: [] });
      groups.get(sec)!.fields.push({ value: attr.key, label: attr.label });
    }
    for (const attr of allAttrs) {
      const sec = attr.section?.name ?? "Attributes";
      const ord = attr.section?.sortOrder ?? 999;
      if (!groups.has(sec)) groups.set(sec, { sectionOrder: ord, fields: [] });
      groups.get(sec)!.fields.push({ value: `eav_${attr.key}`, label: attr.label });
    }
    return [...groups.entries()]
      .sort(([, a], [, b]) => a.sectionOrder - b.sectionOrder)
      .map(([name, { fields }]) => ({ name, fields }));
  }, [coreAttrDefs, allAttrs]);

  // Which attr definition is currently selected?
  const selectedEavAttr = allAttrs.find((a) => `eav_${a.key}` === field);
  const selectedCoreAttr = coreAttrDefs.find((a) => a.key === field);
  const selectedAnyAttr = selectedEavAttr ?? selectedCoreAttr;
  // Append only meaningful for multi-value EAV attributes
  const supportsAppend = !!(selectedEavAttr && isMultiValueAttr(selectedEavAttr));

  const apply = async () => {
    if (!field || !writeMode) return;
    setApplying(true);
    setResult(null);
    let succeeded = 0;
    let failed = 0;

    const updated: ProductRow[] = [];
    await Promise.all(
      selectedIds.map(async (productId) => {
        let body: Record<string, unknown>;
        if (selectedEavAttr) {
          let vals: string[];
          if (writeMode === "append" && supportsAppend) {
            const existing = products.find((p) => p.id === productId)?._eavArrays?.[selectedEavAttr.key] ?? [];
            const incoming = value.split("\n").map((s) => s.trim()).filter(Boolean);
            const merged = [...existing];
            for (const v of incoming) {
              if (!merged.includes(v)) merged.push(v);
            }
            const cap = selectedEavAttr.maxValues > 1 ? selectedEavAttr.maxValues : Infinity;
            vals = merged.slice(0, cap);
          } else {
            vals = isMultiValueAttr(selectedEavAttr)
              ? value.split("\n").map((s) => s.trim()).filter(Boolean)
              : [value];
          }
          body = {
            attributeValues: vals.map((textValue, valueIndex) => ({
              attributeDefinitionId: selectedEavAttr.id,
              valueIndex,
              textValue,
            })),
          };
        } else {
          // Core field — field key maps directly to ProductRecord column
          body = { [field]: value };
        }

        const res = await fetch(`/api/projects/${projectId}/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) { succeeded++; updated.push(await res.json()); }
        else failed++;
      })
    );

    setResult(`${succeeded} saved${failed ? `, ${failed} failed` : ""}`);
    setApplying(false);
    if (!failed) setTimeout(onClose, 1200);
    onApplied(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Bulk Edit — {selectedIds.length} product(s)</h3>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Field to edit</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900"
            value={field}
            onChange={(e) => { setField(e.target.value); setValue(""); setWriteMode(""); }}
          >
            <option value="">— select a field —</option>
            {fieldGroups.map((group) => (
              <optgroup key={group.name} label={group.name}>
                {group.fields.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {field && (
          <>
            {/* Write mode — required */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">
                Write mode <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["overwrite", "append"] as const).map((mode) => {
                  const disabled = mode === "append" && !supportsAppend;
                  return (
                    <label
                      key={mode}
                      className={cn(
                        "flex items-start gap-2.5 border rounded-lg px-3 py-2.5 cursor-pointer transition-colors",
                        writeMode === mode
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300",
                        disabled && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <input
                        type="radio"
                        name="writeMode"
                        value={mode}
                        checked={writeMode === mode}
                        disabled={disabled}
                        onChange={() => setWriteMode(mode)}
                        className="mt-0.5 accent-blue-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {mode === "overwrite" ? "Overwrite" : "Append"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {mode === "overwrite"
                            ? "Replace existing value with the new value"
                            : supportsAppend
                              ? "Add to existing values without removing any"
                              : "Only available for multi-value attributes"}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">New value</label>
              {selectedAnyAttr?.lovItems?.length && selectedEavAttr && isMultiValueAttr(selectedEavAttr) ? (
                <div className="border border-gray-300 rounded-md overflow-hidden max-h-44 overflow-y-auto">
                  {selectedAnyAttr.lovItems.map((l) => {
                    const currentVals = value ? value.split("\n").filter(Boolean) : [];
                    const checked = currentVals.includes(l.value);
                    return (
                      <label key={l.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm text-gray-800">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={checked}
                          onChange={(e) => {
                            const next = checked
                              ? currentVals.filter((v) => v !== l.value)
                              : [...currentVals, l.value];
                            setValue(next.join("\n"));
                          }}
                        />
                        {l.label}
                      </label>
                    );
                  })}
                </div>
              ) : selectedAnyAttr?.lovItems?.length ? (
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">—</option>
                  {selectedAnyAttr.lovItems.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              ) : selectedEavAttr && isMultiValueAttr(selectedEavAttr) ? (
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={`One value per line (max ${selectedEavAttr.maxValues})`}
                />
              ) : (
                <input
                  type={selectedAnyAttr?.attributeType === "NUMBER" || selectedAnyAttr?.attributeType === "DECIMAL" ? "number" : "text"}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter value..."
                />
              )}
            </div>
          </>
        )}

        {result && <p className="text-xs text-gray-600">{result}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            onClick={apply}
            disabled={!field || !writeMode || applying}
          >
            {applying ? "Applying…" : "Apply to All Selected"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Saved Views ──────────────────────────────────────────────────────────────
// Named grid configurations (sort, column visibility, pinning, search) saved
// per project in localStorage — same persistence approach as column widths.

type SavedViewState = {
  sorting?: SortingState;
  columnVisibility?: VisibilityState;
  columnPinning?: ColumnPinningState;
  globalFilter?: string;
};
type SavedView = SavedViewState & { name: string };

function SavedViewsMenu({
  projectId,
  getCurrentView,
  applyView,
}: {
  projectId: string;
  getCurrentView: () => SavedViewState;
  applyView: (v: SavedViewState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [newName, setNewName] = useState("");
  const storageKey = `grid-views-${projectId}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setViews(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [storageKey]);

  const persist = (next: SavedView[]) => {
    setViews(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const saveCurrent = () => {
    const name = newName.trim();
    if (!name) return;
    const next = [...views.filter((v) => v.name !== name), { name, ...getCurrentView() }];
    persist(next);
    setNewName("");
  };

  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
        <Bookmark className="h-3.5 w-3.5" />
        Views
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 w-64 bg-white border border-gray-200 rounded-lg shadow-xl p-2 space-y-1">
            {views.length === 0 && (
              <p className="text-xs text-gray-400 px-2 py-1.5">No saved views yet.</p>
            )}
            {views.map((v) => (
              <div key={v.name} className="flex items-center gap-1 group">
                <button
                  className="flex-1 text-left text-sm text-gray-700 px-2 py-1.5 rounded hover:bg-gray-100 truncate"
                  onClick={() => { applyView(v); setOpen(false); }}
                >
                  {v.name}
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400"
                  title="Delete view"
                  onClick={() => persist(views.filter((x) => x.name !== v.name))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-2 mt-1 flex items-center gap-1">
              <input
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Save current as…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
              />
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={saveCurrent} disabled={!newName.trim()}>
                Save
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
