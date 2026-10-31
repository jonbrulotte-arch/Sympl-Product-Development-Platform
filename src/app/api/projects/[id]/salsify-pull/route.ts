import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inProject } from "@/lib/product-catalog";
import { can } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { runSalsifyPull } from "@/lib/salsify-pull";

// Bulk pull FROM Salsify into the project grid. The push route
// (salsify-sync) is the mirror image of this; both share the core-field map
// in lib/salsify-fields so the two directions can't drift apart.
//
// POST with { dryRun: true } returns the change report the confirmation
// screen renders. POST with { dryRun: false, attributeKeys: [...] } applies
// only the attributes the user left checked.

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await can(session.user.role, "products:pull_salsify"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;
  // Writing product data needs edit rights, not just visibility — a pull
  // overwrites the grid.
  const access = await checkProjectAccess(projectId, session, "edit");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dryRun !== false;
  const productIds: string[] | null =
    Array.isArray(body.productIds) && body.productIds.length > 0 ? body.productIds : null;
  // On apply, only these attribute keys are written. Absent on a dry run,
  // where every mapped attribute is reported.
  const attributeKeys: string[] | null =
    Array.isArray(body.attributeKeys) ? body.attributeKeys : null;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, categoryId: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const products = await prisma.productRecord.findMany({
    where: {
      ...inProject(projectId),
      isArchived: false,
      ...(productIds ? { id: { in: productIds } } : {}),
    },
    include: { attributeValues: true },
  });

  const result = await runSalsifyPull({
    session: session as Parameters<typeof runSalsifyPull>[0]["session"],
    products, fallbackCategoryId: project.categoryId, dryRun, attributeKeys,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (dryRun) return NextResponse.json(result.body);

  const { productsUpdated, fieldsUpdated } = result.body as { productsUpdated: number; fieldsUpdated: number };
  logActivity({
    userId: session.user.id,
    action: "UPDATED",
    entityType: "Project",
    entityId: projectId,
    projectId,
    newValue: `Pulled ${fieldsUpdated} value${fieldsUpdated !== 1 ? "s" : ""} from Salsify across ${productsUpdated} product${productsUpdated !== 1 ? "s" : ""}`,
    source: "Salsify Pull",
  }).catch(() => {});

  return NextResponse.json(result.body);
}
