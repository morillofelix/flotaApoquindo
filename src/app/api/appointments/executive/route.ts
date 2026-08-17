import {
  requireAdminPermission,
  requireAdminSession,
} from "@/lib/admin-api-server";
import { getRequiredDateSummary } from "@/lib/agendamientos-appointments";
import {
  getSantiagoToday,
  checkReasonDateRules,
} from "@/lib/appointment-reason-weekdays";
import {
  checkHolidayRestrictedDates,
  getActiveHolidayDateSet,
  toHolidayConfig,
} from "@/lib/holidays";
import {
  getAppointmentTicketLabel,
  type AppointmentReasonConfig,
  type PermitType,
  validateAppointmentObservation,
} from "@/lib/appointments";
import { validateAppointmentEvidence } from "@/lib/appointment-evidence";
import { toAppointment, toReasonConfig } from "@/lib/appointments-mapper";
import { resolveExecutiveCreatorName } from "@/lib/executive-creator";
import { validateExecutiveAssignmentForDate } from "@/lib/executive-assignment-server";
import {
  sendExecutiveAssignmentEmailsServer,
  shouldSendExecutiveAssignmentEmails,
} from "@/lib/appointment-emails-server";
import { normalizeVehicleNumber } from "@/lib/driver-owners";
import { readAdminSession } from "@/lib/driver-auth";
import { findPropietarioByVehicleNumber } from "@/lib/propietario-vehicle-lookup";
import { validatePermitHoursRange } from "@/lib/permit-time-rules";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type AppointmentCreateBody = {
  vehicleNumber?: unknown;
  appointmentDate?: unknown;
  scheduledStartTime?: unknown;
  scheduledEndTime?: unknown;
  assignedExecutive?: unknown;
  appointmentReason?: unknown;
  vacationStartDate?: unknown;
  vacationEndDate?: unknown;
  permitType?: unknown;
  permitStartDate?: unknown;
  permitEndDate?: unknown;
  permitDate?: unknown;
  permitStartTime?: unknown;
  permitEndTime?: unknown;
  swapFromDate?: unknown;
  swapToDate?: unknown;
  observation?: unknown;
  evidenceImageData?: unknown;
  evidenceImageFileName?: unknown;
  evidenceImageMimeType?: unknown;
  ccOwnerEmail?: unknown;
};

function isValidAppointmentDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime());
}

