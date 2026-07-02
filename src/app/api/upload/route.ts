import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { PRIVATE_UPLOAD_ROOT, MAX_UPLOAD_SIZE, isAllowedUploadName } from "@/lib/uploads";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_UPLOAD_SIZE) return NextResponse.json({ error: "File exceeds 20 MB limit" }, { status: 413 });
  if (!isAllowedUploadName(file.name)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Date-based folder: uploads/YYYY-MM
  const now = new Date();
  const folder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${Date.now()}-${safeName}`;

  const uploadDir = path.join(PRIVATE_UPLOAD_ROOT, "uploads", folder);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), buffer);

  return NextResponse.json({
    url: `/uploads/${folder}/${fileName}`,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
  });
}
