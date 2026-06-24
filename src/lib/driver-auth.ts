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
  response.cookies.set(DRIVER_SESSION_COOKIE, "", {
    ...getCookieOptions(0),
    maxAge: 0,
  });
}

export function readDriverSession(request: NextRequest): DriverSession | null {
  const secret = getSessionSecret();
  const value = request.cookies.get(DRIVER_SESSION_COOKIE)?.value;

  if (!secret || !value) {
    return null;
  }

  return verifyCookieValue<DriverSession>(value, secret);
}

export function setAdminSessionCookie(response: NextResponse, user: string) {
  const secret = getSessionSecret();

  if (!secret) {
    return false;
  }

  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    signCookieValue({ user } satisfies AdminSession, secret),
    getCookieOptions(60 * 60 * 12),
  );

  return true;
}

export function readAdminSession(request: NextRequest): AdminSession | null {
  const secret = getSessionSecret();
  const value = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (!secret || !value) {
    return null;
  }

  return verifyCookieValue<AdminSession>(value, secret);
}

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
