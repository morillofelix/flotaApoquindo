import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { validatePermanentPassword } from "@/lib/password-policy";

const SCRYPT_KEY_LENGTH = 64;

export function getTemporaryPasswordFromRut(rut: string) {
  const digits = rut.replace(/\D/g, "");

  if (digits.length < 4) {
    return null;
  }

  return digits.slice(0, 4);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");

  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");

  if (!salt || !hash) {
    return false;
  }

  const candidate = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString(
    "hex",
  );

  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
  } catch {
    return false;
  }
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export const LEGACY_ADMIN_USER = "ejecutivo";
export const LEGACY_ADMIN_PASSWORD = "12345678";

export function getLegacyAdminCredentials() {
  return {
    user: process.env.ADMIN_USER?.trim() || LEGACY_ADMIN_USER,
    password: process.env.ADMIN_PASSWORD?.trim() || LEGACY_ADMIN_PASSWORD,
  };
}

export function verifyAdminCredentials(user: string, password: string) {
  const { user: adminUser, password: adminPassword } = getLegacyAdminCredentials();

  if (!adminUser || !adminPassword) {
    return false;
  }

  const providedUser = Buffer.from(user.trim().toLowerCase());
  const expectedUser = Buffer.from(adminUser.toLowerCase());
  const providedPassword = Buffer.from(password.trim());
  const expectedPassword = Buffer.from(adminPassword);

  if (
    providedUser.length !== expectedUser.length ||
    providedPassword.length !== expectedPassword.length
  ) {
    return false;
  }

  return (
    timingSafeEqual(providedUser, expectedUser) &&
    timingSafeEqual(providedPassword, expectedPassword)
  );
}

export function canSendTemporaryPassword(
  lastSentAt?: Date | string | null,
  cooldownMinutes = 5,
) {
  if (!lastSentAt) {
    return true;
  }

  const lastSentMs =
    lastSentAt instanceof Date
      ? lastSentAt.getTime()
      : Date.parse(String(lastSentAt));

  if (Number.isNaN(lastSentMs)) {
    return true;
  }

  return Date.now() - lastSentMs >= cooldownMinutes * 60 * 1000;
}

export { validatePermanentPassword };
