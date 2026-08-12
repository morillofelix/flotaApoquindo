import type { Metadata } from "next";
import { inter, outfit } from "@/lib/fonts";
import { SITE_CONFIG } from "@/lib/constants";
import { PWA_BRAND } from "@/lib/pwa-brand";
import { cn } from "@/utils/cn";
import PwaServiceWorkerRegister from "@/components/PwaServiceWorkerRegister";
import "./globals.css";

// ============================================================
// Metadata SEO Global
// ============================================================

export const metadata: Metadata = {
  title: {
    default: PWA_BRAND.name,
    template: `%s | ${PWA_BRAND.shortName}`,
  },
  description: PWA_BRAND.description,
  applicationName: PWA_BRAND.shortName,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: PWA_BRAND.shortName,
    statusBarStyle: "default",
  },
  metadataBase: new URL(SITE_CONFIG.url),
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: SITE_CONFIG.url,
    siteName: PWA_BRAND.name,
    title: PWA_BRAND.name,
    description: PWA_BRAND.description,
  },
  twitter: {
    card: "summary_large_image",
    title: PWA_BRAND.name,
    description: PWA_BRAND.description,
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
        <PwaServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
