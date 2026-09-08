import { ensureSuperAdminUser } from "@/lib/access-users-server";
import {
  canManageAccesos,
  FULL_ACCESS_PERMISSIONS,
  permissionsFromAccessUser,
} from "@/lib/access-users";
import {
  clearAdminSessionCookie,
  readAdminSession,
  setAdminSessionCookie,
} from "@/lib/driver-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await ensureSuperAdminUser();

  let session = readAdminSession(request);

  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.accessUserId && !session.isLegacyAdmin) {
    const accessUser = await prisma.accessUser.findUnique({
      where: { id: session.accessUserId },
    });

    if (!accessUser?.isActive) {
      const response = NextResponse.json(
        { message: "No autorizado." },
        { status: 401 },
      );
      clearAdminSessionCookie(response);
      return response;
    }

    session = {
      ...session,
      user: accessUser.email,
      email: accessUser.email,
      isSuperAdmin: accessUser.isSuperAdmin,
      mustChangePassword: accessUser.mustChangePassword,
      permissions: accessUser.isSuperAdmin
        ? FULL_ACCESS_PERMISSIONS
        : permissionsFromAccessUser(accessUser),
    };
  }

  const response = NextResponse.json({
    user: session.user,
    email: session.email ?? session.user,
    isLegacyAdmin: Boolean(session.isLegacyAdmin),
    isSuperAdmin: Boolean(session.isLegacyAdmin || session.isSuperAdmin),
    canManageAccesos: canManageAccesos(session),
    mustChangePassword: Boolean(session.mustChangePassword),
    permissions: session.permissions,
  });

  setAdminSessionCookie(response, session);
  return response;
}

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}
