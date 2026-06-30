"use client";

import AccessChangePasswordScreen from "@/components/AccessChangePasswordScreen";
import ExecutiveAccessLoginScreen, {
  type LoginAccessUser,
} from "@/components/ExecutiveAccessLoginScreen";
import type { AccessPermissions } from "@/lib/access-users";
import {
  ADMIN_NAV_ITEMS,
  canAccessAdminNavItem,
  clearAdminSessionClient,
  fetchAdminSessionClient,
  findActiveAdminNavItem,
  getFirstPermittedAdminRoute,
} from "@/lib/admin-auth-client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type AdminSessionState = {
  permissions: AccessPermissions;
  isSuperAdmin: boolean;
  canManageAccesos: boolean;
};

const emptyPermissions = (): AccessPermissions => ({
  solicitudes: false,
  calendario: false,
  motivos: false,
  ejecutivos: false,
  conductores: false,
  propietarios: false,
  pagoPropietario: false,
});

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

  return (
    <nav className="border-b border-[#b7cce4] bg-[#d7e7f8] shadow-sm shadow-slate-200/40">
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-3 px-3 py-3 sm:px-6 xl:px-10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1">
            {ADMIN_NAV_ITEMS.map((item) => {
              const active = item.isActive(pathname, vista);
              const allowed = canAccessAdminNavItem(
                permissions,
                item.permission,
                isSuperAdmin,
              );

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-disabled={!allowed}
                  title={
                    allowed
                      ? item.label
                      : `${item.label} (sin permiso de acceso)`
                  }
                  className={`inline-flex h-9 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${
                    allowed
                      ? active
                        ? "bg-[#0b5cab] text-white shadow-md shadow-blue-900/15"
                        : "text-[#173b68] hover:bg-white/75"
                      : active
                        ? "cursor-not-allowed border border-[#c5d8eb] bg-white/50 text-slate-400"
                        : "cursor-not-allowed text-slate-400/90 hover:bg-white/40"
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
              Portal conductores
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
  const router = useRouter();
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
    const data = await fetchAdminSessionClient();

    if (!data) {
      setIsAuthenticated(false);
      setSessionState(null);
      return false;
    }

    if (data.mustChangePassword) {
      setIsAuthenticated(false);
      setSessionState(null);
      return false;
    }

    const nextSession: AdminSessionState = {
      permissions: data.permissions ?? emptyPermissions(),
      isSuperAdmin: Boolean(data.isSuperAdmin),
      canManageAccesos: Boolean(data.canManageAccesos),
    };

    setSessionState(nextSession);
    setIsAuthenticated(true);
    return true;
  }

  useEffect(() => {
    refreshSession().finally(() => setAuthChecked(true));
  }, []);

  const currentNavItem = useMemo(
    () => findActiveAdminNavItem(pathname, vista),
    [pathname, vista],
  );

  const hasRouteAccess = useMemo(() => {
    if (!sessionState || !currentNavItem) {
      return true;
    }

    return canAccessAdminNavItem(
      sessionState.permissions,
      currentNavItem.permission,
      sessionState.isSuperAdmin,
    );
  }, [currentNavItem, sessionState]);

  async function handleLogout() {
    await clearAdminSessionClient();
    setIsAuthenticated(false);
    setSessionState(null);
    setPendingPasswordChange(null);
    window.location.assign("/agendamientos");
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
          const authenticated = await refreshSession();

          if (!authenticated) {
            return;
          }

          const data = await fetchAdminSessionClient();

          if (data?.permissions) {
            router.replace(
              getFirstPermittedAdminRoute(
                data.permissions,
                Boolean(data.isSuperAdmin),
              ),
            );
          }
        }}
        onCancel={() => setPendingPasswordChange(null)}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <ExecutiveAccessLoginScreen
        eyebrow="Acceso ejecutivo"
        title="Administración de citas"
        description="Ingresa usuario o correo y clave para revisar las solicitudes enviadas."
        showCredentialHint
        onAuthenticated={async () => {
          const authenticated = await refreshSession();

          if (!authenticated) {
            return;
          }

          const data = await fetchAdminSessionClient();

          if (!data?.permissions) {
            router.replace("/agendamientos");
            return;
          }

          const current = findActiveAdminNavItem(pathname, vista);
          const allowed = current
            ? canAccessAdminNavItem(
                data.permissions,
                current.permission,
                Boolean(data.isSuperAdmin),
              )
            : true;

          if (!allowed) {
            router.replace(
              getFirstPermittedAdminRoute(
                data.permissions,
                Boolean(data.isSuperAdmin),
              ),
            );
          }
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
          permissions={sessionState?.permissions ?? emptyPermissions()}
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
            Puedes ver el menú completo, pero tu usuario no tiene acceso a esta
            sección. Contacta al administrador si necesitas permisos
            adicionales.
          </p>
          <button
            type="button"
            onClick={() =>
              router.replace(
                getFirstPermittedAdminRoute(
                  sessionState?.permissions ?? emptyPermissions(),
                  Boolean(sessionState?.isSuperAdmin),
                ),
              )
            }
            className="mt-6 inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white transition hover:bg-[#084a8c]"
          >
            Ir a un módulo permitido
          </button>
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
