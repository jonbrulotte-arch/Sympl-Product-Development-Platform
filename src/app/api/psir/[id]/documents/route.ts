import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { canMutateQaRecords } from "@/lib/project-access";
import { PRIVATE_UPLOAD_ROOT, MAX_UPLOAD_SIZE, isAllowedUploadName, deleteUploadFile } from "@/lib/uploads";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canMutateQaRecords(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const psir = await prisma.psir.findUnique({ where: { id }, select: { id: true } });
  if (!psir) return NextResponse.json({ error: "PSIR not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_UPLOAD_SIZE) return NextResponse.json({ error: "File exceeds 20 MB limit" }, { status: 413 });
  if (!isAllowedUploadName(file.name)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 415 });
  }

  const uploadDir = path.join(PRIVATE_UPLOAD_ROOT, "uploads", "psir");
  await mkdir(uploadDir, { recursive: true });

  const ext = path.extname(file.name);
  const fileName = `${randomUUID()}${ext}`;
  const filePath = path.join("uploads", "psir", fileName);
  const fullPath = path.join(PRIVATE_UPLOAD_ROOT, filePath);

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
  if (!canMutateQaRecords(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const { docId } = await req.json();
  const doc = await prisma.psirDocument.findFirst({ where: { id: docId, psirId: id } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await deleteUploadFile(doc.filePath);
  await prisma.psirDocument.delete({ where: { id: docId } });

  return NextResponse.json({ ok: true });
}
