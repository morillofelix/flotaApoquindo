import type { AccessPermissionKey, AccessPermissions } from "@/lib/access-users";

export type AdminNavLeaf = {
  kind: "link";
  label: string;
  href: string;
  permission: AccessPermissionKey;
  isActive: (pathname: string, vista: string | null) => boolean;
};

export type AdminNavGroup = {
  kind: "group";
  label: string;
  permission: AccessPermissionKey;
  children: Array<{
    label: string;
    href: string;
    isActive: (pathname: string, vista: string | null) => boolean;
  }>;
};

export type AdminNavItem = AdminNavLeaf | AdminNavGroup;

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    kind: "link",
    label: "Solicitudes",
    href: "/agendamientos",
    permission: "solicitudes",
    isActive: (pathname, vista) =>
      pathname === "/agendamientos" && vista !== "calendario",
  },
  {
    kind: "link",
    label: "Calendario",
    href: "/agendamientos?vista=calendario",
    permission: "calendario",
    isActive: (pathname, vista) =>
      pathname === "/agendamientos" && vista === "calendario",
  },
  {
    kind: "link",
    label: "Motivos",
    href: "/agendamientos/motivos",
    permission: "motivos",
    isActive: (pathname) => pathname.startsWith("/agendamientos/motivos"),
  },
  {
    kind: "link",
    label: "Feriados",
    href: "/agendamientos/feriados",
    permission: "motivos",
    isActive: (pathname) => pathname.startsWith("/agendamientos/feriados"),
  },
  {
    kind: "link",
    label: "Ejecutivos",
    href: "/agendamientos/ejecutivos",
    permission: "ejecutivos",
    isActive: (pathname) => pathname.startsWith("/agendamientos/ejecutivos"),
  },
  {
    kind: "group",
    label: "Flota",
    permission: "conductores",
    children: [
      {
        label: "Conductores",
        href: "/agendamientos/conductores",
        isActive: (pathname) => pathname.startsWith("/agendamientos/conductores"),
      },
      {
        label: "Grupos",
        href: "/agendamientos/grupos",
        isActive: (pathname) => pathname.startsWith("/agendamientos/grupos"),
      },
      {
        label: "Subgrupos",
        href: "/agendamientos/subgrupos",
        isActive: (pathname) => pathname.startsWith("/agendamientos/subgrupos"),
      },
    ],
  },
  {
    kind: "link",
    label: "Propietarios",
    href: "/agendamientos/propietarios",
    permission: "propietarios",
    isActive: (pathname) => pathname.startsWith("/agendamientos/propietarios"),
  },
  {
    kind: "link",
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

  for (const item of ADMIN_NAV_ITEMS) {
    if (!canAccessAdminNavItem(permissions, item.permission, false)) {
      continue;
    }

    if (item.kind === "link") {
      return item.href;
    }

    return item.children[0]?.href ?? "/agendamientos";
  }

  return "/agendamientos";
}

export function findActiveAdminNavItem(
  pathname: string,
  vista: string | null,
): { permission: AccessPermissionKey } | undefined {
  for (const item of ADMIN_NAV_ITEMS) {
    if (item.kind === "link" && item.isActive(pathname, vista)) {
      return { permission: item.permission };
    }

    if (
      item.kind === "group" &&
      item.children.some((child) => child.isActive(pathname, vista))
    ) {
      return { permission: item.permission };
    }
  }

  return undefined;
}

export function isFlotaPath(pathname: string) {
  return (
    pathname.startsWith("/agendamientos/conductores") ||
    pathname.startsWith("/agendamientos/grupos") ||
    pathname.startsWith("/agendamientos/subgrupos")
  );
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
