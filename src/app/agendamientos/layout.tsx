import AdminShell from "@/components/agendamientos/AdminShell";

export const dynamic = "force-dynamic";

export default function AgendamientosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
