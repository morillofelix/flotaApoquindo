import {
  type AppointmentReasonConfig,
  type PermitType,
  defaultAppointmentReasons,
} from "@/lib/appointments";
import {
  getSantiagoToday,
  serializeRestrictedWeekdays,
  serializeWeekdayBusinessAdvance,
  checkBusinessDayAdvance,
  checkReasonRestrictedDates,
} from "@/lib/appointment-reason-weekdays";
import {
  checkHolidayRestrictedDates,
  getActiveHolidayDateSet,
  toHolidayConfig,
} from "@/lib/holidays";
import { toAppointment, toReasonConfig } from "@/lib/appointments-mapper";
import { prisma } from "@/lib/prisma";
import { readDriverSession } from "@/lib/driver-auth";
import { normalizeEmail } from "@/lib/password-utils";
import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type AppointmentCreateBody = {
  id?: unknown;
  driverName?: unknown;
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
  email?: unknown;
  phone?: unknown;
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

function normalizeVehicleNumber(value: string) {
  return value.trim().padStart(3, "0");
}

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

async function ensureDefaultReasons() {
  await prisma.appointmentReason.createMany({
    data: defaultAppointmentReasons.map((reason) => ({
      value: reason.value,
      label: reason.label,
      allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
      usesDateRange: reason.usesDateRange,
      usesPermitDetails: reason.usesPermitDetails,
      isActive: reason.isActive,
      restrictedWeekdays: serializeRestrictedWeekdays(reason.restrictedWeekdays),
      weekdayBusinessAdvance: serializeWeekdayBusinessAdvance(
        reason.weekdayBusinessAdvance,
      ),
      requiresBusinessDayAdvance: reason.requiresBusinessDayAdvance,
      businessDaysAdvance: reason.businessDaysAdvance,
      sortOrder: reason.sortOrder,
    })),
    skipDuplicates: true,
  });
}

function validateCreateBody(
  body: AppointmentCreateBody,
  reasonConfig: AppointmentReasonConfig | null,
  appointmentDate: string,
) {
  const driverName =
    typeof body.driverName === "string" ? body.driverName.trim() : "";
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
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const usesDateRange = Boolean(reasonConfig?.usesDateRange);
  const usesPermitDetails = Boolean(reasonConfig?.usesPermitDetails);

  if (
    !driverName ||
    !/^\d{1,3}$/.test(vehicleNumber) ||
    !isValidAppointmentDate(appointmentDate) ||
    !reasonConfig ||
    !reasonConfig.isActive ||
    !email ||
    !phone
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
    driverName,
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
    email,
    phone,
  };
}

export async function GET() {
  await ensureDefaultReasons();
  const reasons = await prisma.appointmentReason.findMany();
  const reasonByValue = new Map(reasons.map((reason) => [reason.value, reason]));
  const appointments = await prisma.appointment.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    appointments: appointments.map((appointment) =>
      toAppointment(
        appointment,
        toReasonConfig(reasonByValue.get(appointment.appointmentReason) ?? null) ??
          undefined,
      ),
    ),
  });
}

export async function POST(request: NextRequest) {
  const session = readDriverSession(request);

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

  await ensureDefaultReasons();
  const appointmentReason =
    typeof body.appointmentReason === "string" ? body.appointmentReason : "";
  const reasonConfig = await prisma.appointmentReason.findUnique({
    where: { value: appointmentReason },
  });
  const reason = toReasonConfig(reasonConfig);
  const today = getSantiagoToday();

  const appointment = validateCreateBody(
    body,
    reason,
    resolveAppointmentDate(body, reason, today.date) ?? "",
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

    const holidayCheck = checkHolidayRestrictedDates(holidays, dateInput, today.date);

    if (holidayCheck.blocked) {
      return NextResponse.json(
        { message: holidayCheck.message },
        { status: 403 },
      );
    }

    const restrictedCheck = checkReasonRestrictedDates(
      reason.restrictedWeekdays,
      reason.weekdayBusinessAdvance,
      dateInput,
      today.date,
      holidayDateSet,
    );

    if (restrictedCheck.blocked) {
      return NextResponse.json(
        { message: restrictedCheck.message },
        { status: 403 },
      );
    }
  }

  if (
    appointment.vehicleNumber !== session.vehicleNumber ||
    normalizeEmail(appointment.email) !== session.email
  ) {
    return NextResponse.json(
      { message: "Solo puedes solicitar citas para tu móvil." },
      { status: 403 },
    );
  }

  if (reason) {
    const advanceCheck = checkBusinessDayAdvance(
      reason,
      today.date,
      {
        usesDateRange: reason.usesDateRange,
        usesPermitDetails: reason.usesPermitDetails,
        allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
        vacationStartDate: appointment.vacationStartDate,
        permitType: appointment.permitType,
        permitStartDate: appointment.permitStartDate,
        permitDate: appointment.permitDate,
        appointmentDate: appointment.appointmentDate,
      },
      holidayDateSet,
    );

    if (advanceCheck.blocked) {
      return NextResponse.json(
        { message: advanceCheck.message },
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
      },
    });

    return NextResponse.json(
      { appointment: toAppointment(createdAppointment, reason ?? undefined) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "No se pudo registrar la solicitud." },
      { status: 500 },
    );
  }
}
