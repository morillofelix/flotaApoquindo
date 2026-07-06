import { type AppointmentStatus, defaultExecutives } from "@/lib/appointments";
import {
  appointmentDatesChanged,
  buildDateChangeMessage,
  canEditAppointmentDates,
  isValidClockTime,
  isValidDateOnly,
  shouldRescheduleExecutiveCalendar,
  type AppointmentDatePatch,
} from "@/lib/appointment-date-edit";
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
  appointmentDate?: unknown;
  vacationStartDate?: unknown;
  vacationEndDate?: unknown;
  permitStartDate?: unknown;
  permitEndDate?: unknown;
  permitDate?: unknown;
  permitStartTime?: unknown;
  permitEndTime?: unknown;
  acknowledgeDateChange?: unknown;
};

const validStatuses: AppointmentStatus[] = [
  "pendiente",
  "revisado",
  "aprobado",
  "rechazado",
  "cancelado",
];

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseDateField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDatePatch(body: PatchBody): AppointmentDatePatch | null {
  const patch: AppointmentDatePatch = {};
  let hasPatch = false;

  const appointmentDate = parseDateField(body.appointmentDate);
  const vacationStartDate = parseDateField(body.vacationStartDate);
  const vacationEndDate = parseDateField(body.vacationEndDate);
  const permitStartDate = parseDateField(body.permitStartDate);
  const permitEndDate = parseDateField(body.permitEndDate);
  const permitDate = parseDateField(body.permitDate);
  const permitStartTime =
    typeof body.permitStartTime === "string" ? body.permitStartTime.trim() : "";
  const permitEndTime =
    typeof body.permitEndTime === "string" ? body.permitEndTime.trim() : "";

  if (appointmentDate) {
    patch.appointmentDate = appointmentDate;
    hasPatch = true;
  }

  if (vacationStartDate) {
    patch.vacationStartDate = vacationStartDate;
    hasPatch = true;
  }

  if (vacationEndDate) {
    patch.vacationEndDate = vacationEndDate;
    hasPatch = true;
  }

  if (permitStartDate) {
    patch.permitStartDate = permitStartDate;
    hasPatch = true;
  }

  if (permitEndDate) {
    patch.permitEndDate = permitEndDate;
    hasPatch = true;
  }

  if (permitDate) {
    patch.permitDate = permitDate;
    hasPatch = true;
  }

  if (permitStartTime) {
    patch.permitStartTime = permitStartTime;
    hasPatch = true;
  }

  if (permitEndTime) {
    patch.permitEndTime = permitEndTime;
    hasPatch = true;
  }

  return hasPatch ? patch : null;
}

async function ensureDefaultExecutives() {
  await prisma.executive.createMany({
    data: defaultExecutives,
    skipDuplicates: true,
  });
}

