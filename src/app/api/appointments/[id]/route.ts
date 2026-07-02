import { type AppointmentStatus, defaultExecutives } from "@/lib/appointments";
import { toAppointment, toReasonConfig } from "@/lib/appointments-mapper";
import { computeExecutiveAppointmentSlot } from "@/lib/executive-appointment-slot";
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

const validStatuses: AppointmentStatus[] = [
  "pendiente",
  "revisado",
  "aprobado",
  "rechazado",
  "cancelado",
];

async function ensureDefaultExecutives() {
  await prisma.executive.createMany({
    data: defaultExecutives,
    skipDuplicates: true,
  });
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
    scheduledStartTime?: string;
    scheduledEndTime?: string;
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
      body.assignedExecutive.length > 120
    ) {
      return NextResponse.json(
        { message: "Ejecutivo inválido." },
        { status: 400 },
      );
    }

    if (body.assignedExecutive !== "") {
      await ensureDefaultExecutives();
      const executive = await prisma.executive.findUnique({
        where: { name: body.assignedExecutive },
      });

      if (!executive?.isActive) {
        return NextResponse.json(
          { message: "Ejecutivo inválido." },
          { status: 400 },
        );
      }
    }

    data.assignedExecutive = body.assignedExecutive;

    if (body.assignedExecutive === "") {
      data.scheduledStartTime = "";
      data.scheduledEndTime = "";
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { message: "No hay datos para actualizar." },
      { status: 400 },
    );
  }

  try {
    const currentAppointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!currentAppointment) {
      return NextResponse.json(
        { message: "Solicitud no encontrada." },
        { status: 404 },
      );
    }

    const assignedExecutiveName =
      data.assignedExecutive ?? currentAppointment.assignedExecutive;

    if (assignedExecutiveName && data.assignedExecutive !== "") {
      const reasonRecord = await prisma.appointmentReason.findUnique({
        where: { value: currentAppointment.appointmentReason },
      });
      const reason = toReasonConfig(reasonRecord);

      if (!reason?.allowsExecutiveAssignment) {
        return NextResponse.json(
          { message: "Este motivo no permite derivación." },
          { status: 400 },
        );
      }

      const executive = await prisma.executive.findUnique({
        where: { name: assignedExecutiveName },
      });

      if (!executive?.isActive) {
        return NextResponse.json(
          { message: "Ejecutivo inválido." },
          { status: 400 },
        );
      }

      const existingAppointments = await prisma.appointment.findMany({
        where: {
          id: { not: id },
          assignedExecutive: assignedExecutiveName,
          appointmentDate: currentAppointment.appointmentDate,
          scheduledStartTime: { not: "" },
          scheduledEndTime: { not: "" },
        },
        select: {
          scheduledStartTime: true,
          scheduledEndTime: true,
        },
      });

      const slot = computeExecutiveAppointmentSlot({
        reason,
        executiveLunchBreak: {
          lunchBreakEnabled: executive.lunchBreakEnabled,
          lunchBreakStart: executive.lunchBreakStart,
          lunchBreakEnd: executive.lunchBreakEnd,
        },
        existingSlots: existingAppointments.map((appointment) => ({
          startTime: appointment.scheduledStartTime,
          endTime: appointment.scheduledEndTime,
        })),
      });

      if (!slot) {
        return NextResponse.json(
          { message: "No se pudo calcular el horario de la cita." },
          { status: 400 },
        );
      }

      data.scheduledStartTime = slot.startTime;
      data.scheduledEndTime = slot.endTime;
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data,
    });
    const reasonRecord = await prisma.appointmentReason.findUnique({
      where: { value: updatedAppointment.appointmentReason },
    });

    return NextResponse.json({
      ok: true,
      appointment: toAppointment(updatedAppointment, toReasonConfig(reasonRecord) ?? undefined),
    });
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
