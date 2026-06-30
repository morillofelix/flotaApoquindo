import {
  findActiveAccessUserByEmail,
} from "@/lib/access-users-server";
import {
  FULL_ACCESS_PERMISSIONS,
  permissionsFromAccessUser,
} from "@/lib/access-users";
import { setAdminSessionCookie } from "@/lib/driver-auth";
import {
  hashPassword,
  normalizeEmail,
  validatePermanentPassword,
  verifyPassword,
} from "@/lib/password-utils";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ChangePasswordBody = {
  email?: unknown;
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

export async function POST(request: NextRequest) {
  let body: ChangePasswordBody;

  try {
    body = (await request.json()) as ChangePasswordBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword.trim() : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!email || !currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json(
      { message: "Completa todos los campos." },
      { status: 400 },
    );
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { message: "La clave nueva y su confirmación no coinciden." },
      { status: 400 },
    );
  }

  const validationMessage = validatePermanentPassword(newPassword);

  if (validationMessage) {
    return NextResponse.json({ message: validationMessage }, { status: 400 });
  }

  const accessUser = await findActiveAccessUserByEmail(email);

  if (
    !accessUser ||
    !accessUser.passwordHash ||
    !verifyPassword(currentPassword, accessUser.passwordHash)
  ) {
    return NextResponse.json(
      { message: "Correo o clave actual incorrectos." },
      { status: 401 },
    );
  }

  const updatedUser = await prisma.accessUser.update({
    where: { id: accessUser.id },
    data: {
      passwordHash: hashPassword(newPassword.trim()),
      mustChangePassword: false,
    },
  });

  const response = NextResponse.json({
    ok: true,
    message: "Clave actualizada correctamente.",
    accessUser: {
      email: updatedUser.email,
      fullName: updatedUser.fullName,
    },
  });

  if (
    !setAdminSessionCookie(response, {
      user: updatedUser.email,
      email: updatedUser.email,
      accessUserId: updatedUser.id,
      isSuperAdmin: updatedUser.isSuperAdmin,
      mustChangePassword: false,
      permissions: updatedUser.isSuperAdmin
        ? FULL_ACCESS_PERMISSIONS
        : permissionsFromAccessUser(updatedUser),
    })
  ) {
    return NextResponse.json(
      { message: "Sesión no configurada en el servidor." },
      { status: 500 },
    );
  }

  return response;
}
