import {
  type AppointmentReasonConfig,
  defaultAppointmentReasons,
} from "@/lib/appointments";
import {
  isWeekdayKey,
  parseRestrictedWeekdays,
  serializeRestrictedWeekdays,
  type WeekdayKey,
} from "@/lib/appointment-reason-weekdays";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ReasonBody = {
  id?: unknown;
  label?: unknown;
  allowsExecutiveAssignment?: unknown;
  usesAppointmentDuration?: unknown;
  appointmentDurationMinutes?: unknown;
  usesDateRange?: unknown;
  usesPermitDetails?: unknown;
  isActive?: unknown;
  restrictedWeekdays?: unknown;
  requiresBusinessDayAdvance?: unknown;
  businessDaysAdvance?: unknown;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toReason(
  value: AppointmentReasonConfig | {
    id: string;
    value: string;
    label: string;
    allowsExecutiveAssignment: boolean;
    usesAppointmentDuration: boolean;
    appointmentDurationMinutes: number;
    usesDateRange: boolean;
    usesPermitDetails: boolean;
    isActive: boolean;
    restrictedWeekdays: string;
    requiresBusinessDayAdvance: boolean;
    businessDaysAdvance: number;
    sortOrder: number;
  },
): AppointmentReasonConfig {
  return {
    id: value.id,
    value: value.value,
    label: value.label,
    allowsExecutiveAssignment: value.allowsExecutiveAssignment,
    usesAppointmentDuration: value.usesAppointmentDuration,
    appointmentDurationMinutes: value.appointmentDurationMinutes,
    usesDateRange: value.usesDateRange,
    usesPermitDetails: value.usesPermitDetails,
    isActive: value.isActive,
    restrictedWeekdays: parseRestrictedWeekdays(value.restrictedWeekdays),
    requiresBusinessDayAdvance: value.requiresBusinessDayAdvance,
    businessDaysAdvance: value.businessDaysAdvance,
    sortOrder: value.sortOrder,
  };
}

function parseRestrictedWeekdaysBody(value: unknown): WeekdayKey[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is WeekdayKey => typeof item === "string" && isWeekdayKey(item),
  );
}

async function ensureDefaultReasons() {
  await prisma.appointmentReason.createMany({
    data: defaultAppointmentReasons.map((reason) => ({
      value: reason.value,
      label: reason.label,
      allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
      usesAppointmentDuration: reason.usesAppointmentDuration,
      appointmentDurationMinutes: reason.appointmentDurationMinutes,
      usesDateRange: reason.usesDateRange,
      usesPermitDetails: reason.usesPermitDetails,
      isActive: reason.isActive,
      restrictedWeekdays: serializeRestrictedWeekdays(reason.restrictedWeekdays),
      requiresBusinessDayAdvance: reason.requiresBusinessDayAdvance,
      businessDaysAdvance: reason.businessDaysAdvance,
      sortOrder: reason.sortOrder,
    })),
    skipDuplicates: true,
  });
}

async function loadReasons() {
  await ensureDefaultReasons();

  return prisma.appointmentReason.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

function getBoolean(value: unknown) {
  return value === true;
}

function parseBusinessDaysAdvance(value: unknown) {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return Math.min(parsedValue, 365);
}

function parseAppointmentDurationMinutes(value: unknown) {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsedValue) || parsedValue < 5) {
    return 30;
  }

  return Math.min(parsedValue, 480);
}

function normalizeReasonDurationFields(body: ReasonBody) {
  const allowsExecutiveAssignment = getBoolean(body.allowsExecutiveAssignment);
  const usesAppointmentDuration =
    allowsExecutiveAssignment && getBoolean(body.usesAppointmentDuration);
  const appointmentDurationMinutes = usesAppointmentDuration
    ? parseAppointmentDurationMinutes(body.appointmentDurationMinutes)
    : 30;

  return {
    allowsExecutiveAssignment,
    usesAppointmentDuration,
    appointmentDurationMinutes,
  };
}

export async function GET() {
  const reasons = await loadReasons();

  return NextResponse.json({
    reasons: reasons.map(toReason),
  });
}

