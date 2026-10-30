import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { categoryPaths } from "@/lib/category-paths";
import { REQUEST_INCLUDE } from "@/lib/category-requests";
import { RequestsTable } from "./requests-table";

export default async function CategoryRequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [isReviewer, canRequest] = await Promise.all([
    can(session.user.role, "categories:review_requests"),
    can(session.user.role, "categories:request"),
  ]);
  if (!isReviewer && !canRequest) redirect("/dashboard");

  const { tab: rawTab } = await searchParams;
  const tab = isReviewer ? (rawTab === "mine" || rawTab === "all" ? rawTab : "pending") : "mine";

  const [requests, categories, pendingCount] = await Promise.all([
    prisma.categoryRequest.findMany({
      where: tab === "pending" ? { status: "PENDING" } : tab === "mine" ? { requestedById: session.user.id } : {},
      include: REQUEST_INCLUDE,
      orderBy: tab === "pending" ? { createdAt: "asc" } : { createdAt: "desc" },
      take: 500,
    }),
    prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    isReviewer ? prisma.categoryRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
  ]);
  const pathById = new Map(categoryPaths(categories).map((p) => [p.id, p.label]));
  const rows = requests.map((r) => ({
    id: r.id,
    name: r.name,
    parentPath: [r.parentCategoryId ? pathById.get(r.parentCategoryId) : null, r.newParentName ? `${r.newParentName} (new)` : null].filter(Boolean).join(" > "),
    requester: r.requestedBy.name ?? r.requestedBy.email,
    attributeCount: Array.isArray(r.attributes) ? r.attributes.length : 0,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));

  const tabs = isReviewer
    ? [{ key: "pending", label: `Pending${pendingCount ? ` (${pendingCount})` : ""}` }, { key: "mine", label: "My Requests" }, { key: "all", label: "All" }]
    : [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Category Requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isReviewer ? "Review requests for new categories and the attributes they need." : "Request new categories and the attributes products in them need."}
          </p>
        </div>
        {canRequest && (
          <Link href="/category-requests/new"><Button><Plus className="h-4 w-4 mr-1.5" /> New Request</Button></Link>
        )}
      </div>
      {tabs.length > 0 && (
        <div className="inline-flex h-9 items-center rounded-lg bg-gray-100 p-1 text-gray-500">
          {tabs.map((t) => (
            <Link key={t.key} href={`/category-requests?tab=${t.key}`}
              className={`rounded-md px-3 py-1 text-sm font-medium ${tab === t.key ? "bg-white text-gray-900 shadow" : "hover:text-gray-700"}`}>
              {t.label}
            </Link>
          ))}
        </div>
      )}
      <RequestsTable rows={rows} empty={tab === "pending" ? "No requests waiting for review." : "No requests yet."} />
    </div>
  );
}
