import {
  leasingErrorResponse,
  readLeasingJsonBody,
  requireLeasingAccess,
} from "@/lib/leasing-api-server";
import {
  anularPagoLeasing,
  getLeasingActor,
  sanitizeLeasingText,
} from "@/lib/leasing-server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ pagoId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = requireLeasingAccess(request, "leasingAdmin");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { pagoId } = await context.params;
    const body = await readLeasingJsonBody(request);
    const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    await anularPagoLeasing(
      pagoId,
      sanitizeLeasingText(value.motivo, 500),
      getLeasingActor(request),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return leasingErrorResponse(error, "No se pudo anular el pago.");
  }
}
