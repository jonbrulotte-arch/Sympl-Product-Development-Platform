"use client";

import { cn } from "@/lib/utils";
import { useBranding } from "./branding-context";
import type { Branding } from "@/lib/branding-shared";

type Size = "sm" | "lg" | "icon";

/**
 * The platform's logo + name: the custom brand when configured, otherwise the
 * default "Sympl PM" wordmark. `tone` picks text colours for dark/light backgrounds.
 */
export function BrandMark({ size = "sm", tone = "dark", branding, className }: {
  size?: Size; tone?: "dark" | "light"; branding?: Branding; className?: string;
}) {
  const ctx = useBranding();
  const b = branding ?? ctx;
  const text = tone === "dark" ? "text-white" : "text-gray-900";
  const accent = tone === "dark" ? "text-blue-400" : "text-blue-600";
  const nameCls = size === "lg" ? "text-3xl" : "text-lg";
  const logoCls = size === "lg" ? "h-12 w-12" : "h-8 w-8";

  if (size === "icon") {
    return b.logoUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={b.logoUrl} alt={b.name} className={cn("h-8 w-8 rounded object-contain", className)} />
      : <span className={cn("text-lg font-bold", text, className)}>{b.custom ? b.name.charAt(0).toUpperCase() : "S"}</span>;
  }

  if (!b.custom) {
    return (
      <span className={cn(nameCls, "font-bold tracking-tight", text, className)}>
        Sympl <span className={accent}>PM</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-3 min-w-0", className)}>
      {b.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.logoUrl} alt="" className={cn(logoCls, "rounded object-contain shrink-0")} />
      )}
      <span className={cn(size === "lg" ? "text-2xl" : "text-lg", "font-bold tracking-tight leading-tight text-left", text, size === "sm" && "line-clamp-2")}>{b.name}</span>
    </span>
  );
}

/** "Sympl" by default, or the custom brand name — for inline prose. */
export function BrandShortName() {
  const b = useBranding();
  return <>{b.custom ? b.name : "Sympl"}</>;
}
