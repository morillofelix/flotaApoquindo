import AdminShell from "@/components/agendamientos/AdminShell";

export default function AgendamientosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
