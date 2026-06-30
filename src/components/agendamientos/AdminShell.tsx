"use client";

import AccessChangePasswordScreen from "@/components/AccessChangePasswordScreen";
import ExecutiveAccessLoginScreen, {
  ADMIN_ACCESS_STORAGE_KEY,
  type LoginAccessUser,
} from "@/components/ExecutiveAccessLoginScreen";
import type { AccessPermissionKey, AccessPermissions } from "@/lib/access-users";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type NavItem = {
  label: string;
  href: string;
  permission: AccessPermissionKey;
  isActive: (pathname: string, vista: string | null) => boolean;
};

const navItems: NavItem[] = [
  {
    label: "Solicitudes",
    href: "/agendamientos",
    permission: "solicitudes",
    isActive: (pathname, vista) =>
      pathname === "/agendamientos" && vista !== "calendario",
  },
  {
    label: "Calendario",
    href: "/agendamientos?vista=calendario",
    permission: "calendario",
    isActive: (pathname, vista) =>
      pathname === "/agendamientos" && vista === "calendario",
  },
  {
    label: "Motivos",
    href: "/agendamientos/motivos",
    permission: "motivos",
    isActive: (pathname) => pathname.startsWith("/agendamientos/motivos"),
  },
  {
    label: "Ejecutivos",
    href: "/agendamientos/ejecutivos",
    permission: "ejecutivos",
    isActive: (pathname) => pathname.startsWith("/agendamientos/ejecutivos"),
  },
  {
    label: "Conductores",
    href: "/agendamientos/conductores",
    permission: "conductores",
    isActive: (pathname) => pathname.startsWith("/agendamientos/conductores"),
  },
  {
    label: "Propietarios",
    href: "/agendamientos/propietarios",
    permission: "propietarios",
    isActive: (pathname) => pathname.startsWith("/agendamientos/propietarios"),
  },
  {
    label: "Pago propietario",
    href: "/agendamientos/pago-propietario",
    permission: "pagoPropietario",
    isActive: (pathname) =>
      pathname.startsWith("/agendamientos/pago-propietario"),
  },
];

type AdminSessionState = {
  permissions: AccessPermissions;
  isSuperAdmin: boolean;
  canManageAccesos: boolean;
};

function AdminNavigation({
  onLogout,
  permissions,
  isSuperAdmin,
  canManageAccesos,
}: {
  onLogout: () => void;
  permissions: AccessPermissions;
  isSuperAdmin: boolean;
  canManageAccesos: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vista = searchParams.get("vista");

  const visibleNavItems = navItems.filter(
    (item) => isSuperAdmin || permissions[item.permission],
  );

  return (
    <nav className="border-b border-[#b7cce4] bg-[#d7e7f8] shadow-sm shadow-slate-200/40">
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-3 px-3 py-3 sm:px-6 xl:px-10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1">
            {visibleNavItems.map((item) => {
              const active = item.isActive(pathname, vista);

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
            {canManageAccesos ? (
              <Link
                href="/accesos"
                className="inline-flex h-9 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-[#173b68] transition hover:bg-white/80"
              >
                Accesos
              </Link>
            ) : null}
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
            >
              Nueva solicitud
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function AdminShellInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vista = searchParams.get("vista");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [sessionState, setSessionState] = useState<AdminSessionState | null>(
    null,
  );
  const [pendingPasswordChange, setPendingPasswordChange] = useState<{
    accessUser: LoginAccessUser;
    currentPassword: string;
  } | null>(null);

  async function refreshSession() {
    const response = await fetch("/api/accesos/session", {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      setIsAuthenticated(false);
      setSessionState(null);
      window.sessionStorage.removeItem(ADMIN_ACCESS_STORAGE_KEY);
      return false;
    }

    const data = (await response.json()) as {
      mustChangePassword?: boolean;
      permissions?: AccessPermissions;
      isSuperAdmin?: boolean;
      canManageAccesos?: boolean;
    };

    if (data.mustChangePassword) {
      setIsAuthenticated(false);
      setSessionState(null);
      return false;
    }

    setSessionState({
      permissions: data.permissions ?? {
        solicitudes: false,
        calendario: false,
        motivos: false,
        ejecutivos: false,
        conductores: false,
        propietarios: false,
        pagoPropietario: false,
      },
      isSuperAdmin: Boolean(data.isSuperAdmin),
      canManageAccesos: Boolean(data.canManageAccesos),
    });
    setIsAuthenticated(true);
    window.sessionStorage.setItem(ADMIN_ACCESS_STORAGE_KEY, "true");
    return true;
  }

  useEffect(() => {
    const hasLocalFlag =
      window.sessionStorage.getItem(ADMIN_ACCESS_STORAGE_KEY) === "true";

    if (hasLocalFlag) {
      refreshSession().finally(() => setAuthChecked(true));
      return;
    }

    setAuthChecked(true);
  }, []);

  const currentNavItem = useMemo(
    () => navItems.find((item) => item.isActive(pathname, vista)),
    [pathname, vista],
  );

  const hasRouteAccess = useMemo(() => {
    if (!sessionState || !currentNavItem) {
      return true;
    }

    return (
      sessionState.isSuperAdmin ||
      sessionState.permissions[currentNavItem.permission]
    );
  }, [currentNavItem, sessionState]);

  async function handleLogout() {
    await fetch("/api/accesos/session", {
      method: "POST",
      credentials: "include",
    });
    window.sessionStorage.removeItem(ADMIN_ACCESS_STORAGE_KEY);
    setIsAuthenticated(false);
    setSessionState(null);
  }

  if (!authChecked) {
    return null;
  }

  if (pendingPasswordChange) {
    return (
      <AccessChangePasswordScreen
        email={pendingPasswordChange.accessUser.email}
        fullName={pendingPasswordChange.accessUser.fullName}
        currentPassword={pendingPasswordChange.currentPassword}
        onCompleted={async () => {
          setPendingPasswordChange(null);
          await refreshSession();
        }}
        onCancel={() => setPendingPasswordChange(null)}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <ExecutiveAccessLoginScreen
        storageKey={ADMIN_ACCESS_STORAGE_KEY}
        eyebrow="Acceso ejecutivo"
        title="Administración de citas"
        description="Ingresa usuario o correo y clave para revisar las solicitudes enviadas."
        showCredentialHint
        onAuthenticated={async () => {
          await refreshSession();
        }}
        onMustChangePassword={(accessUser, currentPassword) => {
          setPendingPasswordChange({ accessUser, currentPassword });
        }}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#eef3f9] text-[#0f2747]">
      <Suspense fallback={null}>
        <AdminNavigation
          onLogout={handleLogout}
          permissions={
            sessionState?.permissions ?? {
              solicitudes: false,
              calendario: false,
              motivos: false,
              ejecutivos: false,
              conductores: false,
              propietarios: false,
              pagoPropietario: false,
            }
          }
          isSuperAdmin={Boolean(sessionState?.isSuperAdmin)}
          canManageAccesos={Boolean(sessionState?.canManageAccesos)}
        />
      </Suspense>

      {!hasRouteAccess ? (
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h2 className="font-heading text-2xl font-semibold text-[#0f2747]">
            Sin permiso para este módulo
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Tu usuario no tiene acceso a esta sección. Contacta al administrador
            si necesitas permisos adicionales.
          </p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AdminShellInner>{children}</AdminShellInner>
    </Suspense>
  );
}
