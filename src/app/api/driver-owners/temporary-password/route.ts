import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  DriverTemporaryPasswordError,
  issueDriverOwnerTemporaryPassword,
} from "@/lib/driver-temporary-password-server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type TemporaryPasswordBody = {
  driverOwnerId?: unknown;
};

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  let body: TemporaryPasswordBody;

  try {
    body = (await request.json()) as TemporaryPasswordBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const driverOwnerId =
    typeof body.driverOwnerId === "string"
      ? body.driverOwnerId
      : typeof body.driverOwnerId === "number"
        ? String(body.driverOwnerId)
        : "";

  if (!driverOwnerId) {
    return NextResponse.json({ message: "Conductor inválido." }, { status: 400 });
  }

  try {
    const result = await issueDriverOwnerTemporaryPassword(driverOwnerId);

    return NextResponse.json({
      message: result.message,
    });
  } catch (error) {
    if (error instanceof DriverTemporaryPasswordError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        message: "No se pudo enviar la clave temporal.",
        detail:
          error instanceof Error ? error.message : "Error desconocido de correo.",
      },
      { status: 500 },
    );
  }
}
