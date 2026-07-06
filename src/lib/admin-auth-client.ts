import type { AccessPermissionKey, AccessPermissions } from "@/lib/access-users";

export type AdminNavItem = {
  label: string;
  href: string;
  permission: AccessPermissionKey;
  isActive: (pathname: string, vista: string | null) => boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
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
    label: "Feriados",
    href: "/agendamientos/feriados",
    permission: "motivos",
    isActive: (pathname) => pathname.startsWith("/agendamientos/feriados"),
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

export function canAccessAdminNavItem(
  permissions: AccessPermissions,
  permission: AccessPermissionKey,
  isSuperAdmin: boolean,
) {
  return isSuperAdmin || permissions[permission];
}

export function getFirstPermittedAdminRoute(
  permissions: AccessPermissions,
  isSuperAdmin: boolean,
) {
  if (isSuperAdmin) {
    return "/agendamientos";
  }

  const firstItem = ADMIN_NAV_ITEMS.find((item) =>
    canAccessAdminNavItem(permissions, item.permission, false),
  );

  return firstItem?.href ?? "/agendamientos";
}

export function findActiveAdminNavItem(
  pathname: string,
  vista: string | null,
) {
  return ADMIN_NAV_ITEMS.find((item) => item.isActive(pathname, vista));
}

export async function clearAdminSessionClient() {
  await fetch("/api/accesos/session", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  }).catch(() => undefined);
}

export async function fetchAdminSessionClient() {
  const response = await fetch("/api/accesos/session", {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as {
    email?: string;
    mustChangePassword?: boolean;
    permissions?: AccessPermissions;
    isSuperAdmin?: boolean;
    canManageAccesos?: boolean;
  };
}
