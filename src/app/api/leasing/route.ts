import {
  leasingErrorResponse,
  readLeasingJsonBody,
  requireLeasingAccess,
} from "@/lib/leasing-api-server";
import {
  crearLeasing,
  getLeasingActor,
  listarLeasings,
  parseCrearLeasingBody,
  parseLeasingFiltros,
} from "@/lib/leasing-server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireLeasingAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const filtros = parseLeasingFiltros(new URL(request.url).searchParams);
    return NextResponse.json(await listarLeasings(filtros), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return leasingErrorResponse(error, "No se pudo cargar el listado de leasing.");
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireLeasingAccess(request, "leasingCobros");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const input = parseCrearLeasingBody(await readLeasingJsonBody(request));
    const created = await crearLeasing(input, getLeasingActor(request));
    return NextResponse.json({ id: created.id, numero: created.numero }, { status: 201 });
  } catch (error) {
    return leasingErrorResponse(error, "No se pudo crear el leasing.");
  }
}
