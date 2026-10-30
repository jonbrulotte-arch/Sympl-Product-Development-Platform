import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getBranding } from "@/lib/branding";
import { BrandingProvider } from "@/components/branding/branding-context";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

// Branding is admin-editable, so the title/favicon are resolved per request.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const b = await getBranding();
  return {
    title: b.name,
    description: b.custom ? b.tagline : "Manage, review, and export product development projects",
    icons: { icon: b.logoUrl ?? "/favicon.svg" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const branding = await getBranding();
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full font-sans">
        <BrandingProvider value={branding}>
          <Providers>{children}</Providers>
        </BrandingProvider>
      </body>
    </html>
  );
}
