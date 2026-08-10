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
} from "@/lib/appointments";
import { toAppointment, toReasonConfig } from "@/lib/appointments-mapper";
import { resolveExecutiveCreatorName } from "@/lib/executive-creator";
import { normalizeVehicleNumber } from "@/lib/driver-owners";
import { readAdminSession } from "@/lib/driver-auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type AppointmentCreateBody = {
  vehicleNumber?: unknown;
  appointmentDate?: unknown;
  appointmentReason?: unknown;
  vacationStartDate?: unknown;
  vacationEndDate?: unknown;
  permitType?: unknown;
  permitStartDate?: unknown;
  permitEndDate?: unknown;
  permitDate?: unknown;
  permitStartTime?: unknown;
  permitEndTime?: unknown;
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
  const usesDateRange = Boolean(reasonConfig?.usesDateRange);
  const usesPermitDetails = Boolean(reasonConfig?.usesPermitDetails);

  if (
    !driverOwner.fullName ||
    !/^\d{1,4}$/.test(vehicleNumber) ||
    !isValidAppointmentDate(appointmentDate) ||
    !reasonConfig ||
    !reasonConfig.isActive ||
    !driverOwner.email ||
    !driverOwner.phone
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
    appointmentReason,
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

  const appointment = validateExecutiveCreateBody(
    body,
    reason,
    resolveAppointmentDate(body, reason, ingressDate) ?? "",
    driverProfile,
  );

  if (!appointment) {
    return NextResponse.json(
      { message: "Datos de solicitud incompletos." },
      { status: 400 },
    );
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
      allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
      vacationStartDate: appointment.vacationStartDate,
      vacationEndDate: appointment.vacationEndDate,
      permitType: appointment.permitType,
      permitStartDate: appointment.permitStartDate,
      permitEndDate: appointment.permitEndDate,
      permitDate: appointment.permitDate,
      appointmentDate: appointment.appointmentDate,
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
        createdByType: "ejecutivo",
        createdByExecutiveName: executiveName,
        driverApprovalPending: true,
        driverApprovalMessage: "",
      },
    });

    const mappedAppointment = toAppointment(createdAppointment, reason ?? undefined);
    const approvalMessage = `${executiveName} registró una solicitud (${getAppointmentTicketLabel(mappedAppointment)}) por ${mappedAppointment.appointmentReasonLabel}. Fecha requerida: ${getRequiredDateSummary(mappedAppointment) || "No aplica"}. Revisa el detalle y aprueba para continuar.`;

    const updatedAppointment = await prisma.appointment.update({
      where: { id: createdAppointment.id },
      data: {
        driverApprovalMessage: approvalMessage,
      },
    });

    return NextResponse.json(
      {
        appointment: toAppointment(updatedAppointment, reason ?? undefined),
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
