import {
  FULL_ACCESS_PERMISSIONS,
  getSuperAdminEmail,
  permissionsToDbData,
} from "@/lib/access-users";
import {
  sendAccessUserTemporaryPasswordEmail,
} from "@/lib/access-user-mail";
import { hashPassword, normalizeEmail } from "@/lib/password-utils";
import { prisma } from "@/lib/prisma";

export { getSuperAdminEmail };

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

type IssueTemporaryPasswordOptions = {
  isNewUser?: boolean;
};

export async function issueAccessUserTemporaryPassword(
  accessUser: {
    id: string;
    email: string;
    fullName: string;
  },
  options: IssueTemporaryPasswordOptions = {},
) {
  const temporaryPassword = generateAccessTemporaryPassword();

  await sendAccessUserTemporaryPasswordEmail({
    to: accessUser.email.trim(),
    email: accessUser.email.trim(),
    fullName: accessUser.fullName,
    temporaryPassword,
    isNewUser: options.isNewUser,
  });

  await prisma.accessUser.update({
    where: { id: accessUser.id },
    data: {
      passwordHash: hashPassword(temporaryPassword),
      mustChangePassword: true,
      tempPasswordSentAt: new Date(),
    },
  });

  return temporaryPassword;
}

export function canIssueAccessUserTemporaryPassword(
  lastSentAt?: Date | string | null,
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

  return Date.now() - lastSentMs >= 5 * 60 * 1000;
}

export async function ensureSuperAdminUser() {
  const email = getSuperAdminEmail();
  const existing = await prisma.accessUser.findUnique({
    where: { email },
  });

  if (existing) {
    return prisma.accessUser.update({
      where: { email },
      data: {
        isSuperAdmin: true,
        isActive: true,
        ...permissionsToDbData(FULL_ACCESS_PERMISSIONS),
      },
    });
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
