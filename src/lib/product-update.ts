// Shared product save: core fields + EAV attribute replacement + audit log.
// Used by the project grid route and the catalog route; callers authorize first.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { normalizePartNumber } from "@/lib/product-catalog";

type Updated = NonNullable<Awaited<ReturnType<typeof prisma.productRecord.findUnique>>>;

export async function applyProductPatch(opts: {
  req: Request;
  productId: string;
  userId: string;
  /** Project the edit came from (activity log + project freshness); null for catalog edits. */
  projectId: string | null;
  decorate: (p: Updated) => Promise<Record<string, unknown>>;
}): Promise<NextResponse> {
  const { req, productId, projectId, decorate } = opts;
  const session = { user: { id: opts.userId } };
  const body = await req.json();
  const { attributeValues: attrValues, clearAttributeIds, source: reqSource, ...coreData } = body;
  const activitySource: string = reqSource ?? "Product Record";

  const parsed = productSchema.partial().safeParse(coreData);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const oldProduct = await prisma.productRecord.findUnique({ where: { id: productId } });
  if (!oldProduct) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Part numbers are unique across the catalog; a clash offers the existing product instead.
  if ("partNumber" in parsed.data) {
    const pn = normalizePartNumber(parsed.data.partNumber);
    parsed.data.partNumber = pn ?? null;
    if (pn && pn !== oldProduct.partNumber) {
      const clash = await prisma.productRecord.findUnique({ where: { partNumber: pn }, select: { id: true, partNumber: true, itemName: true } });
      if (clash && clash.id !== productId) {
        return NextResponse.json({ error: "Part number already exists", existingProduct: clash }, { status: 409 });
      }
    }
  }

  // Replace EAV attributes FIRST so the final update/include returns up-to-date attributeValues.
  // We delete-then-create (not upsert) so removed values don't linger in the DB.
  // Skipped entirely when the incoming rows are identical to what's stored —
  // a no-op save must not bump updatedAt, or Salsify drift detection would
  // report "Changed" for an edit that changed nothing.
  let eavChanged = false;
  if (attrValues && Array.isArray(attrValues)) {
    type AvInput = { attributeDefinitionId: string; valueIndex?: number; textValue?: string; numberValue?: number; booleanValue?: boolean };
    const incoming = attrValues as AvInput[];
    // Collect IDs from both the incoming values AND the explicit clear list
    // so that clearing a field (empty attributeValues) still deletes old rows.
    const explicitClearIds: string[] = Array.isArray(clearAttributeIds) ? clearAttributeIds : [];
    const affectedAttrIds = [...new Set([
      ...incoming.map((av) => av.attributeDefinitionId),
      ...explicitClearIds,
    ])];
    if (affectedAttrIds.length > 0) {
      const existing = await prisma.productAttributeValue.findMany({
        where: { productId, attributeDefinitionId: { in: affectedAttrIds } },
      });
      const fingerprint = (rows: { attributeDefinitionId: string; valueIndex?: number | null; textValue?: string | null; numberValue?: unknown; booleanValue?: boolean | null }[]) =>
        rows
          .map((r) => [r.attributeDefinitionId, r.valueIndex ?? 0, r.textValue ?? "", r.numberValue == null ? "" : Number(r.numberValue), r.booleanValue ?? ""].join("\u001f"))
          .sort()
          .join("\n");
      eavChanged = fingerprint(incoming) !== fingerprint(existing);

      if (eavChanged) {
        await prisma.productAttributeValue.deleteMany({
          where: { productId, attributeDefinitionId: { in: affectedAttrIds } },
        });
        if (incoming.length > 0) {
          await prisma.productAttributeValue.createMany({
            data: incoming.map((av) => ({
              productId,
              attributeDefinitionId: av.attributeDefinitionId,
              valueIndex: av.valueIndex ?? 0,
              textValue: av.textValue,
              numberValue: av.numberValue,
              booleanValue: av.booleanValue,
            })),
          });
        }
      }
    }
  }

  // Same no-op guard for core fields: compare against the stored record and
  // only count fields whose value actually differs.
  const normalize = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v));
  const coreChanged = Object.entries(parsed.data).some(
    ([k, v]) => normalize(oldProduct[k as keyof typeof oldProduct]) !== normalize(v)
  );

  const includeShape = {
    attributeValues: { include: { attributeDefinition: true } },
    category: true,
    createdBy: { select: { id: true, name: true, email: true, image: true, role: true } },
    updatedBy: { select: { id: true, name: true, email: true, image: true, role: true } },
  } as const;

  const updated = coreChanged || eavChanged
    ? await prisma.productRecord.update({
        where: { id: productId },
        data: {
          ...parsed.data,
          updatedById: session.user.id,
        },
        include: includeShape,
      })
    : (await prisma.productRecord.findUnique({ where: { id: productId }, include: includeShape }))!;

  // Log field-level changes — fire-and-forget so missing ActivityLog table doesn't crash saves
  const changedFields = Object.keys(parsed.data) as (keyof typeof parsed.data)[];
  for (const field of changedFields) {
    const oldVal = oldProduct?.[field as keyof typeof oldProduct];
    const newVal = parsed.data[field];
    if (String(oldVal) !== String(newVal)) {
      logActivity({
        userId: session.user.id,
        action: "UPDATED",
        entityType: "ProductRecord",
        entityId: productId,
        projectId: projectId ?? undefined,
        productId,
        fieldKey: field,
        oldValue: oldVal != null ? String(oldVal) : undefined,
        newValue: newVal != null ? String(newVal) : undefined,
        source: activitySource,
      }).catch(() => {});
    }
  }

  if (coreChanged || eavChanged) {
    if (projectId) prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } }).catch(() => {});
  }

  return NextResponse.json(await decorate(updated));
}
