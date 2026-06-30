import {
  FULL_ACCESS_PERMISSIONS,
  permissionsToDbData,
} from "@/lib/access-users";
import { hashPassword, normalizeEmail } from "@/lib/password-utils";
import { prisma } from "@/lib/prisma";

export function getSuperAdminEmail() {
  return normalizeEmail(
    process.env.ACCESS_SUPER_ADMIN_EMAIL ??
      "fmorillo@transportesapoquindo.cl",
  );
}

export function getSuperAdminTempPassword() {
  return (process.env.ACCESS_SUPER_ADMIN_TEMP_PASSWORD ?? "1818").trim();
}

export function generateAccessTemporaryPassword() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function findActiveAccessUserByEmail(email: string) {
  return prisma.accessUser.findFirst({
    where: {
      email: normalizeEmail(email),
      isActive: true,
    },
  });
}

export async function ensureSuperAdminUser() {
  const email = getSuperAdminEmail();
  const existing = await prisma.accessUser.findUnique({
    where: { email },
  });

  if (existing) {
    return existing;
  }

  const tempPassword = getSuperAdminTempPassword();

  return prisma.accessUser.create({
    data: {
      email,
      fullName: "Felix Morillo",
      passwordHash: hashPassword(tempPassword),
      isSuperAdmin: true,
      mustChangePassword: true,
      isActive: true,
      ...permissionsToDbData(FULL_ACCESS_PERMISSIONS),
    },
  });
}
