import {
  leasingErrorResponse,
  readLeasingJsonBody,
  requireLeasingAccess,
} from "@/lib/leasing-api-server";
import {
  cambiarEstadoLeasing,
  getLeasingActor,
  obtenerLeasingDetalle,
  sanitizeLeasingText,
  type LeasingAccionEstado,
} from "@/lib/leasing-server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ACCIONES: LeasingAccionEstado[] = [
  "confirmar",
  "suspender",
  "reactivar",
  "anular",
  "observaciones",
];

export async function GET(request: NextRequest, context: RouteContext) {
  const unauthorized = requireLeasingAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = await context.params;
    const detalle = await obtenerLeasingDetalle(id);

    if (!detalle) {
      return NextResponse.json({ message: "Leasing no encontrado." }, { status: 404 });
    }

    return NextResponse.json(detalle, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return leasingErrorResponse(error, "No se pudo cargar el leasing.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const body = await readLeasingJsonBody(request);
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const accion = ACCIONES.find((item) => item === value.accion);

  if (!accion) {
    return NextResponse.json({ message: "Acción no válida." }, { status: 400 });
  }

  const unauthorized = requireLeasingAccess(
    request,
    accion === "confirmar" ? "leasingCobros" : "leasingAdmin",
  );

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = await context.params;
    await cambiarEstadoLeasing(
      id,
      accion,
      {
        motivo: sanitizeLeasingText(value.motivo, 500),
        observaciones: sanitizeLeasingText(value.observaciones, 1000),
      },
      getLeasingActor(request),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return leasingErrorResponse(error, "No se pudo actualizar el leasing.");
  }
}
