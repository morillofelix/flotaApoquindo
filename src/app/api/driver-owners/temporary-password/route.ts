import { readAdminSession } from "@/lib/driver-auth";
import {
  canSendTemporaryPassword,
  getTemporaryPasswordFromRut,
  hashPassword,
} from "@/lib/password-utils";
import { prisma } from "@/lib/prisma";
import {
  isTemporaryPasswordMailConfigured,
  sendTemporaryPasswordEmail,
} from "@/lib/temporary-password-mail";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type TemporaryPasswordBody = {
  driverOwnerId?: unknown;
};

export async function POST(request: NextRequest) {
  if (!readAdminSession(request)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  let body: TemporaryPasswordBody;

  try {
    body = (await request.json()) as TemporaryPasswordBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const driverOwnerId =
    typeof body.driverOwnerId === "string"
      ? body.driverOwnerId
      : typeof body.driverOwnerId === "number"
        ? String(body.driverOwnerId)
        : "";

  if (!driverOwnerId) {
    return NextResponse.json({ message: "Conductor inválido." }, { status: 400 });
  }

  if (!isTemporaryPasswordMailConfigured()) {
    return NextResponse.json(
      {
        message:
          "El envío de correo no está configurado. Contacta al administrador del sistema.",
      },
      { status: 503 },
    );
  }

  const driverOwner = await prisma.driverOwner.findUnique({
    where: { id: driverOwnerId },
  });

  if (!driverOwner) {
    return NextResponse.json(
      { message: "Conductor no encontrado." },
      { status: 404 },
    );
  }

  if (!driverOwner.isConductor) {
    return NextResponse.json(
      { message: "Solo se puede enviar clave a conductores." },
      { status: 400 },
    );
  }

  if (!driverOwner.email.trim()) {
    return NextResponse.json(
      { message: "El conductor no tiene correo registrado." },
      { status: 400 },
    );
  }

  const temporaryPassword = getTemporaryPasswordFromRut(driverOwner.rut);

  if (!temporaryPassword) {
    return NextResponse.json(
      {
        message:
          "El RUT debe tener al menos 4 dígitos para generar la clave temporal.",
      },
      { status: 400 },
    );
  }

  if (!canSendTemporaryPassword(driverOwner.tempPasswordSentAt)) {
    return NextResponse.json(
      {
        message:
          "Ya se envió una clave recientemente. Espera unos minutos antes de reenviar.",
      },
      { status: 429 },
    );
  }

  try {
    await sendTemporaryPasswordEmail({
      to: driverOwner.email.trim(),
      fullName: driverOwner.fullName,
      temporaryPassword,
    });

    await prisma.driverOwner.update({
      where: { id: driverOwner.id },
      data: {
        passwordHash: hashPassword(temporaryPassword),
        mustChangePassword: true,
        tempPasswordSentAt: new Date(),
      },
    });

    return NextResponse.json({
      message: `Clave temporal enviada a ${driverOwner.email.trim()}.`,
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
