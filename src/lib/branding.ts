import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANDING, DEFAULT_TAGLINE, type Branding } from "@/lib/branding-shared";

export { DEFAULT_BRANDING, type Branding } from "@/lib/branding-shared";

// Settings are read on each request (one small row) so a save shows up
// immediately in every server bundle; only the logo bytes are cached, keyed by
// brandUpdatedAt so a new upload replaces them.
let logoCache: { key: number; logo: string | null } | null = null;

async function load(): Promise<{ value: Branding; logo: string | null }> {
  try {
    const cfg = await prisma.appConfig.findFirst({
      select: { id: true, brandingEnabled: true, brandName: true, brandTagline: true, brandUpdatedAt: true },
    });
    const name = cfg?.brandName?.trim();
    if (!cfg || !cfg.brandingEnabled || !name) return { value: DEFAULT_BRANDING, logo: null };
    const key = cfg.brandUpdatedAt?.getTime() ?? 0;
    if (!logoCache || logoCache.key !== key) {
      const row = await prisma.appConfig.findUnique({ where: { id: cfg.id }, select: { brandLogo: true } });
      logoCache = { key, logo: row?.brandLogo ?? null };
    }
    const logo = logoCache.logo;
    return {
      value: {
        custom: true,
        name,
        tagline: cfg.brandTagline?.trim() || DEFAULT_TAGLINE,
        logoUrl: logo ? `/api/branding/logo?v=${key}` : null,
      },
      logo,
    };
  } catch {
    // Branding must never take the app down (e.g. before db push adds the columns).
    return { value: DEFAULT_BRANDING, logo: null };
  }
}

export async function getBranding(): Promise<Branding> {
  return (await load()).value;
}

/** The stored logo data URL when custom branding is active. */
export async function getBrandLogo(): Promise<string | null> {
  return (await load()).logo;
}

export function invalidateBranding() {
  logoCache = null;
}

const MAX_LOGO_BYTES = 1024 * 1024;
const MIME_BY_MAGIC: [string, (b: Buffer) => boolean][] = [
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/gif", (b) => b.subarray(0, 4).toString("ascii") === "GIF8"],
  ["image/webp", (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP"],
];

/** Validates an uploaded logo data URL; returns a normalized data URL or an error. */
export function validateLogo(dataUrl: string): { ok: true; dataUrl: string } | { ok: false; error: string } {
  const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!m) return { ok: false, error: "Logo must be an uploaded image file" };
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0) return { ok: false, error: "Logo file is empty" };
  if (buf.length > MAX_LOGO_BYTES) return { ok: false, error: "Logo must be 1 MB or smaller" };
  let mime = MIME_BY_MAGIC.find(([, test]) => test(buf))?.[0];
  if (!mime) {
    const text = buf.subarray(0, 2048).toString("utf8").trimStart().toLowerCase();
    if (text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) {
      const full = buf.toString("utf8").toLowerCase();
      // Defence in depth: SVGs are also served sandboxed, but refuse active content outright.
      if (/<script|on[a-z]+\s*=|javascript:|<foreignobject|<iframe|<embed|<object/.test(full)) {
        return { ok: false, error: "SVG logos can't contain scripts or event handlers" };
      }
      mime = "image/svg+xml";
    }
  }
  if (!mime) return { ok: false, error: "Logo must be a PNG, JPEG, GIF, WebP or SVG image" };
  return { ok: true, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
}
