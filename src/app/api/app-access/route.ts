import { checkDriverAppAccess } from "@/lib/app-access-windows";
import { readDriverSession } from "@/lib/driver-auth";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = readDriverSession(request);
  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }
  const access = await checkDriverAppAccess(session.vehicleNumber);
  return NextResponse.json({
    allowed: access.allowed,
    restricted: access.restricted,
    message: access.message,
    todayWindow: access.todayWindow,
  });
}
