import AdminShell from "@/components/agendamientos/AdminShell";
import { PWA_BRAND } from "@/lib/pwa-brand";
import type { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/manifest-agendamientos.webmanifest",
  applicationName: PWA_BRAND.shortName,
};

export const dynamic = "force-dynamic";

export default function AgendamientosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
