import {
  FULL_ACCESS_PERMISSIONS,
  permissionsFromAccessUser,
} from "@/lib/access-users";
import {
  ensureSuperAdminUser,
  findActiveAccessUserByEmail,
} from "@/lib/access-users-server";
import {
  setAdminSessionCookie,
  type AdminSession,
} from "@/lib/driver-auth";
import {
  verifyAdminCredentials,
  verifyPassword,
} from "@/lib/password-utils";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type LoginBody = {
  user?: unknown;
  password?: unknown;
};

type LoginAccessUser = {
  email: string;
  fullName: string;
};

function buildLegacySession(user: string): AdminSession {
  return {
    user,
    isLegacyAdmin: true,
    isSuperAdmin: true,
    permissions: FULL_ACCESS_PERMISSIONS,
  };
}

function buildAccessUserSession(
  accessUser: {
    id: string;
    email: string;
    fullName: string;
    isSuperAdmin: boolean;
    mustChangePassword: boolean;
    canSolicitudes: boolean;
    canCalendario: boolean;
    canMotivos: boolean;
    canEjecutivos: boolean;
    canConductores: boolean;
    canPropietarios: boolean;
    canPagoPropietario: boolean;
  },
): AdminSession {
  return {
    user: accessUser.email,
    email: accessUser.email,
    accessUserId: accessUser.id,
    isSuperAdmin: accessUser.isSuperAdmin,
    mustChangePassword: accessUser.mustChangePassword,
    permissions: accessUser.isSuperAdmin
      ? FULL_ACCESS_PERMISSIONS
      : permissionsFromAccessUser(accessUser),
  };
}

export async function POST(request: NextRequest) {
  await ensureSuperAdminUser();

  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const userInput = typeof body.user === "string" ? body.user.trim() : "";
  const password =
    typeof body.password === "string" ? body.password.trim() : "";

  if (!userInput || !password) {
    return NextResponse.json(
      { message: "Usuario o correo y clave requeridos." },
      { status: 400 },
    );
  }

  if (verifyAdminCredentials(userInput, password)) {
    const response = NextResponse.json({ ok: true, isLegacyAdmin: true });

    if (!setAdminSessionCookie(response, buildLegacySession(userInput))) {
      return NextResponse.json(
        { message: "Sesión de administrador no configurada." },
        { status: 500 },
      );
    }

    return response;
  }

  const accessUser = await findActiveAccessUserByEmail(userInput);

  if (
    !accessUser ||
    !accessUser.passwordHash ||
    !verifyPassword(password, accessUser.passwordHash)
  ) {
    return NextResponse.json(
      { message: "Usuario o clave incorrectos." },
      { status: 401 },
    );
  }

  const publicAccessUser: LoginAccessUser = {
    email: accessUser.email,
    fullName: accessUser.fullName,
  };

  if (accessUser.mustChangePassword) {
    return NextResponse.json({
      ok: true,
      mustChangePassword: true,
      accessUser: publicAccessUser,
    });
  }

  const response = NextResponse.json({
    ok: true,
    accessUser: publicAccessUser,
    isSuperAdmin: accessUser.isSuperAdmin,
  });

  if (!setAdminSessionCookie(response, buildAccessUserSession(accessUser))) {
    return NextResponse.json(
      { message: "Sesión de administrador no configurada." },
      { status: 500 },
    );
  }

  return response;
}
