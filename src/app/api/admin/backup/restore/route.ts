import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { execFile } from "child_process";
import { promisify } from "util";
import { createDecipheriv } from "crypto";
import { getBackupKey } from "@/lib/backup-key";
import { readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

// GET — list available backup files
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await prisma.backupConfig.findFirst();
  if (!config) return NextResponse.json({ files: [] });

  try {
    const files = readdirSync(config.backupPath)
      .filter((f) => f.startsWith("sympl-backup-") && f.endsWith(".pgenc"))
      .map((f) => {
        const full = path.join(config.backupPath, f);
        const stat = statSync(full);
        return { name: f, path: full, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}

// POST — restore from a specific backup file
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { filePath } = await req.json();
  if (!filePath) return NextResponse.json({ error: "filePath required" }, { status: 400 });

  const config = await prisma.backupConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Backup not configured" }, { status: 400 });

  let keyBuf: Buffer;
  try { keyBuf = getBackupKey(); } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  // Safety: only allow files inside the configured backup directory
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(config.backupPath);
  if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  try {
    const payload = readFileSync(resolvedPath);
    const iv = payload.subarray(0, 16);
    const authTag = payload.subarray(16, 32);
    const ciphertext = payload.subarray(32);

    const decipher = createDecipheriv("aes-256-gcm", keyBuf, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const dbUrl = process.env.DATABASE_URL ?? "";

    // Write decrypted dump to a temp file — pg_restore custom format requires random access (can't use stdin)
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

    await prisma.backupLog.create({
      data: {
        status: "RESTORE_SUCCESS",
        filePath: resolvedPath,
        fileSizeBytes: BigInt(payload.length),
        triggeredBy: "MANUAL_RESTORE",
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.backupLog.create({
      data: {
        status: "RESTORE_FAILED",
        filePath: resolvedPath,
        errorMessage: message,
        triggeredBy: "MANUAL_RESTORE",
      },
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
