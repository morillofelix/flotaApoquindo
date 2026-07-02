import {
  canIssueAccessUserTemporaryPassword,
  findActiveAccessUserByEmail,
  issueAccessUserTemporaryPassword,
} from "@/lib/access-users-server";
import {
  DriverTemporaryPasswordError,
  issueDriverOwnerTemporaryPassword,
} from "@/lib/driver-temporary-password-server";
import { isNotificaSmtpConfigured } from "@/lib/notifica-smtp";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/password-utils";

export type RecoverPasswordAudience = "driver" | "admin";

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

export class RecoverPasswordAudienceError extends Error {
  constructor() {
    super("Tipo de recuperación inválido.");
    this.name = "RecoverPasswordAudienceError";
  }
}

function isRecoverPasswordAudience(
  value: unknown,
): value is RecoverPasswordAudience {
  return value === "driver" || value === "admin";
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

  if (!driverOwner?.email.trim() || !driverOwner.id) {
    return false;
  }

  try {
    await issueDriverOwnerTemporaryPassword(driverOwner.id);
    return true;
  } catch (error) {
    if (error instanceof DriverTemporaryPasswordError && error.status === 429) {
      throw new RecoverPasswordRateLimitError();
    }

    if (
      error instanceof DriverTemporaryPasswordError &&
      (error.status === 400 || error.status === 404)
    ) {
      return false;
    }

    throw error;
  }
}

export function isRecoverPasswordMailConfigured() {
  return isNotificaSmtpConfigured();
}

export async function recoverPasswordByEmail(
  rawEmail: string,
  audience: RecoverPasswordAudience,
) {
  const email = normalizeEmail(rawEmail);

  if (!isRecoverPasswordMailConfigured()) {
    throw new RecoverPasswordSmtpError();
  }

  if (audience === "admin") {
    const sent = await recoverAccessUserPassword(email);
    return { sent, accountType: sent ? ("access" as const) : null };
  }

  if (audience === "driver") {
    const sent = await recoverDriverPassword(email);
    return { sent, accountType: sent ? ("driver" as const) : null };
  }

  throw new RecoverPasswordAudienceError();
}

export function parseRecoverPasswordAudience(value: unknown) {
  if (!isRecoverPasswordAudience(value)) {
    throw new RecoverPasswordAudienceError();
  }

  return value;
}
