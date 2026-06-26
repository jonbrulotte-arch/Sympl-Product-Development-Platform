import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

const VALID_TYPES = ["TEXT","TEXTAREA","NUMBER","DECIMAL","BOOLEAN","DATE","SELECT","MULTI_SELECT","URL","EMAIL","UPC","GTIN"];
const VALID_REQS  = ["REQUIRED","CONDITIONAL","OPTIONAL"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !["ADMIN","PRODUCT_MANAGER"].includes(session.user.role!)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  let created = 0, updated = 0;
  const errors: string[] = [];

  // Cache lookups to avoid N+1 on repeated section/category names
  const sectionCache = new Map<string, string | null>();
  const categoryCache = new Map<string, string | null>();

  const lookupSection = async (name: string): Promise<string | null> => {
    if (!name) return null;
    if (!sectionCache.has(name)) {
      const s = await prisma.attributeSection.findFirst({ where: { name } });
      sectionCache.set(name, s?.id ?? null);
    }
    return sectionCache.get(name)!;
  };

  const lookupCategory = async (name: string): Promise<string | null> => {
    if (!name) return null;
    if (!categoryCache.has(name)) {
      const c = await prisma.category.findFirst({ where: { name } });
      categoryCache.set(name, c?.id ?? null);
    }
    return categoryCache.get(name)!;
  };

  for (const row of rows) {
    const key = String(row.key ?? "").trim();
    if (!key) continue;

    try {
      const rawType = String(row.type ?? "TEXT").toUpperCase();
      const rawReq  = String(row.requirement ?? "OPTIONAL").toUpperCase();
      const attrType  = VALID_TYPES.includes(rawType) ? rawType : "TEXT";
      const req2 = VALID_REQS.includes(rawReq) ? rawReq : "OPTIONAL";
      const maxValues = Math.max(1, parseInt(String(row.maxValues ?? "1")) || 1);

      const sectionId  = await lookupSection(String(row.section ?? "").trim());
      const categoryId = await lookupCategory(String(row.category ?? "").trim());

      const rawSortOrder = row.sortOrder !== undefined && row.sortOrder !== "" ? parseInt(String(row.sortOrder)) : undefined;
      const sortOrder = rawSortOrder !== undefined && !isNaN(rawSortOrder) ? rawSortOrder : undefined;

      const data = {
        label: String(row.label ?? key),
        description: row.description ? String(row.description) : null,
        attributeType: attrType as never,
        requirement: req2 as never,
        maxValues,
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        salsifyEnabled: String(row.salsifyEnabled ?? "").toLowerCase() === "true",
        salsifyPropertyId: row.salsifyPropertyId ? String(row.salsifyPropertyId) : null,
        sectionId,
        categoryId,
        isActive: true,
      };

      const existing = await prisma.attributeDefinition.findUnique({ where: { key } });
      let attrId: string;
      if (existing) {
        await prisma.attributeDefinition.update({ where: { key }, data });
        attrId = existing.id;
        updated++;
      } else {
        const created2 = await prisma.attributeDefinition.create({ data: { key, ...data } });
        attrId = created2.id;
        created++;
      }

      // Upsert LOV items (format: value:label|value:label|...)
      if (row.lovValues) {
        const entries = String(row.lovValues).split("|").filter(Boolean);
        for (let i = 0; i < entries.length; i++) {
          const [value, ...rest] = entries[i].split(":").map((s) => s.trim());
          const label = rest.join(":") || value;
          if (!value) continue;
          await prisma.lovItem.upsert({
            where: { attributeDefinitionId_value: { attributeDefinitionId: attrId, value } },
            update: { label, sortOrder: i },
            create: { attributeDefinitionId: attrId, value, label, sortOrder: i },
          });
        }
      }
    } catch (e) {
      errors.push(`Row "${key}": ${String(e).slice(0, 120)}`);
    }
  }

  return NextResponse.json({ created, updated, total: rows.length, errors });
}
