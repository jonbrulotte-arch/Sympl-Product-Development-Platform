import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stat, readFile } from "fs/promises";
import path from "path";
import { resolvePrivateUploadPath, contentTypeFor } from "@/lib/uploads";

// Serves attachments stored in the private upload root (data/uploads) behind
// a session check. Files that still physically live in public/uploads are
// served by Next's static handler before this route runs — this handler only
// takes over once files are moved out of public/.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path: segments } = await params;
  const relPath = path.join("uploads", ...segments);
  const fullPath = resolvePrivateUploadPath(relPath);
  if (!fullPath) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const info = await stat(fullPath);
    if (!info.isFile()) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = await readFile(fullPath);
    const fileName = segments[segments.length - 1];
    const { mime, inline } = contentTypeFor(fileName);

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(info.size),
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
