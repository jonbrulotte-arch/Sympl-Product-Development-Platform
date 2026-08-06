import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import { resolveBackupFile } from "@/lib/backup-files";

// GET /api/admin/backup/download?name=sympl-backup-<ts>.pgenc
// Streams a backup artifact so it can be moved to another server.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await prisma.backupConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Backup not configured" }, { status: 400 });

  const name = req.nextUrl.searchParams.get("name") ?? "";
  const target = resolveBackupFile(config.backupPath, name);
  if (!target) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });

  let size: number;
  try {
    const stat = statSync(target.path);
    if (!stat.isFile()) throw new Error("not a file");
    size = stat.size;
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(target.path)) as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
