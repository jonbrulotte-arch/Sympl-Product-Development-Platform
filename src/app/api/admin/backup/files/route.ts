import { can } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import path from "path";
import { PRIVATE_UPLOAD_ROOT } from "@/lib/uploads";
import { UPLOADS_PREFIX, UPLOADS_EXT, backupTimestamp } from "@/lib/backup-files";

const execFileAsync = promisify(execFile);

// POST — archive data/uploads into the backup directory so it can be
// downloaded and carried to another server alongside the database dump.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await prisma.backupConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Backup not configured" }, { status: 400 });

  const uploadsDir = path.join(PRIVATE_UPLOAD_ROOT, "uploads");
  if (!existsSync(uploadsDir)) {
    return NextResponse.json({ error: "No uploads directory to archive" }, { status: 400 });
  }

  const start = Date.now();
  const fileName = `${UPLOADS_PREFIX}${backupTimestamp()}${UPLOADS_EXT}`;
  const filePath = path.join(config.backupPath, fileName);

  try {
    mkdirSync(config.backupPath, { recursive: true });

    // Mirrors scripts/backup.sh: archive the "uploads" entry relative to data/
    // so it extracts back to the same location.
    await execFileAsync("tar", ["-czf", filePath, "-C", PRIVATE_UPLOAD_ROOT, "uploads"], {
      maxBuffer: 64 * 1024 * 1024,
    });

    const fileSize = statSync(filePath).size;

    // Prune old upload archives to the same retention as database backups.
    // Best-effort per file: a file that vanishes mid-prune must not fail an
    // archive that already succeeded.
    const archives = readdirSync(config.backupPath)
      .filter((f) => f.startsWith(UPLOADS_PREFIX) && f.endsWith(UPLOADS_EXT))
      .flatMap((f) => {
        try { return [{ name: f, mtime: statSync(path.join(config.backupPath, f)).mtime.getTime() }]; }
        catch { return []; }
      })
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of archives.slice(config.retainCount)) {
      try { unlinkSync(path.join(config.backupPath, old.name)); } catch { /* already gone */ }
    }

    await prisma.backupLog.create({
      data: {
        status: "SUCCESS",
        filePath,
        fileSizeBytes: BigInt(fileSize),
        durationMs: Date.now() - start,
        triggeredBy: "FILES_ARCHIVE",
      },
    });

    return NextResponse.json({ success: true, name: fileName, sizeBytes: fileSize, durationMs: Date.now() - start });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.backupLog.create({
      data: {
        status: "FAILED",
        filePath,
        durationMs: Date.now() - start,
        errorMessage: message,
        triggeredBy: "FILES_ARCHIVE",
      },
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
