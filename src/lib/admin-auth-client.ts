import type { AccessPermissionKey, AccessPermissions } from "@/lib/access-users";

export type AdminNavLeaf = {
  kind: "link";
  label: string;
  href: string;
  permission: AccessPermissionKey;
  hideWhenDenied?: boolean;
  isActive: (pathname: string, vista: string | null) => boolean;
};

export type AdminNavGroupChild = {
  label: string;
  href: string;
  /** Si se omite, usa el permiso del grupo. */
  permission?: AccessPermissionKey;
  isActive: (pathname: string, vista: string | null) => boolean;
};

export type AdminNavGroup = {
  kind: "group";
  label: string;
  icon: "flota" | "administracion";
  /** Si se omite, el grupo se habilita cuando al menos un submenú está permitido. */
  permission?: AccessPermissionKey;
  children: AdminNavGroupChild[];
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
    icon: "flota",
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
        label: "Turnos",
        href: "/agendamientos/turnos",
        isActive: (pathname) => pathname.startsWith("/agendamientos/turnos"),
      },
      {
        label: "Estados operativos",
        href: "/agendamientos/estados-operativos",
        isActive: (pathname) =>
          pathname.startsWith("/agendamientos/estados-operativos"),
      },
      {
        label: "Motivos bloqueo",
        href: "/agendamientos/motivos-bloqueo",
        isActive: (pathname) =>
          pathname.startsWith("/agendamientos/motivos-bloqueo"),
      },
      {
        label: "Planificación mensual",
        href: "/agendamientos/planificacion-mensual",
        isActive: (pathname) =>
          pathname.startsWith("/agendamientos/planificacion-mensual"),
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
    kind: "group",
    label: "Administración",
    icon: "administracion",
    children: [
      {
        label: "Pago propietario",
        href: "/agendamientos/pago-propietario",
        permission: "pagoPropietario",
        isActive: (pathname) =>
          pathname.startsWith("/agendamientos/pago-propietario"),
      },
      {
        label: "Historial",
        href: "/agendamientos/historial",
        permission: "historial",
        isActive: (pathname) => pathname.startsWith("/agendamientos/historial"),
      },
      {
        label: "Leasing",
        href: "/agendamientos/leasing",
        permission: "leasing",
        isActive: (pathname) => pathname.startsWith("/agendamientos/leasing"),
      },
    ],
  },
];

export function canAccessAdminNavItem(
  permissions: AccessPermissions,
  permission: AccessPermissionKey,
  isSuperAdmin: boolean,
) {
  return isSuperAdmin || permissions[permission];
}

export function canAccessAdminNavChild(
  permissions: AccessPermissions,
  group: AdminNavGroup,
  child: AdminNavGroupChild,
  isSuperAdmin: boolean,
) {
  const permission = child.permission ?? group.permission;
  return permission ? canAccessAdminNavItem(permissions, permission, isSuperAdmin) : isSuperAdmin;
}

export function canAccessAdminNavGroup(
  permissions: AccessPermissions,
  group: AdminNavGroup,
  isSuperAdmin: boolean,
) {
  return group.permission
    ? canAccessAdminNavItem(permissions, group.permission, isSuperAdmin)
    : group.children.some((child) =>
        canAccessAdminNavChild(permissions, group, child, isSuperAdmin),
      );
}

export function getFirstPermittedAdminRoute(
  permissions: AccessPermissions,
  isSuperAdmin: boolean,
) {
  if (isSuperAdmin) {
    return "/agendamientos";
  }

  for (const item of ADMIN_NAV_ITEMS) {
    if (item.kind === "link") {
      if (canAccessAdminNavItem(permissions, item.permission, false)) {
        return item.href;
      }

      continue;
    }

    const child = item.children.find((entry) =>
      canAccessAdminNavChild(permissions, item, entry, false),
    );

    if (child) {
      return child.href;
    }
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

    if (item.kind === "group") {
      const child = item.children.find((entry) => entry.isActive(pathname, vista));
      const permission = child?.permission ?? item.permission;

      if (child && permission) {
        return { permission };
      }
    }
  }

  return undefined;
}

export function isAdminNavGroupActive(
  group: AdminNavGroup,
  pathname: string,
  vista: string | null,
) {
  return (
    group.children.some((child) => child.isActive(pathname, vista)) ||
    (group.icon === "flota" && isFlotaPath(pathname))
  );
}

export function isFlotaPath(pathname: string) {
  return (
    pathname.startsWith("/agendamientos/conductores") ||
    pathname.startsWith("/agendamientos/grupos") ||
    pathname.startsWith("/agendamientos/subgrupos") ||
    pathname.startsWith("/agendamientos/turnos") ||
    pathname.startsWith("/agendamientos/estados-operativos") ||
    pathname.startsWith("/agendamientos/motivos-bloqueo") ||
    pathname.startsWith("/agendamientos/planificacion-mensual")
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
