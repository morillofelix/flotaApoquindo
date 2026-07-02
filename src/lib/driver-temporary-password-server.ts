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

export class DriverTemporaryPasswordError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DriverTemporaryPasswordError";
    this.status = status;
  }
}

/** Envío único usado por datos generales, masivo y recuperación de clave. */
export async function issueDriverOwnerTemporaryPassword(driverOwnerId: string) {
  if (!isTemporaryPasswordMailConfigured()) {
    throw new DriverTemporaryPasswordError(
      "El envío de correo no está configurado. Contacta al administrador del sistema.",
      503,
    );
  }

  const driverOwner = await prisma.driverOwner.findUnique({
    where: { id: driverOwnerId },
  });

  if (!driverOwner) {
    throw new DriverTemporaryPasswordError("Conductor no encontrado.", 404);
  }

  if (!driverOwner.isConductor) {
    throw new DriverTemporaryPasswordError(
      "Solo se puede enviar clave a conductores.",
      400,
    );
  }

  if (!driverOwner.email.trim()) {
    throw new DriverTemporaryPasswordError(
      "El conductor no tiene correo registrado.",
      400,
    );
  }

  const temporaryPassword = getTemporaryPasswordFromRut(driverOwner.rut);

  if (!temporaryPassword) {
    throw new DriverTemporaryPasswordError(
      "El RUT debe tener al menos 4 dígitos para generar la clave temporal.",
      400,
    );
  }

  if (!canSendTemporaryPassword(driverOwner.tempPasswordSentAt)) {
    throw new DriverTemporaryPasswordError(
      "Ya se envió una clave recientemente. Espera unos minutos antes de reenviar.",
      429,
    );
  }

  try {
    await sendTemporaryPasswordEmail({
      to: driverOwner.email.trim(),
      fullName: driverOwner.fullName,
      temporaryPassword,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Error desconocido de correo.";

    throw new DriverTemporaryPasswordError(
      `No se pudo enviar la clave temporal. ${detail}`,
      500,
    );
  }

  await prisma.driverOwner.update({
    where: { id: driverOwner.id },
    data: {
      passwordHash: hashPassword(temporaryPassword),
      mustChangePassword: true,
      tempPasswordSentAt: new Date(),
    },
  });

  return {
    message: `Clave temporal enviada a ${driverOwner.email.trim()}.`,
    email: driverOwner.email.trim(),
    temporaryPassword,
  };
}
