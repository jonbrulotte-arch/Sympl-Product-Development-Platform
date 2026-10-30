import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkProjectAccess } from "@/lib/project-access";
import { linkProduct, projectLinksOf } from "@/lib/product-catalog";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ productId: string }> };

// Adds the product to a project the caller can edit.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { productId } = await params;
  const { projectId } = await req.json().catch(() => ({}));
  if (typeof projectId !== "string" || !projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const access = await checkProjectAccess(projectId, session, "edit");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!(await prisma.productRecord.findUnique({ where: { id: productId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await linkProduct(projectId, productId, session.user.id);
  logActivity({
    userId: session.user.id, action: "UPDATED", entityType: "ProductRecord", entityId: productId,
    projectId, productId, fieldKey: "project", newValue: "Added to project", source: "Products",
  }).catch(() => {});
  return NextResponse.json(await projectLinksOf(productId), { status: 201 });
}

// Removes the product from a project (the catalog record stays).
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { productId } = await params;
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const access = await checkProjectAccess(projectId, session, "edit");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await prisma.projectProduct.updateMany({ where: { projectId, productId }, data: { isArchived: true } });
  logActivity({
    userId: session.user.id, action: "DELETED", entityType: "ProductRecord", entityId: productId,
    projectId, productId, fieldKey: "project", newValue: "Removed from project", source: "Products",
  }).catch(() => {});
  return NextResponse.json(await projectLinksOf(productId));
}
