import { leasingErrorResponse, requireLeasingAccess } from "@/lib/leasing-api-server";
import { buscarPropietariosLeasing } from "@/lib/leasing-server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireLeasingAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json(
      { resultados: await buscarPropietariosLeasing(query) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return leasingErrorResponse(error, "No se pudo buscar propietarios.");
  }
}
