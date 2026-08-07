import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isInspectionsEnabled, setInspectionsEnabled } from "@/lib/app-config";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ inspectionsEnabled: await isInspectionsEnabled() });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (typeof body.inspectionsEnabled !== "boolean") {
    return NextResponse.json({ error: "inspectionsEnabled must be a boolean" }, { status: 400 });
  }
  await setInspectionsEnabled(body.inspectionsEnabled);
  return NextResponse.json({ success: true, inspectionsEnabled: body.inspectionsEnabled });
}