function isValidPermitType(value: string): value is PermitType {
  return value === "dias" || value === "horas";
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function resolveAppointmentDate(
  body: AppointmentCreateBody,
  reasonConfig: AppointmentReasonConfig | null,
  today: string,
) {
  if (reasonConfig?.allowsExecutiveAssignment) {
    const requested =
      typeof body.appointmentDate === "string" ? body.appointmentDate.trim() : "";

    if (!isValidAppointmentDate(requested) || requested < today) {
      return null;
    }

    return requested;
  }

  if (reasonConfig?.usesDaySwap) {
    const requested =
      typeof body.swapToDate === "string" ? body.swapToDate.trim() : "";

    if (!isValidAppointmentDate(requested) || requested < today) {
      return null;
    }

    return requested;
  }

  return today;
}

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function resolvePhone(mobilePhone: string, landlinePhone: string) {
  return mobilePhone.trim() || landlinePhone.trim();
}

function validateExecutiveCreateBody(
  body: AppointmentCreateBody,
  reasonConfig: AppointmentReasonConfig | null,
  appointmentDate: string,
  assignedExecutive: string,
  driverOwner: {
    fullName: string;
    vehicleNumber: string;
    email: string;
    phone: string;
  },
) {
  const vehicleNumber =
    typeof body.vehicleNumber === "string" ? body.vehicleNumber.trim() : "";
  const appointmentReason =
    typeof body.appointmentReason === "string" ? body.appointmentReason : "";
  const vacationStartDate =
    typeof body.vacationStartDate === "string" ? body.vacationStartDate : "";
  const vacationEndDate =
    typeof body.vacationEndDate === "string" ? body.vacationEndDate : "";
  const permitType = typeof body.permitType === "string" ? body.permitType : "";
  const permitStartDate =
    typeof body.permitStartDate === "string" ? body.permitStartDate : "";
  const permitEndDate =
    typeof body.permitEndDate === "string" ? body.permitEndDate : "";
  const permitDate = typeof body.permitDate === "string" ? body.permitDate : "";
  const permitStartTime =
    typeof body.permitStartTime === "string" ? body.permitStartTime : "";
  const permitEndTime =
    typeof body.permitEndTime === "string" ? body.permitEndTime : "";
  const swapFromDate =
    typeof body.swapFromDate === "string" ? body.swapFromDate : "";
  const swapToDate = typeof body.swapToDate === "string" ? body.swapToDate : "";
  const usesDateRange = Boolean(reasonConfig?.usesDateRange);
  const usesPermitDetails = Boolean(reasonConfig?.usesPermitDetails);
  const usesDaySwap = Boolean(reasonConfig?.usesDaySwap);
  const observationCheck = validateAppointmentObservation(
    body.observation,
    Boolean(reasonConfig?.requiresObservation),
  );
  const evidenceCheck = validateAppointmentEvidence(
    {
      data: body.evidenceImageData,
      fileName: body.evidenceImageFileName,
      mimeType: body.evidenceImageMimeType,
    },
    {
      allowed: Boolean(reasonConfig?.allowsAttachment),
      required: Boolean(
        reasonConfig?.allowsAttachment && reasonConfig?.requiresAttachment,
      ),
    },
  );
  const requiresExecutiveAssignment = Boolean(
    reasonConfig?.allowsExecutiveAssignment,
  );
  const requiresScheduledTimeRange = Boolean(
    reasonConfig?.allowsExecutiveAssignment,
  );
  const scheduledStartTime =
    typeof body.scheduledStartTime === "string"
      ? body.scheduledStartTime.trim()
      : "";
  const scheduledEndTime =
    typeof body.scheduledEndTime === "string"
      ? body.scheduledEndTime.trim()
      : "";

  if (
    !driverOwner.fullName ||
    !/^\d{1,4}$/.test(vehicleNumber) ||
    !isValidAppointmentDate(appointmentDate) ||
    !reasonConfig ||
    !reasonConfig.isActive ||
    !driverOwner.email ||
    !driverOwner.phone ||
    (requiresExecutiveAssignment &&
      (!assignedExecutive || assignedExecutive.length > 120)) ||
    (requiresScheduledTimeRange &&
      (!isValidTime(scheduledStartTime) ||
        !isValidTime(scheduledEndTime) ||
        scheduledEndTime <= scheduledStartTime)) ||
    !observationCheck.ok ||
    !evidenceCheck.ok
  ) {
    return null;
  }

  if (
    usesDateRange &&
    (!isValidAppointmentDate(vacationStartDate) ||
      !isValidAppointmentDate(vacationEndDate) ||
      vacationEndDate < vacationStartDate)
  ) {
    return null;
  }

  if (usesPermitDetails) {
    if (!isValidPermitType(permitType)) {
      return null;
    }

    if (
      permitType === "dias" &&
      (!isValidAppointmentDate(permitStartDate) ||
        !isValidAppointmentDate(permitEndDate) ||
        permitEndDate < permitStartDate)
    ) {
      return null;
    }

    if (
      permitType === "horas" &&
      (!isValidAppointmentDate(permitDate) ||
        !isValidTime(permitStartTime) ||
        !isValidTime(permitEndTime) ||
        permitEndTime <= permitStartTime)
    ) {
      return null;
    }
  }

  if (
    usesDaySwap &&
    (!isValidAppointmentDate(swapFromDate) ||
      !isValidAppointmentDate(swapToDate) ||
      swapFromDate === swapToDate)
  ) {
    return null;
  }

  return {
    driverName: driverOwner.fullName,
    vehicleNumber: normalizeVehicleNumber(vehicleNumber),
    appointmentDate,
    vacationStartDate: usesDateRange ? vacationStartDate : "",
    vacationEndDate: usesDateRange ? vacationEndDate : "",
    permitType: usesPermitDetails ? permitType : "",
    permitStartDate:
      usesPermitDetails && permitType === "dias" ? permitStartDate : "",
    permitEndDate: usesPermitDetails && permitType === "dias" ? permitEndDate : "",
    permitDate: usesPermitDetails && permitType === "horas" ? permitDate : "",
    permitStartTime:
      usesPermitDetails && permitType === "horas" ? permitStartTime : "",
    permitEndTime: usesPermitDetails && permitType === "horas" ? permitEndTime : "",
    swapFromDate: usesDaySwap ? swapFromDate : "",
    swapToDate: usesDaySwap ? swapToDate : "",
    observation: observationCheck.value,
    evidenceImageFileName: evidenceCheck.value.fileName,
    evidenceImageMimeType: evidenceCheck.value.mimeType,
    evidenceImageData: evidenceCheck.value.data,
    appointmentReason,
    assignedExecutive: requiresExecutiveAssignment ? assignedExecutive : "",
    scheduledStartTime: requiresScheduledTimeRange ? scheduledStartTime : "",
    scheduledEndTime: requiresScheduledTimeRange ? scheduledEndTime : "",
    email: driverOwner.email,
    phone: driverOwner.phone,
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

  if (unauthorized) {
    return unauthorized;
  }

  const sessionError = requireAdminSession(request);

  if (sessionError) {
    return sessionError;
  }

  const session = readAdminSession(request);

  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const creatorName = await resolveExecutiveCreatorName(session);

  return NextResponse.json({ creatorName });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

  if (unauthorized) {
    return unauthorized;
  }

  const sessionError = requireAdminSession(request);

  if (sessionError) {
    return sessionError;
  }

  const session = readAdminSession(request);

  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  let body: AppointmentCreateBody;

  try {
    body = (await request.json()) as AppointmentCreateBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const vehicleNumber =
    typeof body.vehicleNumber === "string" ? body.vehicleNumber.trim() : "";

  if (!vehicleNumber) {
    return NextResponse.json(
      { message: "Selecciona un móvil válido." },
      { status: 400 },
    );
  }

  const driverOwner = await prisma.driverOwner.findFirst({
    where: {
      isActive: true,
      isConductor: true,
      vehicleNumber: normalizeVehicleNumber(vehicleNumber),
    },
    select: {
      fullName: true,
      vehicleNumber: true,
      email: true,
      mobilePhone: true,
      landlinePhone: true,
    },
  });

  if (!driverOwner) {
    return NextResponse.json(
      { message: "Móvil no registrado o no activo." },
      { status: 404 },
    );
  }

  const driverProfile = {
    fullName: driverOwner.fullName,
    vehicleNumber: driverOwner.vehicleNumber,
    email: driverOwner.email.trim(),
    phone: resolvePhone(driverOwner.mobilePhone, driverOwner.landlinePhone),
  };

  if (!driverProfile.email || !driverProfile.phone) {
    return NextResponse.json(
      { message: "El móvil seleccionado no tiene correo o teléfono registrado." },
      { status: 400 },
    );
  }

  const appointmentReason =
    typeof body.appointmentReason === "string" ? body.appointmentReason : "";
  const reasonConfig = await prisma.appointmentReason.findUnique({
    where: { value: appointmentReason },
  });
  const reason = toReasonConfig(reasonConfig);
  const ingressDate = getSantiagoToday().date;
  const executiveName = await resolveExecutiveCreatorName(session);
  const assignedExecutive =
    typeof body.assignedExecutive === "string"
      ? body.assignedExecutive.trim()
      : "";

  const appointment = validateExecutiveCreateBody(
    body,
    reason,
    resolveAppointmentDate(body, reason, ingressDate) ?? "",
    assignedExecutive,
    driverProfile,
  );

  if (!appointment) {
    return NextResponse.json(
      {
        message: reason?.allowsExecutiveAssignment
          ? "Completa móvil, motivo, fecha, ejecutivo y un horario válido para derivar la solicitud."
          : "Datos de solicitud incompletos.",
      },
      { status: 400 },
    );
  }

  if (appointment.permitType === "horas") {
    const permitTimeError = validatePermitHoursRange({
      permitDate: appointment.permitDate,
      permitStartTime: appointment.permitStartTime,
      permitEndTime: appointment.permitEndTime,
    });

    if (permitTimeError) {
      return NextResponse.json({ message: permitTimeError }, { status: 400 });
    }
  }

  let executiveSlot: { startTime: string; endTime: string } | null = null;

  if (reason?.allowsExecutiveAssignment) {
    const assignmentValidation = await validateExecutiveAssignmentForDate(
      appointment.assignedExecutive,
      appointment.appointmentDate,
      reason,
      undefined,
      appointment.scheduledStartTime || undefined,
      appointment.scheduledEndTime || undefined,
    );

    if (!assignmentValidation.ok) {
      return NextResponse.json(
        { message: assignmentValidation.message },
        { status: assignmentValidation.limitReached ? 409 : 400 },
      );
    }

    executiveSlot = assignmentValidation.slot;
  }

  const holidayRecords = reason
    ? await prisma.holiday.findMany({
        where: { isActive: true },
        orderBy: { date: "asc" },
      })
    : [];
  const holidays = holidayRecords.map(toHolidayConfig);
  const holidayDateSet = getActiveHolidayDateSet(holidays);

  if (reason) {
    const dateInput = {
      usesDateRange: reason.usesDateRange,
      usesPermitDetails: reason.usesPermitDetails,
      usesDaySwap: reason.usesDaySwap,
      allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
      vacationStartDate: appointment.vacationStartDate,
      vacationEndDate: appointment.vacationEndDate,
      permitType: appointment.permitType,
      permitStartDate: appointment.permitStartDate,
      permitEndDate: appointment.permitEndDate,
      permitDate: appointment.permitDate,
      appointmentDate: appointment.appointmentDate,
      swapFromDate: appointment.swapFromDate,
      swapToDate: appointment.swapToDate,
    };

    const holidayCheck = checkHolidayRestrictedDates(holidays, dateInput, ingressDate);

    if (holidayCheck.blocked) {
      return NextResponse.json(
        { message: holidayCheck.message },
        { status: 403 },
      );
    }

    const reasonDateCheck = checkReasonDateRules(
      reason.restrictedWeekdays,
      reason.weekdayBusinessAdvance,
      dateInput,
      ingressDate,
      holidayDateSet,
    );

    if (reasonDateCheck.blocked) {
      return NextResponse.json(
        { message: reasonDateCheck.message },
        { status: 403 },
      );
    }
  }

  try {
    const createdAppointment = await prisma.appointment.create({
      data: {
        id: randomUUID(),
        ...appointment,
        appointmentDate: toDateOnly(appointment.appointmentDate),
        vacationStartDate: appointment.vacationStartDate
          ? toDateOnly(appointment.vacationStartDate)
          : null,
        vacationEndDate: appointment.vacationEndDate
          ? toDateOnly(appointment.vacationEndDate)
          : null,
        permitStartDate: appointment.permitStartDate
          ? toDateOnly(appointment.permitStartDate)
          : null,
        permitEndDate: appointment.permitEndDate
          ? toDateOnly(appointment.permitEndDate)
          : null,
        permitDate: appointment.permitDate ? toDateOnly(appointment.permitDate) : null,
        swapFromDate: appointment.swapFromDate
          ? toDateOnly(appointment.swapFromDate)
          : null,
        swapToDate: appointment.swapToDate
          ? toDateOnly(appointment.swapToDate)
          : null,
        assignedExecutive: appointment.assignedExecutive,
        scheduledStartTime: executiveSlot?.startTime ?? "",
        scheduledEndTime: executiveSlot?.endTime ?? "",
        status: appointment.assignedExecutive ? "revisado" : "pendiente",
        createdByType: "ejecutivo",
        createdByExecutiveName: executiveName,
        driverApprovalPending: true,
        driverApprovalRejected: false,
        driverApprovalMessage: "",
      },
    });

    const mappedAppointment = toAppointment(createdAppointment, reason ?? undefined);
    const executiveSummary = appointment.assignedExecutive
      ? ` Ejecutivo asignado: ${appointment.assignedExecutive}.`
      : "";
    const approvalMessage = `${executiveName} registró una solicitud (${getAppointmentTicketLabel(mappedAppointment)}) por ${mappedAppointment.appointmentReasonLabel}. Fecha requerida: ${getRequiredDateSummary(mappedAppointment) || "No aplica"}.${executiveSummary} Revisa el detalle y aprueba para continuar.`;

    const updatedAppointment = await prisma.appointment.update({
      where: { id: createdAppointment.id },
      data: {
        driverApprovalMessage: approvalMessage,
      },
    });

    const savedAppointment = toAppointment(
      updatedAppointment,
      reason ?? undefined,
    );

    const shouldQueueEmails = shouldSendExecutiveAssignmentEmails(savedAppointment);
    const wantsOwnerCc = body.ccOwnerEmail === true;
    let ownerCcEmail = "";
    let emailWarning = "";

    if (wantsOwnerCc) {
      const propietario = await findPropietarioByVehicleNumber(
        driverOwner.vehicleNumber,
      );
      ownerCcEmail = propietario?.ownerEmail ?? "";

      if (!ownerCcEmail) {
        emailWarning =
          "La solicitud se creó, pero no hay correo de propietario asociado al móvil para enviar en copia.";
      } else if (!shouldQueueEmails) {
        emailWarning =
          "La solicitud se creó, pero no se envió correo de confirmación (sin ejecutivo/agenda), por lo que no se envió copia al propietario.";
      }
    }

    let emailsSent = false;

    if (shouldQueueEmails) {
      try {
        await sendExecutiveAssignmentEmailsServer(
          savedAppointment,
          ownerCcEmail ? { ownerCcEmail } : undefined,
        );
        emailsSent = true;
      } catch (error) {
        console.error("[email] executive assignment failed:", error);
        emailWarning =
          emailWarning ||
          "La solicitud se creó, pero el correo de confirmación tardó o falló. Puedes reenviarlo desde la tabla.";
      }
    }

    return NextResponse.json(
      {
        appointment: savedAppointment,
        emailsQueued: shouldQueueEmails,
        emailsSent,
        emailWarning,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "No se pudo registrar la solicitud." },
      { status: 500 },
    );
  }
}
