import type { AccessUser } from "@prisma/client";
import { hashPassword, normalizeEmail } from "@/lib/password-utils";
import { prisma } from "@/lib/prisma";

export type AccessPermissionKey =
  | "solicitudes"
  | "calendario"
  | "motivos"
  | "ejecutivos"
  | "conductores"
  | "propietarios"
  | "pagoPropietario";

export type AccessPermissions = Record<AccessPermissionKey, boolean>;

export const ACCESS_PERMISSION_LABELS: Record<AccessPermissionKey, string> = {
  solicitudes: "Solicitudes",
  calendario: "Calendario",
  motivos: "Motivos",
  ejecutivos: "Ejecutivos",
  conductores: "Conductores",
  propietarios: "Propietarios",
  pagoPropietario: "Pago propietario",
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
  pagoPropietario: true,
};

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

export function getSuperAdminEmail() {
  return normalizeEmail(
    process.env.ACCESS_SUPER_ADMIN_EMAIL ??
      "fmorillo@transportesapoquindo.cl",
  );
}

export function getSuperAdminTempPassword() {
  return (process.env.ACCESS_SUPER_ADMIN_TEMP_PASSWORD ?? "1818").trim();
}

export function permissionsFromAccessUser(user: {
  canSolicitudes: boolean;
  canCalendario: boolean;
  canMotivos: boolean;
  canEjecutivos: boolean;
  canConductores: boolean;
  canPropietarios: boolean;
  canPagoPropietario: boolean;
}): AccessPermissions {
  return {
    solicitudes: user.canSolicitudes,
    calendario: user.canCalendario,
    motivos: user.canMotivos,
    ejecutivos: user.canEjecutivos,
    conductores: user.canConductores,
    propietarios: user.canPropietarios,
    pagoPropietario: user.canPagoPropietario,
  };
}

export function toPublicAccessUser(user: AccessUser): PublicAccessUser {
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

export function permissionsToDbData(permissions: Partial<AccessPermissions>) {
  return {
    canSolicitudes: Boolean(permissions.solicitudes),
    canCalendario: Boolean(permissions.calendario),
    canMotivos: Boolean(permissions.motivos),
    canEjecutivos: Boolean(permissions.ejecutivos),
    canConductores: Boolean(permissions.conductores),
    canPropietarios: Boolean(permissions.propietarios),
    canPagoPropietario: Boolean(permissions.pagoPropietario),
  };
}

export function generateAccessTemporaryPassword() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function findActiveAccessUserByEmail(email: string) {
  return prisma.accessUser.findFirst({
    where: {
      email: normalizeEmail(email),
      isActive: true,
    },
  });
}

export async function ensureSuperAdminUser() {
  const email = getSuperAdminEmail();
  const existing = await prisma.accessUser.findUnique({
    where: { email },
  });

  if (existing) {
    return existing;
  }

  const tempPassword = getSuperAdminTempPassword();

  return prisma.accessUser.create({
    data: {
      email,
      fullName: "Felix Morillo",
      passwordHash: hashPassword(tempPassword),
      isSuperAdmin: true,
      mustChangePassword: true,
      isActive: true,
      ...permissionsToDbData(FULL_ACCESS_PERMISSIONS),
    },
  });
}
