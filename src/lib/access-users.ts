export type AccessPermissionKey =
  | "solicitudes"
  | "calendario"
  | "motivos"
  | "ejecutivos"
  | "conductores"
  | "propietarios"
  | "historial"
  | "pagoPropietario"
  | "leasing"
  | "leasingCobros"
  | "leasingAdmin";

export type AccessPermissions = Record<AccessPermissionKey, boolean>;

export const ACCESS_PERMISSION_LABELS: Record<AccessPermissionKey, string> = {
  solicitudes: "Solicitudes",
  calendario: "Calendario",
  motivos: "Motivos",
  ejecutivos: "Ejecutivos",
  conductores: "Conductores",
  propietarios: "Propietarios",
  historial: "Historial",
  pagoPropietario: "Pago propietario",
  leasing: "Leasing",
  leasingCobros: "Leasing – cobros",
  leasingAdmin: "Leasing – administrar",
};

export const ACCESS_PERMISSION_KEYS = Object.keys(
  ACCESS_PERMISSION_LABELS,
) as AccessPermissionKey[];

export const FULL_ACCESS_PERMISSIONS: AccessPermissions = {
  solicitudes: true,
  calendario: true,
  motivos: true,
  ejecutivos: true,
  conductores: true,
  propietarios: true,
  historial: true,
  pagoPropietario: true,
  leasing: true,
  leasingCobros: true,
  leasingAdmin: true,
};

export const EMPTY_ACCESS_PERMISSIONS: AccessPermissions = {
  solicitudes: false,
  calendario: false,
  motivos: false,
  ejecutivos: false,
  conductores: false,
  propietarios: false,
  historial: false,
  pagoPropietario: false,
  leasing: false,
  leasingCobros: false,
  leasingAdmin: false,
};

export function normalizeAccessEmail(value: string) {
  return value.trim().toLowerCase();
}

export function getSuperAdminEmail() {
  return normalizeAccessEmail(
    process.env.ACCESS_SUPER_ADMIN_EMAIL ??
      "fmorillo@transportesapoquindo.cl",
  );
}

export function isSuperAdminEmail(email: string) {
  return normalizeAccessEmail(email) === getSuperAdminEmail();
}

export function canManageAccesos(session: {
  email?: string;
  user: string;
}) {
  return isSuperAdminEmail(session.email ?? session.user);
}

export type PublicAccessUser = {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  isActive: boolean;
  permissions: AccessPermissions;
  tempPasswordSentAt: string | null;
};

export type AccessUserPermissionColumns = {
  canSolicitudes: boolean;
  canCalendario: boolean;
  canMotivos: boolean;
  canEjecutivos: boolean;
  canConductores: boolean;
  canPropietarios: boolean;
  canHistorial: boolean;
  canPagoPropietario: boolean;
  canLeasing: boolean;
  canLeasingCobros: boolean;
  canLeasingAdmin: boolean;
};

export type AccessUserPermissionRecord = AccessUserPermissionColumns & {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  isActive: boolean;
  tempPasswordSentAt: Date | null;
};

export function permissionsFromAccessUser(
  user: AccessUserPermissionColumns,
): AccessPermissions {
  return {
    solicitudes: user.canSolicitudes,
    calendario: user.canCalendario,
    motivos: user.canMotivos,
    ejecutivos: user.canEjecutivos,
    conductores: user.canConductores,
    propietarios: user.canPropietarios,
    historial: user.canHistorial,
    pagoPropietario: user.canPagoPropietario,
    leasing: user.canLeasing,
    leasingCobros: user.canLeasingCobros,
    leasingAdmin: user.canLeasingAdmin,
  };
}

export function toPublicAccessUser(
  user: AccessUserPermissionRecord,
): PublicAccessUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isSuperAdmin: user.isSuperAdmin,
    mustChangePassword: user.mustChangePassword,
    isActive: user.isActive,
    permissions: user.isSuperAdmin
      ? FULL_ACCESS_PERMISSIONS
      : permissionsFromAccessUser(user),
    tempPasswordSentAt: user.tempPasswordSentAt?.toISOString() ?? null,
  };
}

export function parseAccessPermissionsInput(
  value: unknown,
): Partial<AccessPermissions> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const permissions = value as Record<string, unknown>;

  return Object.fromEntries(
    ACCESS_PERMISSION_KEYS.map((key) => [key, Boolean(permissions[key])]),
  ) as Partial<AccessPermissions>;
}

export function permissionsToDbData(permissions: Partial<AccessPermissions>) {
  return {
    canSolicitudes: Boolean(permissions.solicitudes),
    canCalendario: Boolean(permissions.calendario),
    canMotivos: Boolean(permissions.motivos),
    canEjecutivos: Boolean(permissions.ejecutivos),
    canConductores: Boolean(permissions.conductores),
    canPropietarios: Boolean(permissions.propietarios),
    canHistorial: Boolean(permissions.historial),
    canPagoPropietario: Boolean(permissions.pagoPropietario),
    canLeasing: Boolean(permissions.leasing),
    canLeasingCobros: Boolean(permissions.leasingCobros),
    canLeasingAdmin: Boolean(permissions.leasingAdmin),
  };
}
