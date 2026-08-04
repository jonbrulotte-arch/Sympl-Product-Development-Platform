import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CORE_FIELDS } from "@/lib/core-fields";

export const dynamic = "force-dynamic";

// Public read-only view of a shared product or PSIR. No session required —
// access is controlled entirely by the unguessable, expiring token.
// Deliberately renders data only: no attachments, no links back into the app.

const CORE_FIELD_BY_KEY = Object.fromEntries(CORE_FIELDS.map((f) => [f.key, f]));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link || link.revokedAt || link.expiresAt < new Date()) notFound();

  let title = "";
  let subtitle = "";
  let sections: { title: string; fields: { label: string; value: string }[] }[] = [];

  if (link.entityType === "PRODUCT") {
    const product = await prisma.productRecord.findUnique({
      where: { id: link.entityId },
      include: {
        attributeValues: { include: { attributeDefinition: { include: { section: true } } } },
        category: true,
      },
    });
    if (!product || product.isArchived) notFound();

    title = product.itemName ?? product.partNumber ?? "Product";
    subtitle = [product.partNumber, product.brand, product.category?.name].filter(Boolean).join(" · ");

    // Core fields grouped by their attribute-definition section
    const coreDefs = await prisma.attributeDefinition.findMany({
      where: { key: { in: Object.keys(CORE_FIELD_BY_KEY) }, isActive: true },
      include: { section: true },
      orderBy: [{ section: { sortOrder: "asc" } }, { sectionId: "asc" }, { sortOrder: "asc" }],
    });

    const bySection = new Map<string, { label: string; value: string }[]>();
    const push = (section: string, label: string, value: string) => {
      if (!value) return;
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section)!.push({ label, value });
    };

    for (const def of coreDefs) {
      const field = CORE_FIELD_BY_KEY[def.key];
      if (!field) continue;
      const raw = (product as unknown as Record<string, unknown>)[def.key];
      if (raw === null || raw === undefined || raw === "") continue;
      const value = field.type === "boolean" ? (raw ? "Yes" : "No") : String(raw);
      push(def.section?.name ?? "Details", def.label, value);
    }

    // EAV values grouped the same way
    const grouped: Record<string, { def: (typeof product.attributeValues)[number]["attributeDefinition"]; vals: string[] }> = {};
    for (const av of product.attributeValues) {
      const k = av.attributeDefinitionId;
      if (!grouped[k]) grouped[k] = { def: av.attributeDefinition, vals: [] };
      grouped[k].vals[av.valueIndex] = av.textValue ?? av.numberValue?.toString() ?? (av.booleanValue != null ? (av.booleanValue ? "Yes" : "No") : "");
    }
    for (const { def, vals } of Object.values(grouped)) {
      const value = vals.filter(Boolean).join(", ");
      if (value) push(def.section?.name ?? "Custom Attributes", def.label, value);
    }

    sections = [...bySection.entries()].map(([t, fields]) => ({ title: t, fields }));
  } else if (link.entityType === "PSIR") {
    const psir = await prisma.psir.findUnique({
      where: { id: link.entityId },
      include: {
        attributeValues: { include: { attrDef: true }, orderBy: { attrDef: { sortOrder: "asc" } } },
        products: { include: { product: { select: { partNumber: true, itemName: true } } } },
      },
    });
    if (!psir) notFound();

    title = psir.title;
    subtitle = [psir.referenceNumber, psir.factory, psir.inspectionCompany].filter(Boolean).join(" · ");

    sections = [
      {
        title: "Inspection Report",
        fields: [
          { label: "Result", value: psir.result },
          { label: "Status", value: psir.status },
          { label: "Inspector", value: psir.inspector ?? "" },
          { label: "Inspection Company", value: psir.inspectionCompany ?? "" },
          { label: "Factory", value: psir.factory ?? "" },
          { label: "Country of Origin", value: psir.countryOfOrigin ?? "" },
          { label: "Inspection Date", value: psir.inspectionDate ? psir.inspectionDate.toLocaleDateString() : "" },
          { label: "Notes", value: psir.notes ?? "" },
        ].filter((f) => f.value),
      },
      ...(psir.attributeValues.length
        ? [{
            title: "Inspection Details",
            fields: psir.attributeValues.map((av) => ({ label: av.attrDef.label, value: av.value ?? "" })).filter((f) => f.value),
          }]
        : []),
      ...(psir.products.length
        ? [{
            title: "Products Covered",
            fields: psir.products.map(({ product }) => ({
              label: product.partNumber ?? "—",
              value: product.itemName ?? "",
            })),
          }]
        : []),
    ];
  } else if (link.entityType === "COMPLIANCE") {
    const event = await prisma.complianceEvent.findUnique({
      where: { id: link.entityId },
      include: {
        type: { select: { name: true } },
        products: { include: { product: { select: { partNumber: true, itemName: true } } } },
      },
    });
    if (!event) notFound();

    title = event.title;
    subtitle = [event.type.name, event.severity, event.status.replace("_", " ")].filter(Boolean).join(" · ");

    sections = [
      {
        title: "Compliance Event",
        fields: [
          { label: "Type", value: event.type.name },
          { label: "Severity", value: event.severity },
          { label: "Status", value: event.status.replace("_", " ") },
          { label: "Due Date", value: event.dueDate ? event.dueDate.toLocaleDateString() : "" },
          { label: "Resolved", value: event.resolvedAt ? event.resolvedAt.toLocaleDateString() : "" },
          { label: "Description", value: event.description ?? "" },
          { label: "Notes", value: event.notes ?? "" },
        ].filter((f) => f.value),
      },
      ...(event.products.length
        ? [{
            title: "Affected Products",
            fields: event.products.map(({ product }) => ({
              label: product.partNumber ?? "—",
              value: product.itemName ?? "",
            })),
          }]
        : []),
    ];
  } else {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Sympl PM — Shared View</p>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {sections.map((s) => (
          <Section key={s.title} title={s.title}>
            {s.fields.map((f, i) => <Field key={i} label={f.label} value={f.value} />)}
          </Section>
        ))}
        <p className="text-xs text-gray-400 text-center pt-4 pb-8">
          Read-only view · expires {link.expiresAt.toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
