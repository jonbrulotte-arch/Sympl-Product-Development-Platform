import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWriteStream, mkdirSync, statSync, unlinkSync, renameSync } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { resolveBackupFile } from "@/lib/backup-files";

// POST /api/admin/backup/upload?name=<file>
// Body is the raw file. Streamed straight to disk so multi-GB dumps from
// another server never have to be buffered in memory.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await prisma.backupConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Backup not configured" }, { status: 400 });

  const name = req.nextUrl.searchParams.get("name") ?? "";
  const target = resolveBackupFile(config.backupPath, name);
  if (!target) {
    return NextResponse.json(
      { error: "File name must match sympl-backup-<timestamp>.pgenc or sympl-uploads-<timestamp>.tar.gz" },
      { status: 400 }
    );
  }

  if (!req.body) return NextResponse.json({ error: "Request body required" }, { status: 400 });

  // Write to a sibling .part file first so an interrupted upload can never be
  // mistaken for a restorable snapshot.
  const partPath = `${target.path}.part`;
  try {
    mkdirSync(config.backupPath, { recursive: true });
    await pipeline(Readable.fromWeb(req.body as never), createWriteStream(partPath));

    const size = statSync(partPath).size;
    if (size === 0) {
      unlinkSync(partPath);
      return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
    }
    // Encrypted dumps carry a 16-byte IV + 16-byte auth tag before ciphertext.
    if (target.kind === "database" && size <= 32) {
      unlinkSync(partPath);
      return NextResponse.json({ error: "File is too small to be a valid encrypted backup" }, { status: 400 });
    }

    renameSync(partPath, target.path);

    await prisma.backupLog.create({
      data: {
        status: "SUCCESS",
        filePath: target.path,
        fileSizeBytes: BigInt(size),
        triggeredBy: "UPLOAD",
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, name, kind: target.kind, sizeBytes: size });
  } catch (err) {
    try { unlinkSync(partPath); } catch { /* nothing to clean up */ }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
