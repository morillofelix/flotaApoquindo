import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  ensureDefaultOperationalStatuses,
  toOperationalStatusConfig,
} from "@/lib/operational-status";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: lista estados operativos (seed idempotente de defaults). Permiso Flota = conductores. */
export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const statuses = await ensureDefaultOperationalStatuses();
    return NextResponse.json({
      statuses: statuses.map(toOperationalStatusConfig),
    });
  } catch (error) {
    console.error("[operational-statuses GET]", error);
    return NextResponse.json(
      { message: "No se pudieron cargar los estados operativos." },
      { status: 500 },
    );
  }
}
