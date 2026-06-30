import { ensureSuperAdminUser } from "@/lib/access-users-server";
import {
  clearAdminSessionCookie,
  readAdminSession,
} from "@/lib/driver-auth";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await ensureSuperAdminUser();

  const session = readAdminSession(request);

  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  return NextResponse.json({
    user: session.user,
    email: session.email ?? session.user,
    isLegacyAdmin: Boolean(session.isLegacyAdmin),
    isSuperAdmin: Boolean(session.isLegacyAdmin || session.isSuperAdmin),
    mustChangePassword: Boolean(session.mustChangePassword),
    permissions: session.permissions,
  });
}

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}