async function rescheduleExecutiveSlot(
  appointmentId: string,
  appointmentDate: Date,
  assignedExecutiveName: string,
  appointmentReason: string,
) {
  const reasonRecord = await prisma.appointmentReason.findUnique({
    where: { value: appointmentReason },
  });
  const reason = toReasonConfig(reasonRecord);

  if (!reason?.allowsExecutiveAssignment) {
    return null;
  }

  const executive = await prisma.executive.findUnique({
    where: { name: assignedExecutiveName },
  });

  if (!executive?.isActive) {
    return null;
  }

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      id: { not: appointmentId },
      assignedExecutive: assignedExecutiveName,
      appointmentDate,
      scheduledStartTime: { not: "" },
      scheduledEndTime: { not: "" },
    },
    select: {
      scheduledStartTime: true,
      scheduledEndTime: true,
    },
  });

  return computeExecutiveAppointmentSlot({
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
}

function validateDatePatchForReason(
  patch: AppointmentDatePatch,
  reason: ReturnType<typeof toReasonConfig>,
  current: {
    permitType: string;
    vacationStartDate: Date | null;
    vacationEndDate: Date | null;
    permitStartDate: Date | null;
    permitEndDate: Date | null;
    permitDate: Date | null;
  },
) {
  if (!reason) {
    return "Motivo inválido.";
  }

  if (patch.appointmentDate !== undefined) {
    if (!reason.allowsExecutiveAssignment) {
      return "Este motivo no permite cambiar la fecha requerida.";
    }

    if (!isValidDateOnly(patch.appointmentDate)) {
      return "Ingresa una fecha válida.";
    }
  }

  if (patch.vacationStartDate !== undefined || patch.vacationEndDate !== undefined) {
    if (!reason.usesDateRange) {
      return "Este motivo no usa rango de vacaciones.";
    }

    const start = patch.vacationStartDate;
    const end = patch.vacationEndDate;

    if (!start || !end || !isValidDateOnly(start) || !isValidDateOnly(end) || end < start) {
      return "Ingresa un rango de vacaciones válido.";
    }
  }

  if (patch.permitStartDate !== undefined || patch.permitEndDate !== undefined) {
    if (!reason.usesPermitDetails || current.permitType !== "dias") {
      return "Este permiso no permite cambiar ese rango.";
    }

    const start = patch.permitStartDate;
    const end = patch.permitEndDate;

    if (!start || !end || !isValidDateOnly(start) || !isValidDateOnly(end) || end < start) {
      return "Ingresa un rango de permiso válido.";
    }
  }

  if (
    patch.permitDate !== undefined ||
    patch.permitStartTime !== undefined ||
    patch.permitEndTime !== undefined
  ) {
    if (!reason.usesPermitDetails || current.permitType !== "horas") {
      return "Este permiso no permite cambiar esa fecha u horario.";
    }

    const permitDate = patch.permitDate;
    const permitStartTime = patch.permitStartTime;
    const permitEndTime = patch.permitEndTime;

    if (
      !permitDate ||
      !permitStartTime ||
      !permitEndTime ||
      !isValidDateOnly(permitDate) ||
      !isValidClockTime(permitStartTime) ||
      !isValidClockTime(permitEndTime) ||
      permitEndTime <= permitStartTime
    ) {
      return "Ingresa una fecha y horario de permiso válidos.";
    }
  }

  return "";
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

  if (body.acknowledgeDateChange === true) {
    try {
      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: {
          dateChangePending: false,
          dateChangeMessage: "",
        },
      });
      const reasonRecord = await prisma.appointmentReason.findUnique({
        where: { value: updatedAppointment.appointmentReason },
      });

      return NextResponse.json({
        ok: true,
        appointment: toAppointment(
          updatedAppointment,
          toReasonConfig(reasonRecord) ?? undefined,
        ),
      });
    } catch {
      return NextResponse.json(
        { message: "No se pudo actualizar la solicitud." },
        { status: 500 },
      );
    }
  }

  const data: {
    status?: AppointmentStatus;
    assignedExecutive?: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
    appointmentDate?: Date;
    vacationStartDate?: Date | null;
    vacationEndDate?: Date | null;
    permitStartDate?: Date | null;
    permitEndDate?: Date | null;
    permitDate?: Date | null;
    permitStartTime?: string;
    permitEndTime?: string;
    dateChangePending?: boolean;
    dateChangeMessage?: string;
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

  const datePatch = parseDatePatch(body);

  if (Object.keys(data).length === 0 && !datePatch) {
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

    const reasonRecord = await prisma.appointmentReason.findUnique({
      where: { value: currentAppointment.appointmentReason },
    });
    const reason = toReasonConfig(reasonRecord);
    const previousAppointment = toAppointment(
      currentAppointment,
      reason ?? undefined,
    );

    let requiresCalendarCancel = false;

    if (datePatch) {
      if (!canEditAppointmentDates(previousAppointment.status)) {
        return NextResponse.json(
          {
            message:
              "Solo se pueden cambiar fechas en solicitudes pendientes, agendadas o aprobadas.",
          },
          { status: 400 },
        );
      }

      const validationMessage = validateDatePatchForReason(
        {
          ...datePatch,
          permitDate:
            datePatch.permitDate ??
            (datePatch.permitStartTime || datePatch.permitEndTime
              ? previousAppointment.permitDate
              : undefined),
          permitStartTime:
            datePatch.permitStartTime ??
            (datePatch.permitDate || datePatch.permitEndTime
              ? previousAppointment.permitStartTime
              : undefined),
          permitEndTime:
            datePatch.permitEndTime ??
            (datePatch.permitDate || datePatch.permitStartTime
              ? previousAppointment.permitEndTime
              : undefined),
        },
        reason,
        currentAppointment,
      );

      if (validationMessage) {
        return NextResponse.json({ message: validationMessage }, { status: 400 });
      }

      if (!appointmentDatesChanged(previousAppointment, datePatch)) {
        return NextResponse.json(
          { message: "No hay cambios de fecha para guardar." },
          { status: 400 },
        );
      }

      if (datePatch.appointmentDate !== undefined) {
        data.appointmentDate = toDateOnly(datePatch.appointmentDate);
      }

      if (datePatch.vacationStartDate !== undefined) {
        data.vacationStartDate = toDateOnly(datePatch.vacationStartDate);
      }

      if (datePatch.vacationEndDate !== undefined) {
        data.vacationEndDate = toDateOnly(datePatch.vacationEndDate);
      }

      if (datePatch.permitStartDate !== undefined) {
        data.permitStartDate = toDateOnly(datePatch.permitStartDate);
      }

      if (datePatch.permitEndDate !== undefined) {
        data.permitEndDate = toDateOnly(datePatch.permitEndDate);
      }

      if (datePatch.permitDate !== undefined) {
        data.permitDate = toDateOnly(datePatch.permitDate);
      }

      if (datePatch.permitStartTime !== undefined) {
        data.permitStartTime = datePatch.permitStartTime;
      }

      if (datePatch.permitEndTime !== undefined) {
        data.permitEndTime = datePatch.permitEndTime;
      }

      requiresCalendarCancel = shouldRescheduleExecutiveCalendar(previousAppointment);
    }

    const assignedExecutiveName =
      data.assignedExecutive ?? currentAppointment.assignedExecutive;

    if (assignedExecutiveName && data.assignedExecutive !== "") {
      if (!reason?.allowsExecutiveAssignment) {
        return NextResponse.json(
          { message: "Este motivo no permite derivación." },
          { status: 400 },
        );
      }

      const appointmentDateForSlot =
        data.appointmentDate ?? currentAppointment.appointmentDate;

      const slot = await rescheduleExecutiveSlot(
        id,
        appointmentDateForSlot,
        assignedExecutiveName,
        currentAppointment.appointmentReason,
      );

      if (!slot) {
        return NextResponse.json(
          { message: "No se pudo calcular el horario de la cita." },
          { status: 400 },
        );
      }

      data.scheduledStartTime = slot.startTime;
      data.scheduledEndTime = slot.endTime;
    } else if (datePatch?.appointmentDate && assignedExecutiveName) {
      const slot = await rescheduleExecutiveSlot(
        id,
        data.appointmentDate!,
        assignedExecutiveName,
        currentAppointment.appointmentReason,
      );

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

    let savedAppointment = toAppointment(
      updatedAppointment,
      reason ?? undefined,
    );

    if (datePatch) {
      const dateChangeMessage = buildDateChangeMessage(
        previousAppointment,
        savedAppointment,
      );

      if (dateChangeMessage) {
        const appointmentWithNotice = await prisma.appointment.update({
          where: { id },
          data: {
            dateChangePending: true,
            dateChangeMessage,
          },
        });

        savedAppointment = toAppointment(
          appointmentWithNotice,
          reason ?? undefined,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      appointment: savedAppointment,
      dateChange: datePatch
        ? {
            occurred: true,
            requiresCalendarCancel,
            requiresCalendarInvite: shouldRescheduleExecutiveCalendar(
              savedAppointment,
            ),
            previousAppointment,
          }
        : null,
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
