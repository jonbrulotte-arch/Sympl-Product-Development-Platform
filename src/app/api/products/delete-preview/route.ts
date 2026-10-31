import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { deletePreview, MAX_BULK_DELETE } from "@/lib/product-delete";

// The products a delete would remove and the projects they'd leave, for the confirmation dialog.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.role, "products:delete"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, MAX_BULK_DELETE);
  return NextResponse.json({ products: await deletePreview(ids) });
}
