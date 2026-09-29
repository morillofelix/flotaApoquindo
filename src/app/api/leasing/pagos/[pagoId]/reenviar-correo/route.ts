import { leasingErrorResponse, requireLeasingAccess } from "@/lib/leasing-api-server";
import { reenviarCorreoPago } from "@/lib/leasing-email-server";
import { getLeasingActor } from "@/lib/leasing-server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ pagoId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = requireLeasingAccess(request, "leasingCobros");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { pagoId } = await context.params;
    const result = await reenviarCorreoPago(pagoId, getLeasingActor(request));
    return NextResponse.json({ ok: result.ok, message: result.message }, { status: result.status });
  } catch (error) {
    return leasingErrorResponse(error, "No se pudo reenviar el correo.");
  }
}
