import {
  FULL_ACCESS_PERMISSIONS,
  permissionsFromAccessUser,
  type AccessPermissionKey,
} from "@/lib/access-users";
import {
  hasAdminPermission,
  readAdminSession,
  type AdminSession,
} from "@/lib/driver-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export type HistoryAdminContext = {
  session: AdminSession;
  actorName: string;
  actorEmail: string;
  actorAccessUserId: string | null;
};

export async function resolveHistoryActor(
  request: NextRequest,
): Promise<Pick<
  HistoryAdminContext,
  "actorName" | "actorEmail" | "actorAccessUserId"
>> {
  const session = readAdminSession(request);
  const actorEmail = (session?.email ?? session?.user ?? "")
    .trim()
    .toLowerCase();

  if (!session?.accessUserId) {
    return {
      actorName: actorEmail || "Usuario del sistema",
      actorEmail,
      actorAccessUserId: null,
    };
  }

  const accessUser = await prisma.accessUser.findUnique({
    where: { id: session.accessUserId },
    select: { id: true, fullName: true, email: true },
  });

  return {
    actorName:
      accessUser?.fullName.trim() || accessUser?.email || actorEmail,
    actorEmail: accessUser?.email.trim().toLowerCase() || actorEmail,
    actorAccessUserId: accessUser?.id ?? null,
  };
}

export async function authorizeHistoryAdmin(
  request: NextRequest,
  requiredPermissions: AccessPermissionKey[],
): Promise<
  | { context: HistoryAdminContext; error: null }
  | { context: null; error: NextResponse }
> {
  const cookieSession = readAdminSession(request);

  if (!cookieSession) {
    return {
      context: null,
      error: NextResponse.json({ message: "No autorizado." }, { status: 401 }),
    };
  }

  if (cookieSession.mustChangePassword) {
    return {
      context: null,
      error: NextResponse.json(
        { message: "Debes actualizar tu clave antes de continuar." },
        { status: 403 },
      ),
    };
  }

  let session = cookieSession;
  let actorName = "";
  let actorAccessUserId: string | null = null;

  if (cookieSession.accessUserId && !cookieSession.isLegacyAdmin) {
    const accessUser = await prisma.accessUser.findUnique({
      where: { id: cookieSession.accessUserId },
    });

    if (!accessUser?.isActive) {
      return {
        context: null,
        error: NextResponse.json({ message: "No autorizado." }, { status: 401 }),
      };
    }

    actorName = accessUser.fullName.trim();
    actorAccessUserId = accessUser.id;
    session = {
      ...cookieSession,
      email: accessUser.email,
      isSuperAdmin: accessUser.isSuperAdmin,
      permissions: accessUser.isSuperAdmin
        ? FULL_ACCESS_PERMISSIONS
        : permissionsFromAccessUser(accessUser),
    };
  }

  if (
    requiredPermissions.some(
      (permission) => !hasAdminPermission(session, permission),
    )
  ) {
    return {
      context: null,
      error: NextResponse.json(
        { message: "Sin permiso para este módulo." },
        { status: 403 },
      ),
    };
  }

  return {
    context: {
      session,
      actorName: actorName || session.email || session.user,
      actorEmail: (session.email ?? session.user).trim().toLowerCase(),
      actorAccessUserId,
    },
    error: null,
  };
}
