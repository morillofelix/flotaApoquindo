import {
  ensureSuperAdminUser,
  getSuperAdminEmail,
} from "@/lib/access-users-server";
import {
  permissionsToDbData,
  toPublicAccessUser,
  type AccessPermissions,
} from "@/lib/access-users";
import {
  requireSuperAdminSession,
  sanitizeServerErrorMessage,
} from "@/lib/admin-api-server";
import { normalizeEmail } from "@/lib/password-utils";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AccessUserBody = {
  email?: unknown;
  fullName?: unknown;
  isActive?: unknown;
  permissions?: unknown;
};

function parsePermissions(value: unknown): Partial<AccessPermissions> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const permissions = value as Record<string, unknown>;

  return {
    solicitudes: Boolean(permissions.solicitudes),
    calendario: Boolean(permissions.calendario),
    motivos: Boolean(permissions.motivos),
    ejecutivos: Boolean(permissions.ejecutivos),
    conductores: Boolean(permissions.conductores),
    propietarios: Boolean(permissions.propietarios),
    pagoPropietario: Boolean(permissions.pagoPropietario),
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = requireSuperAdminSession(request);

  if (unauthorized) {
    return unauthorized;
  }

  await ensureSuperAdminUser();

  const users = await prisma.accessUser.findMany({
    orderBy: [{ isSuperAdmin: "desc" }, { fullName: "asc" }, { email: "asc" }],
  });

  return NextResponse.json({
    users: users.map(toPublicAccessUser),
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireSuperAdminSession(request);

  if (unauthorized) {
    return unauthorized;
  }

  let body: AccessUserBody;

  try {
    body = (await request.json()) as AccessUserBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const fullName =
    typeof body.fullName === "string" ? body.fullName.trim() : "";

  if (!email || !emailPattern.test(email)) {
    return NextResponse.json(
      { message: "Correo inválido." },
      { status: 400 },
    );
  }

  if (email === getSuperAdminEmail()) {
    return NextResponse.json(
      { message: "El super administrador ya existe." },
      { status: 400 },
    );
  }

  const existing = await prisma.accessUser.findUnique({
    where: { email },
  });

  if (existing) {
    return NextResponse.json(
      { message: "Ya existe un usuario con ese correo." },
      { status: 409 },
    );
  }

  try {
    const created = await prisma.accessUser.create({
      data: {
        email,
        fullName,
        isActive: true,
        mustChangePassword: false,
        ...permissionsToDbData(parsePermissions(body.permissions)),
      },
    });

    return NextResponse.json({
      user: toPublicAccessUser(created),
      message: "Usuario creado. Envía la clave temporal por correo.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: sanitizeServerErrorMessage(error, "No se pudo crear el usuario."),
      },
      { status: 500 },
    );
  }
}
