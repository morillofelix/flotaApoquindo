import {
  type AccessPermissionKey,
  canManageAccesos,
  FULL_ACCESS_PERMISSIONS,
} from "@/lib/access-users";
import {
  hasAdminPermission,
  readAdminSession,
} from "@/lib/driver-auth";
import { NextResponse, type NextRequest } from "next/server";

export function requireAdminSession(request: NextRequest) {
  const session = readAdminSession(request);

  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.mustChangePassword) {
    return NextResponse.json(
      { message: "Debes actualizar tu clave antes de continuar." },
      { status: 403 },
    );
  }

  return null;
}

export function requireAdminPermission(
  request: NextRequest,
  permission: AccessPermissionKey,
) {
  const session = readAdminSession(request);

  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.mustChangePassword) {
    return NextResponse.json(
      { message: "Debes actualizar tu clave antes de continuar." },
      { status: 403 },
    );
  }

  if (!hasAdminPermission(session, permission)) {
    return NextResponse.json({ message: "Sin permiso para este módulo." }, { status: 403 });
  }

  return null;
}

export function requireSuperAdminSession(request: NextRequest) {
  const session = readAdminSession(request);

  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (!canManageAccesos(session)) {
    return NextResponse.json({ message: "Acceso restringido." }, { status: 403 });
  }

  return null;
}

export function sanitizeServerErrorMessage(error: unknown, fallback: string) {
  if (process.env.NODE_ENV === "production") {
    return fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

export { FULL_ACCESS_PERMISSIONS };
