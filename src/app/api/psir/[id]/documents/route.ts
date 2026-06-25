import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const psir = await prisma.psir.findUnique({ where: { id }, select: { id: true } });
  if (!psir) return NextResponse.json({ error: "PSIR not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const uploadDir = path.join(process.cwd(), "public", "uploads", "psir");
  await mkdir(uploadDir, { recursive: true });

  const ext = path.extname(file.name);
  const fileName = `${randomUUID()}${ext}`;
  const filePath = path.join("uploads", "psir", fileName);
  const fullPath = path.join(process.cwd(), "public", filePath);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

  const doc = await prisma.psirDocument.create({
    data: {
      psirId: id,
      fileName,
      originalName: file.name,
      fileType: file.type || null,
      fileSize: file.size,
      filePath,
      uploadedById: session.user.id,
    },
    include: { uploadedBy: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(doc, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { docId } = await req.json();
  const doc = await prisma.psirDocument.findFirst({ where: { id: docId, psirId: id } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { unlink } = await import("fs/promises");
  await unlink(path.join(process.cwd(), "public", doc.filePath)).catch(() => {});
  await prisma.psirDocument.delete({ where: { id: docId } });

  return NextResponse.json({ ok: true });
}
