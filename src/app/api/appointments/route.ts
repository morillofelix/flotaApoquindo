import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  type AppointmentReasonConfig,
  type PermitType,
  defaultAppointmentReasons,
  validateAppointmentObservation,
} from "@/lib/appointments";
import { validateAppointmentEvidence } from "@/lib/appointment-evidence";
import {
  getSantiagoToday,
  serializeRestrictedWeekdays,
  serializeWeekdayBusinessAdvance,
  checkReasonDateRules,
} from "@/lib/appointment-reason-weekdays";
import {
  checkHolidayRestrictedDates,
  getActiveHolidayDateSet,
  toHolidayConfig,
} from "@/lib/holidays";
import { toAppointment, toReasonConfig } from "@/lib/appointments-mapper";
import { DRIVER_RESTRICTION_MESSAGE } from "@/lib/driver-restriction-message";
import {
  formatShifts,
  normalizeVehicleNumber,
  shiftsFromStorage,
  type ShiftType,
} from "@/lib/driver-owners";
import {
  backfillDriverGroupsFromShifts,
  classificationFromDriverRelations,
  ensureDefaultDriverGroups,
  formatAppointmentClassificationLabel,
  formatAppointmentClassificationShort,
} from "@/lib/driver-groups";
import { validatePermitHoursRange } from "@/lib/permit-time-rules";
import { prisma } from "@/lib/prisma";
import { readDriverSession } from "@/lib/driver-auth";
import { normalizeEmail } from "@/lib/password-utils";
import { sendAppointmentTicketEmail } from "@/lib/appointment-ticket-email-server";
import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  swapFromDate?: unknown;
  swapToDate?: unknown;
  observation?: unknown;
  evidenceImageData?: unknown;
  evidenceImageFileName?: unknown;
  evidenceImageMimeType?: unknown;
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

async function ensureDefaultReasons() {
  await prisma.appointmentReason.createMany({
    data: defaultAppointmentReasons.map((reason) => ({
      value: reason.value,
      label: reason.label,
      allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
      usesDateRange: reason.usesDateRange,
      usesPermitDetails: reason.usesPermitDetails,
      usesDaySwap: reason.usesDaySwap,
      visibleToDriver: reason.visibleToDriver,
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
  today: string,
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
  const swapFromDate =
    typeof body.swapFromDate === "string" ? body.swapFromDate : "";
  const swapToDate = typeof body.swapToDate === "string" ? body.swapToDate : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
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

  if (
    !driverName ||
    !/^\d{1,3}$/.test(vehicleNumber) ||
    !isValidAppointmentDate(appointmentDate) ||
    !reasonConfig ||
    !reasonConfig.isActive ||
    !reasonConfig.visibleToDriver ||
    !email ||
    !phone ||
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
      swapFromDate === swapToDate ||
      swapFromDate < today ||
      swapToDate < today)
  ) {
    return null;
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
    swapFromDate: usesDaySwap ? swapFromDate : "",
    swapToDate: usesDaySwap ? swapToDate : "",
    observation: observationCheck.value,
    evidenceImageFileName: evidenceCheck.value.fileName,
    evidenceImageMimeType: evidenceCheck.value.mimeType,
    evidenceImageData: evidenceCheck.value.data,
    appointmentReason,
    email,
    phone,
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    await ensureDefaultReasons();
    await ensureDefaultDriverGroups();
    await backfillDriverGroupsFromShifts();

    const reasons = await prisma.appointmentReason.findMany();
    const reasonByValue = new Map(reasons.map((reason) => [reason.value, reason]));
    const appointments = await prisma.appointment.findMany({
      omit: { evidenceImageData: true },
      orderBy: { createdAt: "desc" },
    });
    const driverOwners = await prisma.driverOwner.findMany({
      select: {
        vehicleNumber: true,
        shifts: true,
        isConductor: true,
        groupId: true,
        group: { select: { id: true, code: true, name: true } },
        subgroupAssignments: {
          select: {
            subgroup: {
              select: { id: true, code: true, name: true, type: true, isActive: true },
            },
          },
        },
      },
    });
    const vehicleShiftByNumber: Record<string, string> = {};
    const vehicleShiftsByNumber: Record<string, ShiftType[]> = {};
    const vehicleClassificationByNumber: Record<
      string,
      { label: string; shortLabel: string }
    > = {};

    for (const driverOwner of driverOwners) {
      const key = normalizeVehicleNumber(driverOwner.vehicleNumber);

      if (!key) {
        continue;
      }

      const shifts = shiftsFromStorage(driverOwner.shifts);
      vehicleShiftsByNumber[key] = shifts;
      vehicleShiftByNumber[key] = formatShifts(shifts);

      if (!driverOwner.isConductor) {
        continue;
      }

      const classification = classificationFromDriverRelations(driverOwner);
      vehicleClassificationByNumber[key] = {
        label: formatAppointmentClassificationLabel({
          hasVehicle: true,
          hasDriver: true,
          classification,
        }),
        shortLabel: formatAppointmentClassificationShort(classification),
      };
    }

    return NextResponse.json({
      appointments: appointments.map((appointment) => {
        const key = normalizeVehicleNumber(appointment.vehicleNumber);
        const classification = key
          ? vehicleClassificationByNumber[key]
          : undefined;
        const label = appointment.vehicleNumber.trim()
          ? classification?.label || "Móvil sin conductor asociado"
          : "Clasificación pendiente de asignación";
        const shortLabel = appointment.vehicleNumber.trim()
          ? classification?.shortLabel || "—"
          : "—";

        return toAppointment(
          appointment,
          toReasonConfig(reasonByValue.get(appointment.appointmentReason) ?? null) ??
            undefined,
          { label, shortLabel },
        );
      }),
      vehicleShiftByNumber,
      vehicleShiftsByNumber,
    });
  } catch (error) {
    console.error("GET /api/appointments failed:", error);

    return NextResponse.json(
      {
        message:
          "No se pudieron cargar las solicitudes. Verifica que la base de datos esté actualizada.",
      },
      { status: 500 },
    );
  }
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
  const ingressDate = getSantiagoToday().date;

  const appointment = validateCreateBody(
    body,
    reason,
    resolveAppointmentDate(body, reason, ingressDate) ?? "",
    ingressDate,
  );

  if (!appointment) {
    return NextResponse.json(
      { message: "Datos de solicitud incompletos." },
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
        { message: DRIVER_RESTRICTION_MESSAGE },
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
        { message: DRIVER_RESTRICTION_MESSAGE },
        { status: 403 },
      );
    }
  }

  if (
    normalizeVehicleNumber(appointment.vehicleNumber) !==
      normalizeVehicleNumber(session.vehicleNumber) ||
    normalizeEmail(appointment.email) !== session.email
  ) {
    return NextResponse.json(
      { message: "Solo puedes solicitar citas para tu móvil." },
      { status: 403 },
    );
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
      },
    });

    const payload = toAppointment(createdAppointment, reason ?? undefined);
    let ticketEmailSent = false;

    try {
      await sendAppointmentTicketEmail(payload);
      ticketEmailSent = true;
    } catch (error) {
      console.error("[email] ticket send failed:", error);
    }

    return NextResponse.json(
      { appointment: payload, ticketEmailSent },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "No se pudo registrar la solicitud." },
      { status: 500 },
    );
  }
}
