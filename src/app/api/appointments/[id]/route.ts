import { type AppointmentStatus } from "@/lib/appointments";
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
};

const validStatuses: AppointmentStatus[] = ["pendiente", "revisado", "rechazado"];

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

  if (
    typeof body.status !== "string" ||
    !validStatuses.includes(body.status as AppointmentStatus)
  ) {
    return NextResponse.json(
      { message: "Estado inválido." },
      { status: 400 },
    );
  }

  try {
    await prisma.appointment.update({
      where: { id },
      data: { status: body.status },
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
