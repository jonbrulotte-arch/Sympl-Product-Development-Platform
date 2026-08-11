import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

// Persists a drag-reorder of the category tree. The client sends the full
// ordering of whichever sibling group changed, so sortOrder values are always
// rewritten as a contiguous 0..n-1 run rather than nudged — no drift, and no
// dependence on what the previous values happened to be.
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:categories"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: { id: string; sortOrder: number; parentId?: string | null }[] =
    Array.isArray(body.updates) ? body.updates : [];

  if (updates.length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }
  if (updates.some((u) => typeof u.id !== "string" || typeof u.sortOrder !== "number")) {
    return NextResponse.json({ error: "Each update needs an id and a numeric sortOrder" }, { status: 400 });
  }

  // Reparenting has to be checked, not trusted: a category may not become its
  // own descendant, and the UI only supports two levels.
  const reparenting = updates.filter((u) => u.parentId !== undefined);
  if (reparenting.length > 0) {
    const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
    const parentOf = new Map(all.map((c) => [c.id, c.parentId]));

    for (const u of reparenting) {
      if (u.parentId === u.id) {
        return NextResponse.json({ error: "A category cannot be its own parent" }, { status: 400 });
      }
      if (u.parentId) {
        // Target parent must be a root, keeping the tree two levels deep.
        if (parentOf.get(u.parentId)) {
          return NextResponse.json(
            { error: "Sub-categories cannot be nested more than one level deep" },
            { status: 400 }
          );
        }
        // Walk up from the new parent; hitting the moved node means a cycle.
        let cursor: string | null | undefined = u.parentId;
        const seen = new Set<string>();
        while (cursor && !seen.has(cursor)) {
          if (cursor === u.id) {
            return NextResponse.json({ error: "That move would nest a category inside itself" }, { status: 400 });
          }
          seen.add(cursor);
          cursor = parentOf.get(cursor);
        }
      } else if (all.some((c) => c.parentId === u.id)) {
        // Promoting to root is fine — it already has children, which stay put.
      }
    }
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.category.update({
        where: { id: u.id },
        data: {
          sortOrder: u.sortOrder,
          ...(u.parentId !== undefined ? { parentId: u.parentId } : {}),
        },
      })
    )
  );

  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true, projects: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(categories);
}
