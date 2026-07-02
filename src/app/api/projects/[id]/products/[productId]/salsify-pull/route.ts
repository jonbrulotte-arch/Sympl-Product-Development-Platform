import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkProjectAccess } from "@/lib/project-access";

type Params = { params: Promise<{ id: string; productId: string }> };

// Pulls a product's current state back FROM Salsify — digital-asset URLs,
// system metadata, and last-updated timestamp — and stores it on the product
// (salsifyData / salsifyLastPulledAt) so PMs can see what retail actually has
// without leaving Sympl.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await can(session.user.role, "products:sync_salsify"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId, productId } = await params;
  const access = await checkProjectAccess(projectId, session, "view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const config = await prisma.salsifyConfig.findFirst({ where: { isEnabled: true } });
  if (!config) {
    return NextResponse.json({ error: "Salsify is not configured or not enabled." }, { status: 400 });
  }

  const product = await prisma.productRecord.findUnique({
    where: { id: productId },
    select: { id: true, projectId: true, partNumber: true },
  });
  if (!product || product.projectId !== projectId) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const salsifyId = encodeURIComponent(product.partNumber ?? product.id);
  const res = await fetch(
    `https://app.salsify.com/api/v1/orgs/${config.organizationId}/products/${salsifyId}`,
    { headers: { Authorization: `Bearer ${config.apiKey}` } }
  );

  if (res.status === 404) {
    return NextResponse.json({ error: "Product does not exist in Salsify yet — sync it first." }, { status: 404 });
  }
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Salsify returned ${res.status}: ${text.slice(0, 300)}` }, { status: 502 });
  }

  const remote = await res.json();

  // Keep a curated subset rather than the full payload — assets, identity,
  // and freshness info are what PMs need to see
  const digitalAssets = Array.isArray(remote["salsify:digital_assets"])
    ? remote["salsify:digital_assets"].map((a: Record<string, unknown>) => ({
        id: a["salsify:id"] ?? null,
        name: a["salsify:name"] ?? null,
        url: a["salsify:url"] ?? null,
        sourceUrl: a["salsify:source_url"] ?? null,
        format: a["salsify:format"] ?? null,
      }))
    : [];

  const salsifyData = {
    systemId: remote["salsify:system_id"] ?? null,
    createdAt: remote["salsify:created_at"] ?? null,
    updatedAt: remote["salsify:updated_at"] ?? null,
    version: remote["salsify:version"] ?? null,
    digitalAssets,
    // Property count gives a quick sense of how much data lives on the
    // Salsify side vs. what Sympl pushes
    propertyCount: Object.keys(remote).filter((k) => !k.startsWith("salsify:")).length,
  };

  const now = new Date();
  await prisma.productRecord.update({
    where: { id: product.id },
    data: { salsifyData, salsifyLastPulledAt: now },
  });

  return NextResponse.json({ pulled: true, salsifyData, pulledAt: now.toISOString() });
}
