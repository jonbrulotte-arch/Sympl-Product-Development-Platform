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

  // Validate magic bytes for file types served inline to prevent content-type spoofing.
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const magicChecks: Record<string, (b: Buffer) => boolean> = {
    png:  (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    jpg:  (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    jpeg: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    gif:  (b) => b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
    webp: (b) => b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
    pdf:  (b) => b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  };
  const check = magicChecks[ext];
  if (check && !check(buffer)) {
    return NextResponse.json({ error: "File content does not match its extension" }, { status: 400 });
  }

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
