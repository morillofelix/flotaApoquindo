import {
  canIssueAccessUserTemporaryPassword,
  issueAccessUserTemporaryPassword,
} from "@/lib/access-users-server";
import { requireSuperAdminSession } from "@/lib/admin-api-server";
import { isAccessUserMailConfigured } from "@/lib/access-user-mail";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type TemporaryPasswordBody = {
  accessUserId?: unknown;
};

export async function POST(request: NextRequest) {
  const unauthorized = requireSuperAdminSession(request);

  if (unauthorized) {
    return unauthorized;
  }

  let body: TemporaryPasswordBody;

  try {
    body = (await request.json()) as TemporaryPasswordBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const accessUserId =
    typeof body.accessUserId === "string" ? body.accessUserId.trim() : "";

  if (!accessUserId) {
    return NextResponse.json({ message: "Usuario inválido." }, { status: 400 });
  }

  if (!isAccessUserMailConfigured()) {
    return NextResponse.json(
      {
        message:
          "El envío de correo no está configurado. Contacta al administrador del sistema.",
      },
      { status: 503 },
    );
  }

  const accessUser = await prisma.accessUser.findUnique({
    where: { id: accessUserId },
  });

  if (!accessUser) {
    return NextResponse.json({ message: "Usuario no encontrado." }, { status: 404 });
  }

  if (!accessUser.isActive) {
    return NextResponse.json(
      { message: "El usuario está inactivo." },
      { status: 400 },
    );
  }

  if (!accessUser.email.trim()) {
    return NextResponse.json(
      { message: "El usuario no tiene correo registrado." },
      { status: 400 },
    );
  }

  if (!canIssueAccessUserTemporaryPassword(accessUser.tempPasswordSentAt)) {
    return NextResponse.json(
      {
        message:
          "Ya se envió una clave recientemente. Espera unos minutos antes de reenviar.",
      },
      { status: 429 },
    );
  }

  try {
    await issueAccessUserTemporaryPassword(accessUser);

    return NextResponse.json({
      message: `Clave temporal enviada a ${accessUser.email.trim()}.`,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Error desconocido de correo.";

    return NextResponse.json(
      {
        message: "No se pudo enviar la clave temporal.",
        detail,
      },
      { status: 500 },
    );
  }
}
