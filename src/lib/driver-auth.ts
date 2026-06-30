import type { AccessPermissionKey, AccessPermissions } from "@/lib/access-users";
import {
  canManageAccesos,
  FULL_ACCESS_PERMISSIONS,
  isSuperAdminEmail,
} from "@/lib/access-users";
import type { NextRequest, NextResponse } from "next/server";
import {
  getSessionSecret,
  signCookieValue,
  verifyCookieValue,
} from "@/lib/signed-cookie";

export const DRIVER_SESSION_COOKIE = "apoquindo-driver-session";
export const ADMIN_SESSION_COOKIE = "apoquindo-admin-session";

export type DriverSession = {
  vehicleNumber: string;
  email: string;
  fullName: string;
  mobilePhone: string;
  landlinePhone: string;
};

export type AdminSession = {
  user: string;
  email?: string;
  accessUserId?: string;
  isLegacyAdmin?: boolean;
  isSuperAdmin?: boolean;
  mustChangePassword?: boolean;
  permissions: AccessPermissions;
};

function getCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function normalizeAdminSession(
  session: Partial<AdminSession> & { user: string },
): AdminSession {
  const sessionEmail = session.email ?? session.user;
  const hasFullAccess =
    session.isLegacyAdmin ||
    session.isSuperAdmin ||
    isSuperAdminEmail(sessionEmail);

  if (hasFullAccess) {
    return {
      user: session.user,
      email: session.email,
      accessUserId: session.accessUserId,
      isLegacyAdmin: session.isLegacyAdmin,
      isSuperAdmin:
        Boolean(session.isLegacyAdmin || session.isSuperAdmin) ||
        isSuperAdminEmail(sessionEmail),
      mustChangePassword: session.mustChangePassword,
      permissions: FULL_ACCESS_PERMISSIONS,
    };
  }

  return {
    user: session.user,
    email: session.email,
    accessUserId: session.accessUserId,
    isLegacyAdmin: session.isLegacyAdmin,
    isSuperAdmin: session.isSuperAdmin,
    mustChangePassword: session.mustChangePassword,
    permissions: session.permissions ?? {
      solicitudes: false,
      calendario: false,
      motivos: false,
      ejecutivos: false,
      conductores: false,
      propietarios: false,
      pagoPropietario: false,
    },
  };
}

export function setDriverSessionCookie(
  response: NextResponse,
  session: DriverSession,
) {
  const secret = getSessionSecret();

  if (!secret) {
    return false;
  }

  response.cookies.set(
    DRIVER_SESSION_COOKIE,
    signCookieValue(session, secret),
    getCookieOptions(60 * 60 * 12),
  );

  return true;
}

export function clearDriverSessionCookie(response: NextResponse) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };

  response.cookies.set(DRIVER_SESSION_COOKIE, "", cookieOptions);
  response.cookies.delete(DRIVER_SESSION_COOKIE);
}

export function readDriverSession(request: NextRequest): DriverSession | null {
  const secret = getSessionSecret();
  const value = request.cookies.get(DRIVER_SESSION_COOKIE)?.value;

  if (!secret || !value) {
    return null;
  }

  return verifyCookieValue<DriverSession>(value, secret);
}

export function setAdminSessionCookie(
  response: NextResponse,
  session: AdminSession,
) {
  const secret = getSessionSecret();

  if (!secret) {
    return false;
  }

  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    signCookieValue(normalizeAdminSession(session), secret),
    getCookieOptions(60 * 60 * 12),
  );

  return true;
}

export function clearAdminSessionCookie(response: NextResponse) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };

  response.cookies.set(ADMIN_SESSION_COOKIE, "", cookieOptions);
  response.cookies.delete(ADMIN_SESSION_COOKIE);
}

export function readAdminSession(request: NextRequest): AdminSession | null {
  const secret = getSessionSecret();
  const value = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (!secret || !value) {
    return null;
  }

  const session = verifyCookieValue<AdminSession>(value, secret);

  if (!session?.user) {
    return null;
  }

  return normalizeAdminSession(session);
}

export function hasAdminPermission(
  session: AdminSession,
  permission: AccessPermissionKey,
) {
  if (
    session.isLegacyAdmin ||
    session.isSuperAdmin ||
    isSuperAdminEmail(session.email ?? session.user)
  ) {
    return true;
  }

  return Boolean(session.permissions[permission]);
}

export { canManageAccesos };

export function toPublicDriverOwner(driverOwner: {
  vehicleNumber: string;
  fullName: string;
  email: string;
  mobilePhone: string;
  landlinePhone: string;
  mustChangePassword: boolean;
}) {
  return {
    vehicleNumber: driverOwner.vehicleNumber,
    fullName: driverOwner.fullName,
    email: driverOwner.email.trim(),
    mobilePhone: driverOwner.mobilePhone,
    landlinePhone: driverOwner.landlinePhone,
    phone:
      driverOwner.mobilePhone.trim() || driverOwner.landlinePhone.trim(),
    mustChangePassword: driverOwner.mustChangePassword,
  };
}
