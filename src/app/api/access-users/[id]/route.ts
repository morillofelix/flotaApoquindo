import { getSuperAdminEmail } from "@/lib/access-users-server";
import {
  parseAccessPermissionsInput,
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
  return parseAccessPermissionsInput(value);
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const unauthorized = requireSuperAdminSession(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;

  let body: AccessUserBody;

  try {
    body = (await request.json()) as AccessUserBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const existing = await prisma.accessUser.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ message: "Usuario no encontrado." }, { status: 404 });
  }

  const nextEmail =
    typeof body.email === "string" ? normalizeEmail(body.email) : existing.email;

  if (!nextEmail || !emailPattern.test(nextEmail)) {
    return NextResponse.json({ message: "Correo inválido." }, { status: 400 });
  }

  if (existing.isSuperAdmin && nextEmail !== existing.email) {
    return NextResponse.json(
      { message: "No se puede cambiar el correo del super administrador." },
      { status: 400 },
    );
  }

  if (nextEmail !== existing.email) {
    const duplicate = await prisma.accessUser.findUnique({
      where: { email: nextEmail },
    });

    if (duplicate) {
      return NextResponse.json(
        { message: "Ya existe un usuario con ese correo." },
        { status: 409 },
      );
    }
  }

  const data: {
    email: string;
    fullName?: string;
    isActive?: boolean;
    canSolicitudes?: boolean;
    canCalendario?: boolean;
    canMotivos?: boolean;
    canEjecutivos?: boolean;
    canConductores?: boolean;
    canPropietarios?: boolean;
    canHistorial?: boolean;
    canPagoPropietario?: boolean;
    canLeasing?: boolean;
    canLeasingCobros?: boolean;
    canLeasingAdmin?: boolean;
  } = {
    email: nextEmail,
  };

  if (typeof body.fullName === "string") {
    data.fullName = body.fullName.trim();
  }

  if (typeof body.isActive === "boolean" && !existing.isSuperAdmin) {
    data.isActive = body.isActive;
  }

  if (body.permissions && !existing.isSuperAdmin) {
    Object.assign(data, permissionsToDbData(parsePermissions(body.permissions)));
  }

  try {
    const updated = await prisma.accessUser.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      user: toPublicAccessUser(updated),
      message: "Usuario actualizado.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: sanitizeServerErrorMessage(
          error,
          "No se pudo actualizar el usuario.",
        ),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const unauthorized = requireSuperAdminSession(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;

  const existing = await prisma.accessUser.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ message: "Usuario no encontrado." }, { status: 404 });
  }

  if (existing.isSuperAdmin || existing.email === getSuperAdminEmail()) {
    return NextResponse.json(
      { message: "No se puede eliminar al super administrador." },
      { status: 400 },
    );
  }

  await prisma.accessUser.delete({
    where: { id },
  });

  return NextResponse.json({ message: "Usuario eliminado." });
}
