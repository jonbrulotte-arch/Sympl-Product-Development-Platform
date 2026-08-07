"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { formatDate, getInitials } from "@/lib/utils";
import { Package, Calendar, Search, LayoutGrid, List, Loader2 } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";

type ProjectItem = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  brand: string | null;
  retailer: string | null;
  channel: string | null;
  targetLaunchDate: Date | null;
  owner: { id: string; name: string | null; email: string };
  category: { id: string; name: string } | null;
  members: { id: string; user: { id: string; name: string | null; email: string } }[];
  _count: { products: number };
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "IN_PRODUCTION", label: "In Production" },
  { value: "LAUNCHED", label: "Launched" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function ProjectsClient({ initialProjects }: { initialProjects: ProjectItem[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<"card" | "list">("card");
  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(initialProjects.length);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProjects = useCallback(async (q: string, status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "200" });
      if (q) params.set("search", q);
      if (status) params.set("status", status);
      const res = await fetch(`/api/projects?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.data);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchProjects(search, statusFilter);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, statusFilter, fetchProjects]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 text-sm">
            {loading ? "Searching…" : `${projects.length}${total > projects.length ? ` of ${total}` : ""} project${total !== 1 ? "s" : ""}`}
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          {loading ? (
            <Loader2 className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 animate-spin" />
          ) : (
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          )}
          <Input
            placeholder="Search projects, products, part numbers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
          <button
            onClick={() => setView("card")}
            className={`p-2 ${view === "card" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700"}`}
            title="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`p-2 ${view === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700"}`}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {projects.length === 0 && !search && !statusFilter ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-1">No projects yet</h3>
          <p className="text-gray-500 text-sm mb-6">Create your first product development project to get started.</p>
          <CreateProjectDialog />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          No projects match your search.
        </div>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:shadow-md transition-shadow h-full cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-gray-900 leading-tight line-clamp-2">{project.name}</h3>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  {project.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{project.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-auto">
                    {project.brand && <span className="font-medium text-gray-700">{project.brand}</span>}
                    {project.category && <span>{project.category.name}</span>}
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Package className="h-3.5 w-3.5" />
                        {project._count.products} products
                      </span>
                      {project.targetLaunchDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(project.targetLaunchDate)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <div
                        className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium"
                        title={project.owner.name ?? project.owner.email}
                      >
                        {getInitials(project.owner.name)}
                      </div>
                      {project.members.slice(0, 2).map((m) => (
                        <div
                          key={m.id}
                          className="h-6 w-6 rounded-full bg-gray-100 text-gray-600 text-xs flex items-center justify-center font-medium -ml-1"
                          title={m.user.name ?? m.user.email}
                        >
                          {getInitials(m.user.name)}
                        </div>
                      ))}
                      {project.members.length > 2 && (
                        <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center -ml-1">
                          +{project.members.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Project</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Brand / Category</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Products</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Launch Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${project.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {project.name}
                    </Link>
                    {project.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{project.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ProjectStatusBadge status={project.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {project.brand && <span className="font-medium">{project.brand}</span>}
                    {project.brand && project.category && <span className="text-gray-300 mx-1">/</span>}
                    {project.category && <span>{project.category.name}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{project._count.products}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {project.targetLaunchDate ? formatDate(project.targetLaunchDate) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium">
                        {getInitials(project.owner.name)}
                      </div>
                      <span className="text-gray-700">{project.owner.name ?? project.owner.email}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
