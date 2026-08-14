import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { can } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { salsifyFetch, describeFetchError } from "@/lib/salsify-http";
import {
  isCoreField, coreFieldType, readCoreField, coerceSalsifyValue, toBoolean,
  unwrapSalsifyValue, displayValue, sameValue,
} from "@/lib/salsify-fields";
import type { AttributeDefinition, ProductRecord, Prisma } from "@prisma/client";

// Bulk pull FROM Salsify into the project grid. The push route
// (salsify-sync) is the mirror image of this; both share the core-field map
// in lib/salsify-fields so the two directions can't drift apart.
//
// POST with { dryRun: true } returns the change report the confirmation
// screen renders. POST with { dryRun: false, attributeKeys: [...] } applies
// only the attributes the user left checked.

type Params = { params: Promise<{ id: string }> };

type Change = {
  productId: string;
  partNumber: string | null;
  itemName: string | null;
  current: string;
  incoming: string;
};

type Warning = {
  attributeKey: string;
  attributeLabel: string;
  partNumber: string | null;
  value: string;
  reason: string;
};

// Per-product outcome, so "why did only one of my three part numbers return
// anything?" is answerable from the confirmation screen instead of by guesswork.
type ProductResult = {
  partNumber: string | null;
  status: "found" | "not_found" | "error" | "no_part_number";
  httpStatus?: number;
  detail?: string;
  /** Mapped Salsify properties actually present on the returned record. */
  propsPresent: number;
  /** Mapped properties the record didn't carry — a sample, for diagnosis. */
  propsMissing: string[];
  /** Mapped properties skipped because the attribute is scoped to another category. */
  propsOutOfCategory: number;
  changeCount: number;
};

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

  const resolved = await resolveSalsifyCredentials(session.user.id);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const config = resolved.credentials;

  const salsifyAttrs = await prisma.attributeDefinition.findMany({
    where: { salsifyEnabled: true, isActive: true, salsifyPropertyId: { not: null } },
    include: { section: { select: { name: true } } },
  });
  if (salsifyAttrs.length === 0) {
    return NextResponse.json(
      { error: "No Salsify-enabled attributes are configured. Set them up in Admin → Attributes." },
      { status: 400 },
    );
  }

  const products = await prisma.productRecord.findMany({
    where: {
      projectId,
      isArchived: false,
      ...(productIds ? { id: { in: productIds } } : {}),
    },
    include: { attributeValues: true },
  });

  const withPartNumbers = products.filter((p) => p.partNumber?.trim());
  if (withPartNumbers.length === 0) {
    return NextResponse.json(
      { error: "No products in this grid have a Part Number, so there is nothing to look up in Salsify." },
      { status: 400 },
    );
  }

  // Category scoping mirrors the push route: an attribute bound to a category
  // only applies to products in that category or a descendant of it.
  const allCats = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const parentOf = new Map(allCats.map((c) => [c.id, c.parentId]));
  const categoryWithAncestors = (start: string | null) => {
    const set = new Set<string>();
    let current: string | null | undefined = start;
    while (current && !set.has(current)) {
      set.add(current);
      current = parentOf.get(current);
    }
    return set;
  };

  // ── Fetch every product from Salsify ────────────────────────────────────
  const remoteById = new Map<string, Record<string, unknown>>();
  const notFound: string[] = [];
  const fetchErrors: string[] = [];

  // Modest concurrency — enough to keep a few-hundred-row grid quick without
  // tripping Salsify's rate limiting.
  const resultByProduct = new Map<string, ProductResult>();
  for (const p of products) {
    resultByProduct.set(p.id, {
      partNumber: p.partNumber,
      status: p.partNumber?.trim() ? "error" : "no_part_number",
      propsPresent: 0, propsMissing: [], propsOutOfCategory: 0, changeCount: 0,
    });
  }

  const CONCURRENCY = 6;
  for (let i = 0; i < withPartNumbers.length; i += CONCURRENCY) {
    const batch = withPartNumbers.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (product) => {
        const partNumber = product.partNumber!.trim();
        const result = resultByProduct.get(product.id)!;
        try {
          const res = await salsifyFetch(
            `https://app.salsify.com/api/v1/orgs/${config.organizationId}/products/${encodeURIComponent(partNumber)}`,
            { headers: { Authorization: `Bearer ${config.apiKey}` } },
          );
          result.httpStatus = res.status;
          if (res.status === 404) {
            notFound.push(partNumber);
            result.status = "not_found";
            result.detail = "Salsify has no record whose ID is this Part Number";
            return;
          }
          if (!res.ok) {
            const text = await res.text();
            fetchErrors.push(`${partNumber}: Salsify returned ${res.status} ${text.slice(0, 120)}`);
            result.status = "error";
            result.detail = `Salsify returned ${res.status}: ${text.slice(0, 120)}`;
            return;
          }
          remoteById.set(product.id, await res.json());
          result.status = "found";
        } catch (err) {
          const why = describeFetchError(err);
          fetchErrors.push(`${partNumber}: ${why}`);
          result.status = "error";
          result.detail = why;
        }
      }),
    );
  }

  // ── Compute the incoming value for every (product, attribute) pair ──────
  const incomingByProduct = new Map<string, Map<string, unknown>>();
  const attrChanges = new Map<string, Change[]>();
  // Values Salsify sent that the target field can't represent. Surfaced on the
  // confirmation screen so a bad property mapping is visible instead of silent.
  const warnings: Warning[] = [];

  const currentEavValue = (product: (typeof products)[number], attr: AttributeDefinition) => {
    const values = product.attributeValues
      .filter((v) => v.attributeDefinitionId === attr.id)
      .sort((a, b) => a.valueIndex - b.valueIndex)
      .map((v) => v.textValue ?? v.numberValue ?? v.booleanValue)
      .filter((v) => v !== null && v !== undefined && v !== "");
    return values.length === 0 ? null : values.length > 1 ? values : values[0];
  };

  for (const product of withPartNumbers) {
    const remote = remoteById.get(product.id);
    if (!remote) continue;

    const applicable = categoryWithAncestors(product.categoryId ?? project.categoryId);
    const perProduct = new Map<string, unknown>();
    const result = resultByProduct.get(product.id)!;

    for (const attr of salsifyAttrs) {
      // The part number is the lookup key; overwriting it would re-point the
      // row at a different Salsify record on the next pull.
      if (attr.key === "partNumber") continue;
      if (attr.categoryId && !applicable.has(attr.categoryId)) {
        result.propsOutOfCategory++;
        continue;
      }
      if (!Object.hasOwn(remote, attr.salsifyPropertyId!)) {
        if (result.propsMissing.length < 10) result.propsMissing.push(attr.salsifyPropertyId!);
        continue;
      }
      result.propsPresent++;

      const raw = unwrapSalsifyValue(remote[attr.salsifyPropertyId!], attr.salsifyLocale);
      let current = isCoreField(attr.key)
        ? readCoreField(product as ProductRecord, attr.key)
        : currentEavValue(product, attr);

      // Compare against what would actually be stored, not the raw payload.
      // Salsify returns booleans as "Yes"/"true"/1 and numbers with varying
      // precision; those are not real differences once written, and reporting
      // them as changes fills the report with rows that change nothing.
      //
      // A value the field can't represent is reported as a warning rather
      // than written — mangling it silently would be worse, and dropping it
      // silently hides a real mapping problem.
      let incoming: unknown = raw;
      if (isCoreField(attr.key)) {
        const coerced = coerceSalsifyValue(attr.key, raw);
        if (coerced === undefined) {
          warnings.push({
            attributeKey: attr.key, attributeLabel: attr.label,
            partNumber: product.partNumber, value: displayValue(raw),
            reason: `Salsify sent a value this ${coreFieldType(attr.key) ?? "field"} field can't hold`,
          });
          continue;
        }
        incoming = coerced;
      } else if (attr.attributeType === "BOOLEAN") {
        // Both sides go through the same parser so "true" (as the grid stores
        // it) and "Yes" (as Salsify sends it) are seen as the same value.
        current = current === null ? null : toBoolean(current) ?? null;
        if (raw !== null) {
          const asBool = toBoolean(raw);
          if (asBool === undefined) {
            warnings.push({
              attributeKey: attr.key, attributeLabel: attr.label,
              partNumber: product.partNumber, value: displayValue(raw),
              reason: "Salsify sent a value that isn't recognizably Yes or No",
            });
            continue;
          }
          incoming = asBool;
        }
      }

      if (sameValue(current, incoming)) continue;

      perProduct.set(attr.key, incoming);
      const list = attrChanges.get(attr.key) ?? [];
      list.push({
        productId: product.id,
        partNumber: product.partNumber,
        itemName: product.itemName,
        current: displayValue(current),
        incoming: displayValue(incoming),
      });
      attrChanges.set(attr.key, list);
      result.changeCount++;
    }

    incomingByProduct.set(product.id, perProduct);
  }

  const attributes = salsifyAttrs
    .filter((a) => a.key !== "partNumber")
    .map((a) => ({
      key: a.key,
      label: a.label,
      salsifyPropertyId: a.salsifyPropertyId,
      section: a.section?.name ?? "General",
      isCoreField: isCoreField(a.key),
      changes: attrChanges.get(a.key) ?? [],
      changeCount: (attrChanges.get(a.key) ?? []).length,
    }))
    .filter((a) => a.changeCount > 0)
    .sort((a, b) => b.changeCount - a.changeCount || a.label.localeCompare(b.label));

  const summary = {
    productsInGrid: products.length,
    productsWithoutPartNumber: products.length - withPartNumbers.length,
    productsFoundInSalsify: remoteById.size,
    productsNotInSalsify: notFound.length,
    notFoundSample: notFound.slice(0, 20),
    totalChanges: attributes.reduce((n, a) => n + a.changeCount, 0),
    errors: fetchErrors.length > 0 ? fetchErrors.slice(0, 20) : undefined,
    warnings: warnings.slice(0, 50),
    warningCount: warnings.length,
    // Every product's outcome, so a partial result can be diagnosed on the spot.
    products: [...resultByProduct.values()],
    salsifyAttrCount: salsifyAttrs.length,
  };

  if (dryRun) {
    return NextResponse.json({ dryRun: true, attributes, summary });
  }

  // ── Apply ───────────────────────────────────────────────────────────────
  const selected = new Set(attributeKeys ?? []);
  if (selected.size === 0) {
    return NextResponse.json({ error: "Select at least one attribute to pull" }, { status: 400 });
  }

  const attrByKey = new Map(salsifyAttrs.map((a) => [a.key, a]));
  let productsUpdated = 0;
  let fieldsUpdated = 0;

  for (const product of withPartNumbers) {
    const perProduct = incomingByProduct.get(product.id);
    if (!perProduct || perProduct.size === 0) continue;

    const coreData: Record<string, unknown> = {};
    const eavWrites: { attr: AttributeDefinition; value: unknown }[] = [];

    for (const [key, incoming] of perProduct) {
      if (!selected.has(key)) continue;
      const attr = attrByKey.get(key);
      if (!attr) continue;

      if (isCoreField(key)) {
        const coerced = coerceSalsifyValue(key, incoming);
        if (coerced === undefined) continue;
        coreData[key] = coerced;
      } else {
        eavWrites.push({ attr, value: incoming });
      }
    }

    const changedKeys = Object.keys(coreData).length + eavWrites.length;
    if (changedKeys === 0) continue;

    await prisma.$transaction(async (tx) => {
      if (Object.keys(coreData).length > 0) {
        await tx.productRecord.update({
          where: { id: product.id },
          data: { ...(coreData as Prisma.ProductRecordUncheckedUpdateInput), updatedById: session.user.id },
        });
      }

      for (const { attr, value } of eavWrites) {
        // Replace rather than merge: a multi-valued property that shrank in
        // Salsify must shrink here too, and valueIndex has to stay dense.
        await tx.productAttributeValue.deleteMany({
          where: { productId: product.id, attributeDefinitionId: attr.id },
        });
        const list = Array.isArray(value) ? value : value === null ? [] : [value];
        for (const [index, item] of list.entries()) {
          if (item === null || item === undefined || item === "") continue;
          await tx.productAttributeValue.create({
            data: {
              productId: product.id,
              attributeDefinitionId: attr.id,
              valueIndex: index,
              // Every other writer in the app (grid, product edit, import)
              // stores EAV values as a string in textValue, and every reader
              // — including the grid — reads only that column. Writing to
              // numberValue/booleanValue instead lands the value in a column
              // nothing displays, so the pull would appear to do nothing.
              // Booleans serialize to "true"/"false", matching the grid's
              // own Yes/No editor.
              textValue: String(item),
              numberValue: null,
              booleanValue: null,
            },
          });
        }
      }

      if (Object.keys(coreData).length === 0) {
        // EAV-only writes don't touch ProductRecord, but the row's updatedAt
        // drives drift detection and the grid's freshness display.
        await tx.productRecord.update({
          where: { id: product.id },
          data: { updatedById: session.user.id },
        });
      }
    });

    productsUpdated++;
    fieldsUpdated += changedKeys;
  }

  const now = new Date();
  await prisma.productRecord.updateMany({
    where: { id: { in: withPartNumbers.map((p) => p.id) } },
    data: { salsifyLastPulledAt: now },
  }).catch(() => {});

  logActivity({
    userId: session.user.id,
    action: "UPDATED",
    entityType: "Project",
    entityId: projectId,
    projectId,
    newValue: `Pulled ${fieldsUpdated} value${fieldsUpdated !== 1 ? "s" : ""} from Salsify across ${productsUpdated} product${productsUpdated !== 1 ? "s" : ""}`,
    source: "Salsify Pull",
  }).catch(() => {});

  return NextResponse.json({
    applied: true,
    productsUpdated,
    fieldsUpdated,
    attributesPulled: [...selected].filter((k) => attrByKey.has(k)).length,
    summary,
  });
}
