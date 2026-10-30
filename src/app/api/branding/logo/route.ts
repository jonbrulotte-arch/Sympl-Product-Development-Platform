import { NextResponse } from "next/server";
import { getBrandLogo } from "@/lib/branding";

// Public: needed on the sign-in page and in emails (which can't embed data URLs).
export async function GET() {
  const logo = await getBrandLogo();
  const m = logo ? /^data:([^;]+);base64,(.+)$/.exec(logo) : null;
  if (!m) return new NextResponse("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": m[1],
    "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  };
  if (m[1] === "image/svg+xml") {
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }
  return new NextResponse(new Uint8Array(Buffer.from(m[2], "base64")), { headers });
}
