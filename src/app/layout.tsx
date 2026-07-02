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
    default: "Agendamiento Apoquindo",
    template: "%s | Agendamiento Apoquindo",
  },
  description:
    "Portal de solicitud de citas para conductores de Transportes Apoquindo.",
  applicationName: "Agendamiento Apoquindo",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Agendamiento Apoquindo",
    statusBarStyle: "default",
  },
  metadataBase: new URL(SITE_CONFIG.url),
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: SITE_CONFIG.url,
    siteName: "Agendamiento Apoquindo",
    title: "Agendamiento Apoquindo",
    description:
      "Portal de solicitud de citas para conductores de Transportes Apoquindo.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agendamiento Apoquindo",
    description:
      "Portal de solicitud de citas para conductores de Transportes Apoquindo.",
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
