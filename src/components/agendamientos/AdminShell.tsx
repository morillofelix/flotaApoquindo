"use client";

import ExecutiveAccessLoginScreen, {
  ADMIN_ACCESS_STORAGE_KEY,
} from "@/components/ExecutiveAccessLoginScreen";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/agendamientos", label: "Solicitudes" },
  { href: "/agendamientos/calendario", label: "Calendario" },
  { href: "/agendamientos/motivos", label: "Motivos" },
  { href: "/agendamientos/ejecutivos", label: "Ejecutivos" },
  { href: "/agendamientos/conductores", label: "Conductores" },
] as const;

function isActiveRoute(pathname: string, href: string) {
  if (href === "/agendamientos") {
    return pathname === "/agendamientos";
  }

  return pathname.startsWith(href);
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    setIsAuthenticated(
      window.sessionStorage.getItem(ADMIN_ACCESS_STORAGE_KEY) === "true",
    );
    setAuthChecked(true);
  }, []);

  function handleLogout() {
    window.sessionStorage.removeItem(ADMIN_ACCESS_STORAGE_KEY);
    setIsAuthenticated(false);
  }

  if (!authChecked) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <ExecutiveAccessLoginScreen
        storageKey={ADMIN_ACCESS_STORAGE_KEY}
        eyebrow="Acceso ejecutivo"
        title="Administración de citas"
        description="Ingresa usuario y clave para revisar las solicitudes enviadas."
        showCredentialHint
        onAuthenticated={() => setIsAuthenticated(true)}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#eef3f9] text-[#0f2747]">
      <nav className="border-b border-[#b7cce4] bg-[#d7e7f8] shadow-sm shadow-slate-200/40">
        <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-3 px-3 py-3 sm:px-6 xl:px-10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1">
              {navItems.map((item) => {
                const active = isActiveRoute(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex h-9 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${
                      active
                        ? "bg-[#0b5cab] text-white shadow-md shadow-blue-900/15"
                        : "text-[#173b68] hover:bg-white/75"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/"
                className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
              >
                Nueva solicitud
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </nav>

      {children}
    </div>
  );
}
