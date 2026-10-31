import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLinked } from "@/lib/product-catalog";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { checkProjectAccess } from "@/lib/project-access";
import { salsifyFetch, describeFetchError } from "@/lib/salsify-http";
import { curateSalsifyData } from "@/lib/salsify-pull";

type Params = { params: Promise<{ id: string; productId: string }> };

// Pulls a product's current state back FROM Salsify — digital-asset URLs,
// system metadata, and last-updated timestamp — and stores it on the product
// (salsifyData / salsifyLastPulledAt) so PMs can see what retail actually has
// without leaving Sympl.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await can(session.user.role, "products:pull_salsify"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId, productId } = await params;
  const access = await checkProjectAccess(projectId, session, "view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const resolved = await resolveSalsifyCredentials(session.user.id);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const config = resolved.credentials;

  const product = await prisma.productRecord.findUnique({
    where: { id: productId },
    select: { id: true, partNumber: true },
  });
  if (!product || !(await isLinked(projectId, productId))) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const salsifyId = encodeURIComponent(product.partNumber ?? product.id);
  let res: Response;
  try {
    res = await salsifyFetch(
      `https://app.salsify.com/api/v1/orgs/${config.organizationId}/products/${salsifyId}`,
      { headers: { Authorization: `Bearer ${config.apiKey}` } }
    );
  } catch (err) {
    // Retries are already exhausted by this point, so report the underlying
    // socket reason rather than letting it surface as an unhandled 500.
    return NextResponse.json(
      { error: `Could not reach Salsify: ${describeFetchError(err)}` },
      { status: 502 }
    );
  }

  if (res.status === 404) {
    return NextResponse.json({ error: "Product does not exist in Salsify yet — sync it first." }, { status: 404 });
  }
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Salsify returned ${res.status}: ${text.slice(0, 300)}` }, { status: 502 });
  }

  const remote = await res.json();

  const salsifyData = curateSalsifyData(remote);

  const now = new Date();
  await prisma.productRecord.update({
    where: { id: product.id },
    data: { salsifyData, salsifyLastPulledAt: now },
  });

  return NextResponse.json({ pulled: true, salsifyData, pulledAt: now.toISOString() });
}
