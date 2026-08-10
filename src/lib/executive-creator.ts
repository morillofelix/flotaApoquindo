import { type AdminSession } from "@/lib/driver-auth";
import { prisma } from "@/lib/prisma";

export async function resolveExecutiveCreatorName(session: AdminSession) {
  const email = session.email?.trim().toLowerCase();

  if (email) {
    const executive = await prisma.executive.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        isActive: true,
      },
      select: { name: true },
    });

    if (executive?.name.trim()) {
      return executive.name.trim();
    }
  }

  if (session.accessUserId) {
    const accessUser = await prisma.accessUser.findUnique({
      where: { id: session.accessUserId },
      select: { fullName: true },
    });

    if (accessUser?.fullName.trim()) {
      return accessUser.fullName.trim();
    }
  }

  return session.email?.trim() || session.user;
}
