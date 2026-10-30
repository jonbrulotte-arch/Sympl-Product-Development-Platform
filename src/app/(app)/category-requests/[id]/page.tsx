import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parentPathFor, REQUEST_INCLUDE } from "@/lib/category-requests";
import { RequestDetailClient } from "./request-detail-client";

export default async function CategoryRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;
  const [request, isReviewer] = await Promise.all([
    prisma.categoryRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE }),
    can(session.user.role, "categories:review_requests"),
  ]);
  if (!request || (!isReviewer && request.requestedById !== session.user.id)) notFound();

  const [history, categories, parentPath] = await Promise.all([
    prisma.activityLog.findMany({
      where: { entityType: "CategoryRequest", entityId: id },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true, parentId: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    parentPathFor(request),
  ]);

  return (
    <RequestDetailClient
      request={JSON.parse(JSON.stringify(request))}
      history={JSON.parse(JSON.stringify(history))}
      categories={categories}
      parentPath={parentPath}
      isReviewer={isReviewer}
      isOwner={request.requestedById === session.user.id}
    />
  );
}
