import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { execFile } from "child_process";
import { promisify } from "util";
import { createDecipheriv } from "crypto";
import { getBackupKey } from "@/lib/backup-key";
import { readFileSync, writeFileSync, unlinkSync, readdirSync, statSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import { PRIVATE_UPLOAD_ROOT } from "@/lib/uploads";
import { classifyBackupFile, resolveBackupFile, type BackupKind } from "@/lib/backup-files";

const execFileAsync = promisify(execFile);

// GET — list available backup artifacts (database dumps and upload archives)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await prisma.backupConfig.findFirst();
  if (!config) return NextResponse.json({ files: [] });

  try {
    const files = readdirSync(config.backupPath)
      .map((f) => ({ name: f, kind: classifyBackupFile(f) }))
      .filter((f): f is { name: string; kind: BackupKind } => f.kind !== null)
      .map(({ name, kind }) => {
        const full = path.join(config.backupPath, name);
        const stat = statSync(full);
        return { name, kind, path: full, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}

// POST — restore from a snapshot. Database dumps replace the database;
// upload archives are extracted back over data/uploads.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  // `name` is preferred; `filePath` is still accepted for older callers.
  const name: string =
    body.name ?? (typeof body.filePath === "string" ? path.basename(body.filePath) : "");
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const config = await prisma.backupConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Backup not configured" }, { status: 400 });

  const target = resolveBackupFile(config.backupPath, name);
  if (!target) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });

  try {
    const sizeBytes = statSync(target.path).size;

    if (target.kind === "uploads") {
      // Extract over the existing tree: files in the archive win, files only
      // present on this server are left alone.
      mkdirSync(path.join(PRIVATE_UPLOAD_ROOT, "uploads"), { recursive: true });
      await execFileAsync("tar", ["-xzf", target.path, "-C", PRIVATE_UPLOAD_ROOT], {
        maxBuffer: 64 * 1024 * 1024,
      });
    } else {
      let keyBuf: Buffer;
      try { keyBuf = getBackupKey(); } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
      }

      const payload = readFileSync(target.path);
      const iv = payload.subarray(0, 16);
      const authTag = payload.subarray(16, 32);
      const ciphertext = payload.subarray(32);

      const decipher = createDecipheriv("aes-256-gcm", keyBuf, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      const dbUrl = process.env.DATABASE_URL ?? "";

      // pg_restore custom format requires random access — it can't read stdin.
      const tmpFile = path.join(os.tmpdir(), `sympl-restore-${Date.now()}.pgdump`);
      writeFileSync(tmpFile, decrypted);
      try {
        await execFileAsync(
          "pg_restore",
          ["--no-password", "--clean", "--if-exists", "--format=custom", "--dbname", dbUrl, tmpFile],
          { maxBuffer: 512 * 1024 * 1024 }
        );
      } finally {
        unlinkSync(tmpFile);
      }
    }

    await prisma.backupLog.create({
      data: {
        status: "RESTORE_SUCCESS",
        filePath: target.path,
        fileSizeBytes: BigInt(sizeBytes),
        triggeredBy: target.kind === "uploads" ? "FILES_RESTORE" : "MANUAL_RESTORE",
      },
    });

    return NextResponse.json({ success: true, kind: target.kind });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.backupLog.create({
      data: {
        status: "RESTORE_FAILED",
        filePath: target.path,
        errorMessage: message,
        triggeredBy: target.kind === "uploads" ? "FILES_RESTORE" : "MANUAL_RESTORE",
      },
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
