import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  ensureDefaultBlockReasons,
  toBlockReasonConfig,
} from "@/lib/block-reasons";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: motivos de bloqueo (seed idempotente). Permiso Flota = conductores. */
export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const reasons = await ensureDefaultBlockReasons();
    return NextResponse.json({
      reasons: reasons.map(toBlockReasonConfig),
    });
  } catch (error) {
    console.error("[block-reasons GET]", error);
    return NextResponse.json(
      { message: "No se pudieron cargar los motivos de bloqueo." },
      { status: 500 },
    );
  }
}
