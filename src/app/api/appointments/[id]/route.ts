import { type AppointmentStatus } from "@/lib/appointments";
import {
  appointmentDatesChanged,
  buildCancellationMessage,
  buildDateChangeMessage,
  canEditAppointmentDates,
  isValidClockTime,
  isValidDateOnly,
  shouldRescheduleExecutiveCalendar,
  type AppointmentDatePatch,
} from "@/lib/appointment-date-edit";
import {
  addMinutesToClockTime,
  formatClockTime,
  getReasonAppointmentDurationMinutes,
} from "@/lib/appointment-scheduling";
import { toAppointment, toReasonConfig } from "@/lib/appointments-mapper";
import { parseClockTime } from "@/lib/executive-appointment-slot";
import { validateExecutiveAssignmentForDate } from "@/lib/executive-assignment-server";
import { requireAdminPermission, requireDriverSession } from "@/lib/admin-api-server";
import { readDriverSession } from "@/lib/driver-auth";
import { normalizeVehicleNumber } from "@/lib/driver-owners";
import { normalizeEmail } from "@/lib/password-utils";
import { prisma } from "@/lib/prisma";
import { seedExecutivesIfEmpty } from "@/lib/executive-seed-server";
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
  scheduledStartTime?: unknown;
  scheduledEndTime?: unknown;
  vacationStartDate?: unknown;
  vacationEndDate?: unknown;
  permitStartDate?: unknown;
  permitEndDate?: unknown;
  permitDate?: unknown;
  permitStartTime?: unknown;
  permitEndTime?: unknown;
  swapFromDate?: unknown;
  swapToDate?: unknown;
  acknowledgeDateChange?: unknown;
  acknowledgeDriverApproval?: unknown;
  rejectDriverApproval?: unknown;
  driverRejectionNote?: unknown;
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
  const scheduledStartTime =
    typeof body.scheduledStartTime === "string"
      ? body.scheduledStartTime.trim()
      : "";
  const vacationStartDate = parseDateField(body.vacationStartDate);
  const vacationEndDate = parseDateField(body.vacationEndDate);
  const permitStartDate = parseDateField(body.permitStartDate);
  const permitEndDate = parseDateField(body.permitEndDate);
  const permitDate = parseDateField(body.permitDate);
  const permitStartTime =
    typeof body.permitStartTime === "string" ? body.permitStartTime.trim() : "";
  const permitEndTime =
    typeof body.permitEndTime === "string" ? body.permitEndTime.trim() : "";
  const swapFromDate = parseDateField(body.swapFromDate);
  const swapToDate = parseDateField(body.swapToDate);

  if (appointmentDate) {
    patch.appointmentDate = appointmentDate;
    hasPatch = true;
  }

  if (scheduledStartTime && isValidClockTime(scheduledStartTime)) {
    patch.scheduledStartTime = scheduledStartTime;
    hasPatch = true;
  }

  const scheduledEndTime =
    typeof body.scheduledEndTime === "string"
      ? body.scheduledEndTime.trim()
      : "";

  if (scheduledEndTime && isValidClockTime(scheduledEndTime)) {
    patch.scheduledEndTime = scheduledEndTime;
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

  if (swapFromDate) {
    patch.swapFromDate = swapFromDate;
    hasPatch = true;
  }

  if (swapToDate) {
    patch.swapToDate = swapToDate;
    hasPatch = true;
  }

  return hasPatch ? patch : null;
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function resolveExecutiveAssignmentSlot(
  appointmentId: string,
  appointmentDate: Date,
  assignedExecutiveName: string,
  appointmentReason: string,
  preferredStartTime?: string,
  preferredEndTime?: string,
) {
  const reasonRecord = await prisma.appointmentReason.findUnique({
    where: { value: appointmentReason },
  });
  const reason = toReasonConfig(reasonRecord);

  if (!reason) {
    return { ok: false as const, message: "Motivo inválido." };
  }

  return validateExecutiveAssignmentForDate(
    assignedExecutiveName,
    formatDateOnly(appointmentDate),
    reason,
    appointmentId,
    preferredStartTime,
    preferredEndTime,
  );
}

async function ensureDefaultExecutives() {
  await seedExecutivesIfEmpty();
}

function assignmentErrorResponse(result: {
  ok: false;
  message: string;
  limitReached?: boolean;
}) {
  return NextResponse.json(
    { message: result.message },
    { status: result.limitReached ? 409 : 400 },
  );
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
    swapFromDate: Date | null;
    swapToDate: Date | null;
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

  if (patch.scheduledStartTime !== undefined) {
    if (!reason.allowsExecutiveAssignment) {
      return "Este motivo no permite definir la hora de atención manualmente.";
    }

    if (!isValidClockTime(patch.scheduledStartTime)) {
      return "Ingresa una hora de atención válida.";
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

  if (patch.swapFromDate !== undefined || patch.swapToDate !== undefined) {
    if (!reason.usesDaySwap) {
      return "Este motivo no usa cambio de día.";
    }

    const from = patch.swapFromDate;
    const to = patch.swapToDate;

    if (
      !from ||
      !to ||
      !isValidDateOnly(from) ||
      !isValidDateOnly(to) ||
      from === to
    ) {
      return "Ingresa dos días distintos para el cambio.";
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

  if (body.acknowledgeDriverApproval === true) {
    const driverUnauthorized = requireDriverSession(request);

    if (driverUnauthorized) {
      return driverUnauthorized;
    }

    const session = readDriverSession(request);

    if (!session) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    try {
      const existingAppointment = await prisma.appointment.findUnique({
        where: { id },
      });

      if (!existingAppointment) {
        return NextResponse.json(
          { message: "Solicitud no encontrada." },
          { status: 404 },
        );
      }

      if (
        normalizeVehicleNumber(existingAppointment.vehicleNumber) !==
          normalizeVehicleNumber(session.vehicleNumber) ||
        normalizeEmail(existingAppointment.email) !== normalizeEmail(session.email)
      ) {
        return NextResponse.json(
          { message: "No autorizado para esta solicitud." },
          { status: 403 },
        );
      }

      if (!existingAppointment.driverApprovalPending) {
        return NextResponse.json(
          { message: "Esta solicitud no requiere aprobación." },
          { status: 400 },
        );
      }

      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: {
          driverApprovalPending: false,
          driverApprovalRejected: false,
          driverApprovalMessage: "",
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

  if (body.rejectDriverApproval === true) {
    const driverUnauthorized = requireDriverSession(request);

    if (driverUnauthorized) {
      return driverUnauthorized;
    }

    const session = readDriverSession(request);

    if (!session) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const rejectionNote =
      typeof body.driverRejectionNote === "string"
        ? body.driverRejectionNote.trim().slice(0, 400)
        : "";

    if (rejectionNote.length < 3) {
      return NextResponse.json(
        {
          message:
            "Indica una observación breve para explicar el rechazo (mínimo 3 caracteres).",
        },
        { status: 400 },
      );
    }

    try {
      const existingAppointment = await prisma.appointment.findUnique({
        where: { id },
      });

      if (!existingAppointment) {
        return NextResponse.json(
          { message: "Solicitud no encontrada." },
          { status: 404 },
        );
      }

      if (
        normalizeVehicleNumber(existingAppointment.vehicleNumber) !==
          normalizeVehicleNumber(session.vehicleNumber) ||
        normalizeEmail(existingAppointment.email) !== normalizeEmail(session.email)
      ) {
        return NextResponse.json(
          { message: "No autorizado para esta solicitud." },
          { status: 403 },
        );
      }

      if (!existingAppointment.driverApprovalPending) {
        return NextResponse.json(
          { message: "Esta solicitud no requiere respuesta." },
          { status: 400 },
        );
      }

      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: {
          driverApprovalPending: false,
          driverApprovalRejected: true,
          driverApprovalMessage: rejectionNote,
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

  if (body.acknowledgeDateChange === true) {
    const driverUnauthorized = requireDriverSession(request);

    if (driverUnauthorized) {
      return driverUnauthorized;
    }

    const session = readDriverSession(request);

    if (!session) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    try {
      const existingAppointment = await prisma.appointment.findUnique({
        where: { id },
      });

      if (!existingAppointment) {
        return NextResponse.json(
          { message: "Solicitud no encontrada." },
          { status: 404 },
        );
      }

      if (
        normalizeVehicleNumber(existingAppointment.vehicleNumber) !==
          normalizeVehicleNumber(session.vehicleNumber) ||
        normalizeEmail(existingAppointment.email) !== normalizeEmail(session.email)
      ) {
        return NextResponse.json(
          { message: "No autorizado para esta solicitud." },
          { status: 403 },
        );
      }

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

  const unauthorized = requireAdminPermission(request, "solicitudes");

  if (unauthorized) {
    return unauthorized;
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
    swapFromDate?: Date | null;
    swapToDate?: Date | null;
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
          swapFromDate:
            datePatch.swapFromDate ??
            (datePatch.swapToDate ? previousAppointment.swapFromDate : undefined),
          swapToDate:
            datePatch.swapToDate ??
            (datePatch.swapFromDate ? previousAppointment.swapToDate : undefined),
        },
        reason,
        currentAppointment,
      );

      if (validationMessage) {
        return NextResponse.json({ message: validationMessage }, { status: 400 });
      }

      if (!appointmentDatesChanged(previousAppointment, datePatch)) {
        if (
          data.assignedExecutive === undefined &&
          data.status === undefined
        ) {
          return NextResponse.json(
            { message: "No hay cambios de fecha para guardar." },
            { status: 400 },
          );
        }

        // Hay cambio de ejecutivo/estado: no forzar error por fechas iguales.
      } else {
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

      if (datePatch.swapFromDate !== undefined) {
        data.swapFromDate = toDateOnly(datePatch.swapFromDate);
      }

      if (datePatch.swapToDate !== undefined) {
        data.swapToDate = toDateOnly(datePatch.swapToDate);
        data.appointmentDate = toDateOnly(datePatch.swapToDate);
      }

      requiresCalendarCancel = shouldRescheduleExecutiveCalendar(previousAppointment);
      }
    }

    const assignedExecutiveName =
      data.assignedExecutive ?? currentAppointment.assignedExecutive;

    const preferredStartTime =
      datePatch?.scheduledStartTime ||
      (typeof body.scheduledStartTime === "string"
        ? body.scheduledStartTime.trim()
        : "") ||
      currentAppointment.scheduledStartTime;

    const preferredEndFromBody =
      datePatch?.scheduledEndTime ||
      (typeof body.scheduledEndTime === "string"
        ? body.scheduledEndTime.trim()
        : "");

    const preferredEndTime = preferredStartTime
      ? preferredEndFromBody ||
        (preferredStartTime === currentAppointment.scheduledStartTime &&
        currentAppointment.scheduledEndTime
          ? currentAppointment.scheduledEndTime
          : (() => {
              if (!reason) {
                return currentAppointment.scheduledEndTime || undefined;
              }

              const parsedStart = parseClockTime(preferredStartTime);
              if (!parsedStart) {
                return currentAppointment.scheduledEndTime || undefined;
              }

              const endClock = addMinutesToClockTime(
                parsedStart.hour,
                parsedStart.minute,
                getReasonAppointmentDurationMinutes(reason),
              );

              return formatClockTime(endClock.hour, endClock.minute);
            })())
      : undefined;

    if (assignedExecutiveName && data.assignedExecutive !== "") {
      if (!reason?.allowsExecutiveAssignment) {
        return NextResponse.json(
          { message: "Este motivo no permite derivación." },
          { status: 400 },
        );
      }

      const appointmentDateForSlot =
        data.appointmentDate ?? currentAppointment.appointmentDate;

      const assignmentResult = await resolveExecutiveAssignmentSlot(
        id,
        appointmentDateForSlot,
        assignedExecutiveName,
        currentAppointment.appointmentReason,
        preferredStartTime || undefined,
        preferredEndTime,
      );

      if (!assignmentResult.ok) {
        return assignmentErrorResponse(assignmentResult);
      }

      data.scheduledStartTime = assignmentResult.slot.startTime;
      data.scheduledEndTime = assignmentResult.slot.endTime;
    } else if (
      (datePatch?.appointmentDate || datePatch?.scheduledStartTime) &&
      assignedExecutiveName
    ) {
      const appointmentDateForSlot =
        data.appointmentDate ?? currentAppointment.appointmentDate;

      const assignmentResult = await resolveExecutiveAssignmentSlot(
        id,
        appointmentDateForSlot,
        assignedExecutiveName,
        currentAppointment.appointmentReason,
        preferredStartTime || undefined,
        preferredEndTime,
      );

      if (!assignmentResult.ok) {
        return assignmentErrorResponse(assignmentResult);
      }

      data.scheduledStartTime = assignmentResult.slot.startTime;
      data.scheduledEndTime = assignmentResult.slot.endTime;
    } else if (
      datePatch?.scheduledStartTime &&
      reason?.allowsExecutiveAssignment
    ) {
      const parsedStart = parseClockTime(datePatch.scheduledStartTime);

      if (!parsedStart) {
        return NextResponse.json(
          { message: "La hora de atención no es válida." },
          { status: 400 },
        );
      }

      const durationMinutes = getReasonAppointmentDurationMinutes(reason);
      const endClock = addMinutesToClockTime(
        parsedStart.hour,
        parsedStart.minute,
        durationMinutes,
      );

      data.scheduledStartTime = formatClockTime(
        parsedStart.hour,
        parsedStart.minute,
      );
      data.scheduledEndTime = formatClockTime(endClock.hour, endClock.minute);
    }

    if (
      data.status === "cancelado" &&
      previousAppointment.status !== "cancelado"
    ) {
      data.dateChangePending = true;
      data.dateChangeMessage = buildCancellationMessage(previousAppointment);
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

  if (unauthorized) {
    return unauthorized;
  }

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
