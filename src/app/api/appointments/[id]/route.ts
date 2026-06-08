import {
  type AppointmentStatus,
  executives,
} from "@/lib/appointments";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type PatchBody = {
  status?: unknown;
  assignedExecutive?: unknown;
};

const validStatuses: AppointmentStatus[] = ["pendiente", "revisado", "rechazado"];

function isValidExecutive(value: string) {
  return executives.some((executive) => executive === value);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  let body: PatchBody;

  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const data: {
    status?: AppointmentStatus;
    assignedExecutive?: string;
  } = {};

  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !validStatuses.includes(body.status as AppointmentStatus)
    ) {
      return NextResponse.json(
        { message: "Estado inválido." },
        { status: 400 },
      );
    }

    data.status = body.status as AppointmentStatus;
  }

  if (body.assignedExecutive !== undefined) {
    if (
      typeof body.assignedExecutive !== "string" ||
      (body.assignedExecutive !== "" && !isValidExecutive(body.assignedExecutive))
    ) {
      return NextResponse.json(
        { message: "Ejecutivo inválido." },
        { status: 400 },
      );
    }

    data.assignedExecutive = body.assignedExecutive;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { message: "No hay datos para actualizar." },
      { status: 400 },
    );
  }

  try {
    await prisma.appointment.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: "No se pudo actualizar la solicitud." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    await prisma.appointment.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: "No se pudo eliminar la solicitud." },
      { status: 500 },
    );
  }
}
