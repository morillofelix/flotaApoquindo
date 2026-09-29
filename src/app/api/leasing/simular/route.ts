import { generarCuotasLeasing, validateLeasingCalculoInput } from "@/lib/leasing";
import { readLeasingJsonBody, requireLeasingAccess } from "@/lib/leasing-api-server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const unauthorized = requireLeasingAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  const body = await readLeasingJsonBody(request);
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const input = {
    montoTotal: Number(value.montoTotal),
    cantidadCuotas: Number(value.cantidadCuotas),
    fechaInicio: typeof value.fechaInicio === "string" ? value.fechaInicio.trim() : "",
    diaCorte: Number(value.diaCorte),
  };
  const error = validateLeasingCalculoInput(input);

  if (error) {
    return NextResponse.json({ message: error }, { status: 400 });
  }

  return NextResponse.json({ cuotas: generarCuotasLeasing(input) });
}
