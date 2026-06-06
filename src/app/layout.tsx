import type { Metadata } from "next";
import { inter, outfit } from "@/lib/fonts";
import { SITE_CONFIG } from "@/lib/constants";
import { cn } from "@/utils/cn";
import "./globals.css";

// ============================================================
// Metadata SEO Global
// ============================================================

export const metadata: Metadata = {
  title: {
    default: `${SITE_CONFIG.name} — Gestión Inteligente`,
    template: `%s | ${SITE_CONFIG.name}`,
  },
  description: SITE_CONFIG.description,
  metadataBase: new URL(SITE_CONFIG.url),
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: SITE_CONFIG.url,
    siteName: SITE_CONFIG.name,
    title: `${SITE_CONFIG.name} — Gestión Inteligente`,
    description: SITE_CONFIG.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_CONFIG.name} — Gestión Inteligente`,
    description: SITE_CONFIG.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

// ============================================================
// Root Layout
// ============================================================

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={cn(inter.variable, outfit.variable)}>
      <body className="min-h-screen bg-surface-900 font-sans text-surface-200 antialiased">
        {children}
      </body>
    </html>
  );
}
