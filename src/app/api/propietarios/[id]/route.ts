import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, _context: RouteContext) {
  return NextResponse.json(
    {
      message:
        "La eliminación de propietarios ya no está disponible. Puede inactivar o desvincular el registro.",
    },
    { status: 403 },
  );
}
