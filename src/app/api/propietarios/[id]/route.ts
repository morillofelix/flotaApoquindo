import { requireAdminPermission } from "@/lib/admin-api-server";
import { displayVehicleNumber } from "@/lib/propietarios";
import { notifyPropietarioDeleteSafely } from "@/lib/propietarios-notify-mail";
import { getPropietarioNotifyActor } from "@/lib/propietarios-notify";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type DeleteBody = {
  reason?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdminPermission(request, "propietarios");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ message: "Registro no encontrado." }, { status: 404 });
  }

  let body: DeleteBody = {};

  try {
    const rawBody = await request.text();

    if (rawBody.trim()) {
      body = JSON.parse(rawBody) as DeleteBody;
    }
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const reason = asString(body.reason);

  if (reason.length < 5) {
    return NextResponse.json(
      {
        message:
          "Debes indicar el motivo de eliminación (mínimo 5 caracteres).",
      },
      { status: 400 },
    );
  }

  const existingPropietario = await prisma.propietario.findUnique({
    where: { id },
  });

  if (!existingPropietario) {
    return NextResponse.json({ message: "Registro no encontrado." }, { status: 404 });
  }

  try {
    const notificationSent = await notifyPropietarioDeleteSafely({
      actor: getPropietarioNotifyActor(request),
      fullName: existingPropietario.fullName,
      rut: existingPropietario.rut,
      vehicleNumber: displayVehicleNumber(existingPropietario.vehicleNumber),
      reason,
    });

    await prisma.propietario.delete({
      where: { id },
    });

    return NextResponse.json({
      message: "Registro eliminado.",
      notificationSent,
    });
  } catch {
    return NextResponse.json(
      { message: "No se pudo eliminar el registro." },
      { status: 500 },
    );
  }
}
