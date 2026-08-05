import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CORE_FIELD_KEYS } from "@/lib/core-fields";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const coreOnly = searchParams.get("coreOnly") === "true";
  const salsifyOnly = searchParams.get("salsifyOnly") === "true";

  const attributes = await prisma.attributeDefinition.findMany({
    where: {
      isActive: true,
      ...(coreOnly ? { isCore: true } : {}),
      ...(salsifyOnly ? { salsifyEnabled: true, salsifyPropertyId: { not: null } } : {}),
      ...(categoryId ? { OR: [{ isCore: true }, { categoryId }] } : {}),
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

  // Duplicate labels break the grid, export, and import: values end up stored
  // under one definition while columns bind to the other, and export headers
  // (which are labels) can no longer round-trip unambiguously.
  const label = String(body.label ?? "").trim();
  if (label) {
    const dupLabel = await prisma.attributeDefinition.findFirst({
      where: { label: { equals: label, mode: "insensitive" }, isActive: true },
      select: { key: true },
    });
    if (dupLabel) {
      return NextResponse.json(
        { error: `An active attribute labeled "${label}" already exists (key: ${dupLabel.key}). Duplicate labels make import/export columns ambiguous — rename or deactivate the other attribute first.` },
        { status: 409 }
      );
    }
  }

  try {
    // A definition whose key matches a core product field IS that field's
    // definition — flag it so it can't be deleted out from under the column
    const attribute = await prisma.attributeDefinition.create({
      data: { ...body, key, isCore: CORE_FIELD_KEYS.includes(key) },
    });
    // Attribute definitions shape project grids and product edit forms —
    // invalidate cached pages so in-app navigation picks up the new column.
    revalidatePath("/", "layout");
    return NextResponse.json(attribute, { status: 201 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: `An attribute with the key "${key}" already exists. Choose a different key.` }, { status: 409 });
    }
    throw e;
  }
}