export async function POST(request: NextRequest) {
  let body: ReasonBody;

  try {
    body = (await request.json()) as ReasonBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";

  if (label.length < 3) {
    return NextResponse.json(
      { message: "Ingresa un motivo válido." },
      { status: 400 },
    );
  }

  const baseValue = slugify(label);

  if (!baseValue) {
    return NextResponse.json(
      { message: "No se pudo generar el código del motivo." },
      { status: 400 },
    );
  }

  await ensureDefaultReasons();
  const existingCount = await prisma.appointmentReason.count();
  let value = baseValue;
  let suffix = 2;

  while (await prisma.appointmentReason.findUnique({ where: { value } })) {
    value = `${baseValue}-${suffix}`;
    suffix += 1;
  }

  const restrictedWeekdays = parseRestrictedWeekdaysBody(body.restrictedWeekdays);
  const requiresBusinessDayAdvance = getBoolean(body.requiresBusinessDayAdvance);
  const businessDaysAdvance = parseBusinessDaysAdvance(body.businessDaysAdvance);
  const durationFields = normalizeReasonDurationFields(body);

  if (requiresBusinessDayAdvance && businessDaysAdvance < 1) {
    return NextResponse.json(
      { message: "Ingresa un número válido de días hábiles." },
      { status: 400 },
    );
  }

  if (durationFields.usesAppointmentDuration && durationFields.appointmentDurationMinutes < 5) {
    return NextResponse.json(
      { message: "Ingresa una duración válida en minutos." },
      { status: 400 },
    );
  }

  const reason = await prisma.appointmentReason.create({
    data: {
      value,
      label,
      allowsExecutiveAssignment: durationFields.allowsExecutiveAssignment,
      usesAppointmentDuration: durationFields.usesAppointmentDuration,
      appointmentDurationMinutes: durationFields.appointmentDurationMinutes,
      usesDateRange: getBoolean(body.usesDateRange),
      usesPermitDetails: getBoolean(body.usesPermitDetails),
      isActive: body.isActive === undefined ? true : getBoolean(body.isActive),
      restrictedWeekdays: serializeRestrictedWeekdays(restrictedWeekdays),
      requiresBusinessDayAdvance,
      businessDaysAdvance,
      sortOrder: (existingCount + 1) * 10,
    },
  });

  return NextResponse.json({ reason: toReason(reason) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  let body: ReasonBody;

  try {
    body = (await request.json()) as ReasonBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const id = typeof body.id === "string" ? body.id : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";

  if (!id || label.length < 3) {
    return NextResponse.json(
      { message: "Datos de motivo incompletos." },
      { status: 400 },
    );
  }

  const restrictedWeekdays = parseRestrictedWeekdaysBody(body.restrictedWeekdays);
  const requiresBusinessDayAdvance = getBoolean(body.requiresBusinessDayAdvance);
  const businessDaysAdvance = parseBusinessDaysAdvance(body.businessDaysAdvance);
  const durationFields = normalizeReasonDurationFields(body);

  if (requiresBusinessDayAdvance && businessDaysAdvance < 1) {
    return NextResponse.json(
      { message: "Ingresa un número válido de días hábiles." },
      { status: 400 },
    );
  }

  if (durationFields.usesAppointmentDuration && durationFields.appointmentDurationMinutes < 5) {
    return NextResponse.json(
      { message: "Ingresa una duración válida en minutos." },
      { status: 400 },
    );
  }

  try {
    const reason = await prisma.appointmentReason.update({
      where: { id },
      data: {
        label,
        allowsExecutiveAssignment: durationFields.allowsExecutiveAssignment,
        usesAppointmentDuration: durationFields.usesAppointmentDuration,
        appointmentDurationMinutes: durationFields.appointmentDurationMinutes,
        usesDateRange: getBoolean(body.usesDateRange),
        usesPermitDetails: getBoolean(body.usesPermitDetails),
        isActive: getBoolean(body.isActive),
        restrictedWeekdays: serializeRestrictedWeekdays(restrictedWeekdays),
        requiresBusinessDayAdvance,
        businessDaysAdvance,
      },
    });

    return NextResponse.json({ reason: toReason(reason) });
  } catch {
    return NextResponse.json(
      { message: "No se pudo actualizar el motivo." },
      { status: 500 },
    );
  }
}
