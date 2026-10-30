// Branding values safe to use on both server and client.

export type Branding = {
  /** True when custom branding is on and a name is set. */
  custom: boolean;
  name: string;
  tagline: string;
  /** Relative URL of the custom logo (cache-busted), or null. */
  logoUrl: string | null;
};

export const DEFAULT_BRAND_NAME = "Sympl PM";
export const DEFAULT_TAGLINE = "Product Development Platform";

export const DEFAULT_BRANDING: Branding = {
  custom: false,
  name: DEFAULT_BRAND_NAME,
  tagline: DEFAULT_TAGLINE,
  logoUrl: null,
};

/** Short name for prose like "Map columns to … fields" ("Sympl" by default). */
export function shortName(b: Branding): string {
  return b.custom ? b.name : "Sympl";
}
