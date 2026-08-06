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
import { pgConnectionUrl } from "@/lib/pg-url";

const execFileAsync = promisify(execFile);

type RestoredCounts = { projects: number; products: number };

// Post-restore sanity check. Best-effort: a snapshot that legitimately holds
// zero rows is still a valid restore, so this reports rather than validates.
async function countRestored(): Promise<RestoredCounts | null> {
  try {
    const [projects, products] = await Promise.all([
      prisma.project.count(),
      prisma.productRecord.count(),
    ]);
    return { projects, products };
  } catch {
    return null;
  }
}

// execFile rejections carry the child's stderr separately from the message,
// and for pg_restore that stderr is the only useful part.
function execErrorMessage(err: unknown): string {
  const stderr = (err as { stderr?: unknown })?.stderr;
  const detail = typeof stderr === "string" ? stderr.trim() : "";
  const base = err instanceof Error ? err.message : String(err);
  return detail ? `${base}\n${detail.slice(-2000)}` : base;
}

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

  let restored: RestoredCounts | null = null;
  // Once the schema is dropped there is no going back to the pre-restore state,
  // so a later failure has to say so rather than look like a no-op.
  let schemaDropped = false;

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

      const dbUrl = pgConnectionUrl(process.env.DATABASE_URL ?? "");

      // pg_restore custom format requires random access — it can't read stdin.
      const tmpFile = path.join(os.tmpdir(), `sympl-restore-${Date.now()}.pgdump`);
      writeFileSync(tmpFile, decrypted);
      try {
        // Validate the archive BEFORE touching the live database — everything
        // after this point is destructive, so a corrupt upload must fail here.
        await execFileAsync("pg_restore", ["--list", tmpFile], { maxBuffer: 64 * 1024 * 1024 });

        // Restore onto an empty schema rather than using --clean. --clean drops
        // objects one by one and silently skips whatever it cannot drop; the
        // subsequent COPY then fails on duplicate keys, leaving the old data in
        // place. Dropping the schema outright guarantees the snapshot applies
        // exactly as captured.
        await prisma.$executeRawUnsafe(`SET lock_timeout = '30s'`);
        await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
        await prisma.$executeRawUnsafe(`CREATE SCHEMA public`);
        schemaDropped = true;

        // --single-transaction implies --exit-on-error: without it pg_restore
        // continues past failures and still exits 0, reporting a restore that
        // never happened as a success.
        const { stderr } = await execFileAsync(
          "pg_restore",
          [
            "--no-password", "--no-owner", "--no-acl",
            "--single-transaction", "--format=custom",
            "--dbname", dbUrl, tmpFile,
          ],
          { maxBuffer: 512 * 1024 * 1024 }
        );

        const ignored = stderr.match(/errors ignored on restore: (\d+)/i);
        if (ignored) {
          throw new Error(
            `pg_restore skipped ${ignored[1]} objects — the snapshot did not fully apply.\n${stderr.trim().slice(-2000)}`
          );
        }
      } finally {
        unlinkSync(tmpFile);
      }

      // Report what actually landed so a no-op restore is visible immediately.
      restored = await countRestored();
    }

    // Non-fatal: the restore already succeeded, and this row lives in the
    // freshly restored schema. Failing to log it must not report failure.
    await prisma.backupLog.create({
      data: {
        status: "RESTORE_SUCCESS",
        filePath: target.path,
        fileSizeBytes: BigInt(sizeBytes),
        triggeredBy: target.kind === "uploads" ? "FILES_RESTORE" : "MANUAL_RESTORE",
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, kind: target.kind, restored });
  } catch (err) {
    let message = execErrorMessage(err);
    if (schemaDropped) {
      message = `${message}\n\nThe existing schema was already dropped, so the database is now empty. Restore a known-good snapshot before using the application.`;
    }
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
