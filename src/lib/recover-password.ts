import {
  canIssueAccessUserTemporaryPassword,
  findActiveAccessUserByEmail,
  issueAccessUserTemporaryPassword,
} from "@/lib/access-users-server";
import { isNotificaSmtpConfigured } from "@/lib/notifica-smtp";
import { prisma } from "@/lib/prisma";
import {
  canSendTemporaryPassword,
  getTemporaryPasswordFromRut,
  hashPassword,
  normalizeEmail,
} from "@/lib/password-utils";
import { sendTemporaryPasswordEmail } from "@/lib/temporary-password-mail";

export const GENERIC_RECOVER_PASSWORD_MESSAGE =
  "Si el correo está registrado, recibirás una clave temporal en los próximos minutos.";

export class RecoverPasswordRateLimitError extends Error {
  constructor() {
    super(
      "Ya se envió una clave recientemente. Espera unos minutos antes de reenviar.",
    );
    this.name = "RecoverPasswordRateLimitError";
  }
}

export class RecoverPasswordSmtpError extends Error {
  constructor() {
    super(
      "El envío de correo no está configurado. Contacta al administrador del sistema.",
    );
    this.name = "RecoverPasswordSmtpError";
  }
}

async function findActiveDriverByEmail(email: string) {
  return prisma.driverOwner.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      isActive: true,
      isConductor: true,
    },
  });
}

async function recoverAccessUserPassword(email: string) {
  const accessUser = await findActiveAccessUserByEmail(email);

  if (!accessUser?.email.trim()) {
    return false;
  }

  if (!canIssueAccessUserTemporaryPassword(accessUser.tempPasswordSentAt)) {
    throw new RecoverPasswordRateLimitError();
  }

  await issueAccessUserTemporaryPassword(accessUser);
  return true;
}

async function recoverDriverPassword(email: string) {
  const driverOwner = await findActiveDriverByEmail(email);

  if (!driverOwner?.email.trim()) {
    return false;
  }

  const temporaryPassword = getTemporaryPasswordFromRut(driverOwner.rut);

  if (!temporaryPassword) {
    return false;
  }

  if (!canSendTemporaryPassword(driverOwner.tempPasswordSentAt)) {
    throw new RecoverPasswordRateLimitError();
  }

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

  return true;
}

export function isRecoverPasswordMailConfigured() {
  return isNotificaSmtpConfigured();
}

export async function recoverPasswordByEmail(rawEmail: string) {
  const email = normalizeEmail(rawEmail);

  if (!isRecoverPasswordMailConfigured()) {
    throw new RecoverPasswordSmtpError();
  }

  if (await recoverAccessUserPassword(email)) {
    return { sent: true, accountType: "access" as const };
  }

  if (await recoverDriverPassword(email)) {
    return { sent: true, accountType: "driver" as const };
  }

  return { sent: false, accountType: null };
}
