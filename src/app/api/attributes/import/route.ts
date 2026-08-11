import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseUploadedWorkbook } from "@/lib/xlsx-parse";

const VALID_TYPES = ["TEXT","TEXTAREA","NUMBER","DECIMAL","BOOLEAN","DATE","SELECT","MULTI_SELECT","URL","EMAIL","UPC","GTIN"];
const VALID_REQS  = ["REQUIRED","CONDITIONAL","OPTIONAL"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  let matrix: string[][];
  try {
    const wb = await parseUploadedWorkbook(await file.arrayBuffer());
    matrix = wb.getRows(wb.sheetNames[0]);
  } catch {
    return NextResponse.json({ error: "Could not parse file — ensure it is a valid .xlsx workbook" }, { status: 400 });
  }

  // First row is the header; convert remaining rows to keyed objects
  const headerRow = (matrix[0] ?? []).map((h) => h?.toString().trim() ?? "");
  const rows: Record<string, unknown>[] = matrix.slice(1)
    .filter((r) => r.some((c) => c !== "" && c != null))
    .map((r) => {
      const obj: Record<string, unknown> = {};
      // Skip empty cells so `?? default` fallbacks behave as before
      headerRow.forEach((h, i) => { if (h && r[i] !== "" && r[i] != null) obj[h] = r[i]; });
      return obj;
    });

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
        const created2 = await prisma.attributeDefinition.create({ data: { key, ...data, isCore: false } });
        attrId = created2.id;
        created++;
      }

      // Upsert LOV items. New sheets use `;;` between entries and `::` between
      // value and label so category paths like "Power Tool Accessories|Circular
      // Saw Blades" survive intact. Legacy sheets using `|` and `:` still load
      // when neither of the new separators appears anywhere in the cell.
      if (row.lovValues) {
        const raw = String(row.lovValues);
        const legacy = !raw.includes(";;") && !raw.includes("::");
        const entrySep = legacy ? "|" : ";;";
        const pairSep = legacy ? ":" : "::";
        const entries = raw.split(entrySep).map((e) => e.trim()).filter(Boolean);
        for (let i = 0; i < entries.length; i++) {
          const [value, ...rest] = entries[i].split(pairSep).map((s) => s.trim());
          const label = rest.join(pairSep) || value;
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
