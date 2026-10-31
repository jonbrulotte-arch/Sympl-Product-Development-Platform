import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { deleteProducts, MAX_BULK_DELETE } from "@/lib/product-delete";

// Permanently deletes the given catalog products (Products page bulk action).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.role, "products:delete"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x: unknown) => typeof x === "string"))] as string[] : [];
  if (ids.length === 0) return NextResponse.json({ error: "No products selected" }, { status: 400 });
  if (ids.length > MAX_BULK_DELETE) return NextResponse.json({ error: `At most ${MAX_BULK_DELETE} products per delete` }, { status: 400 });

  return NextResponse.json(await deleteProducts(session.user.id, ids));
}
