import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CORE_FIELD_KEYS } from "@/lib/core-fields";
import { expandWithAncestors } from "@/lib/category-tree";
import { isQcDimsColumn } from "@/lib/qc-dims";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const projectId = searchParams.get("projectId");
  const coreOnly = searchParams.get("coreOnly") === "true";
  const salsifyOnly = searchParams.get("salsifyOnly") === "true";

  // projectId scopes category-specific attributes to the project's category
  // tree (project category + product categories + their ancestors), mirroring
  // the grid and export. Without it, attributes from unrelated categories that
  // share a label become ambiguous in import column mapping.
  let projectCategoryFilter: { OR: ({ categoryId: null } | { categoryId: { in: string[] } })[] } | null = null;
  if (projectId) {
    const [project, products] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { categoryId: true } }),
      prisma.productRecord.findMany({
        where: { projectId, isArchived: false },
        select: { categoryId: true },
        distinct: ["categoryId"],
      }),
    ]);
    const categoryIds = await expandWithAncestors([
      project?.categoryId,
      ...products.map((p) => p.categoryId),
    ]);
    projectCategoryFilter = {
      OR: [
        { categoryId: null },
        ...(categoryIds.length > 0 ? [{ categoryId: { in: categoryIds } }] : []),
      ],
    };
  }

  const attributes = await prisma.attributeDefinition.findMany({
    where: {
      isActive: true,
      ...(coreOnly ? { isCore: true } : {}),
      ...(salsifyOnly ? { salsifyEnabled: true, salsifyPropertyId: { not: null } } : {}),
      ...(categoryId ? { OR: [{ isCore: true }, { categoryId }] } : {}),
      ...(projectCategoryFilter ?? {}),
    },
    include: {
      section: true,
      lovItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ section: { sortOrder: "asc" } }, { sectionId: "asc" }, { sortOrder: "asc" }],
  });

  return NextResponse.json(attributes);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  const key = String(body.key ?? "").trim();
  if (!key) {
    return NextResponse.json({ error: "A key is required" }, { status: 400 });
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
    return NextResponse.json(
      { error: "Key must start with a letter and contain only letters, numbers, and underscores" },
      { status: 400 }
    );
  }

  // Pre-check for a clear message; the catch below still guards the race.
  const existing = await prisma.attributeDefinition.findUnique({ where: { key }, select: { id: true, label: true } });
  if (existing) {
    return NextResponse.json(
      { error: `An attribute with the key "${key}" already exists${existing.label ? ` (${existing.label})` : ""}. Choose a different key.` },
      { status: 409 }
    );
  }

  // Duplicate labels within the same scope break the grid, export, and
  // import: values end up stored under one definition while columns bind to
  // the other. Same label across two different categories is fine — those
  // definitions never appear in the same project's columns.
  const label = String(body.label ?? "").trim();
  const newCategoryId: string | null = body.categoryId ?? null;
  if (label) {
    const dupLabel = await prisma.attributeDefinition.findFirst({
      where: {
        label: { equals: label, mode: "insensitive" },
        isActive: true,
        ...(newCategoryId ? { OR: [{ categoryId: null }, { categoryId: newCategoryId }] } : {}),
      },
      select: { key: true },
    });
    if (dupLabel) {
      return NextResponse.json(
        { error: `An active attribute labeled "${label}" already exists in the same scope (key: ${dupLabel.key}). Duplicate labels make import/export columns ambiguous — rename it, or scope both attributes to different categories.` },
        { status: 409 }
      );
    }
  }

  // POST spreads the whole body, so an unrecognized mapping would land in the
  // column and silently never export. There is no zod schema here to catch it.
  if (body.qcDimsColumn && !isQcDimsColumn(body.qcDimsColumn)) {
    return NextResponse.json({ error: "Unknown QC Dims column" }, { status: 400 });
  }

  try {
    // A definition whose key matches a core product field IS that field's
    // definition — flag it so it can't be deleted out from under the column.
    // Explicit allowlist — never spread the raw body into create().
    const attribute = await prisma.attributeDefinition.create({
      data: {
        key,
        label: body.label ?? key,
        description: body.description || null,
        attributeType: body.attributeType ?? "TEXT",
        requirement: body.requirement ?? "OPTIONAL",
        maxValues: body.maxValues !== undefined ? Number(body.maxValues) : 1,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : 0,
        categoryId: body.categoryId || null,
        sectionId: body.sectionId || null,
        defaultValue: body.defaultValue || null,
        unit: body.unit || null,
        validationRules: body.validationRules ?? undefined,
        salsifyEnabled: body.salsifyEnabled ?? false,
        salsifyPropertyId: body.salsifyPropertyId || null,
        salsifyLocale: body.salsifyLocale || null,
        qcDimsColumn: body.qcDimsColumn || null,
        isCore: CORE_FIELD_KEYS.includes(key),
      },
    });
    // Attribute definitions shape project grids and product edit forms —
    // invalidate cached pages so in-app navigation picks up the new column.
    revalidatePath("/", "layout");
    return NextResponse.json(attribute, { status: 201 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      // Both `key` and `qcDimsColumn` are unique — name the right one.
      const target = (e as { meta?: { target?: string[] | string } }).meta?.target;
      const fields = Array.isArray(target) ? target : [target ?? ""];
      if (fields.includes("qcDimsColumn")) {
        return NextResponse.json({ error: `"${body.qcDimsColumn}" is already mapped to another attribute. A QC Dims column can only be fed by one attribute.` }, { status: 409 });
      }
      return NextResponse.json({ error: `An attribute with the key "${key}" already exists. Choose a different key.` }, { status: 409 });
    }
    throw e;
  }
}
