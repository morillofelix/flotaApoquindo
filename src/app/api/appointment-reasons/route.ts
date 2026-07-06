import {
  type AppointmentReasonConfig,
  defaultAppointmentReasons,
} from "@/lib/appointments";
import {
  isWeekdayKey,
  parseRestrictedWeekdays,
  serializeRestrictedWeekdays,
  createDefaultWeekdayBusinessAdvance,
  parseWeekdayBusinessAdvance,
  deriveLegacyBusinessAdvanceFields,
  serializeWeekdayBusinessAdvance,
  hasEnabledWeekdayBusinessAdvance,
  type WeekdayKey,
  type WeekdayBusinessAdvanceConfig,
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
  usesServiceStartTime?: unknown;
  serviceStartTime?: unknown;
  usesDateRange?: unknown;
  usesPermitDetails?: unknown;
  isActive?: unknown;
  restrictedWeekdays?: unknown;
  weekdayBusinessAdvance?: unknown;
  requiresBusinessDayAdvance?: unknown;
  businessDaysAdvance?: unknown;
};

const clockTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

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
    usesServiceStartTime: boolean;
    serviceStartTime: string;
    usesDateRange: boolean;
    usesPermitDetails: boolean;
    isActive: boolean;
    restrictedWeekdays: string;
    weekdayBusinessAdvance: string;
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
    usesServiceStartTime: value.usesServiceStartTime,
    serviceStartTime: value.serviceStartTime,
    usesDateRange: value.usesDateRange,
    usesPermitDetails: value.usesPermitDetails,
    isActive: value.isActive,
    restrictedWeekdays: parseRestrictedWeekdays(value.restrictedWeekdays),
    weekdayBusinessAdvance: parseWeekdayBusinessAdvance(
      value.weekdayBusinessAdvance,
      {
        requiresBusinessDayAdvance: value.requiresBusinessDayAdvance,
        businessDaysAdvance: value.businessDaysAdvance,
      },
    ),
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

function parseWeekdayBusinessAdvanceBody(
  value: unknown,
): WeekdayBusinessAdvanceConfig | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const config = createDefaultWeekdayBusinessAdvance();

  for (const option of Object.keys(config) as WeekdayKey[]) {
    const rule = (value as Record<string, unknown>)[option];

    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      continue;
    }

    const ruleRecord = rule as Record<string, unknown>;
    config[option] = {
      enabled: ruleRecord.enabled === true,
      days: parseBusinessDaysAdvance(ruleRecord.days) || 1,
    };
  }

  return config;
}

function resolveWeekdayBusinessAdvanceFromBody(
  body: ReasonBody,
): WeekdayBusinessAdvanceConfig {
  const parsedBody = parseWeekdayBusinessAdvanceBody(body.weekdayBusinessAdvance);

  if (parsedBody) {
    return parsedBody;
  }

  const requiresBusinessDayAdvance = getBoolean(body.requiresBusinessDayAdvance);
  const businessDaysAdvance = parseBusinessDaysAdvance(body.businessDaysAdvance);
  const config = createDefaultWeekdayBusinessAdvance();

  if (requiresBusinessDayAdvance && businessDaysAdvance >= 1) {
    for (const option of Object.keys(config) as WeekdayKey[]) {
      config[option] = { enabled: true, days: businessDaysAdvance };
    }
  }

  return config;
}

function validateWeekdayBusinessAdvance(config: WeekdayBusinessAdvanceConfig) {
  if (!hasEnabledWeekdayBusinessAdvance(config)) {
    return "";
  }

  for (const option of Object.keys(config) as WeekdayKey[]) {
    const rule = config[option];

    if (rule.enabled && rule.days < 1) {
      return "Ingresa días hábiles válidos para cada día activo.";
    }
  }

  return "";
}

async function ensureDefaultReasons() {
  await prisma.appointmentReason.createMany({
    data: defaultAppointmentReasons.map((reason) => ({
      value: reason.value,
      label: reason.label,
      allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
      usesAppointmentDuration: reason.usesAppointmentDuration,
      appointmentDurationMinutes: reason.appointmentDurationMinutes,
      usesServiceStartTime: reason.usesServiceStartTime,
      serviceStartTime: reason.serviceStartTime,
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
  const usesServiceStartTime =
    allowsExecutiveAssignment && getBoolean(body.usesServiceStartTime);
  const serviceStartTime =
    typeof body.serviceStartTime === "string" ? body.serviceStartTime.trim() : "";

  return {
    allowsExecutiveAssignment,
    usesAppointmentDuration,
    appointmentDurationMinutes,
    usesServiceStartTime,
    serviceStartTime: usesServiceStartTime ? serviceStartTime : "",
  };
}

function validateReasonScheduleFields(
  durationFields: ReturnType<typeof normalizeReasonDurationFields>,
) {
  if (
    durationFields.usesAppointmentDuration &&
    durationFields.appointmentDurationMinutes < 5
  ) {
    return "Ingresa una duración válida en minutos.";
  }

  if (
    durationFields.usesServiceStartTime &&
    !clockTimePattern.test(durationFields.serviceStartTime)
  ) {
    return "Ingresa una hora de inicio válida para la atención.";
  }

  return "";
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
  const weekdayBusinessAdvance = resolveWeekdayBusinessAdvanceFromBody(body);
  const advanceValidationMessage =
    validateWeekdayBusinessAdvance(weekdayBusinessAdvance);
  const legacyAdvanceFields = deriveLegacyBusinessAdvanceFields(
    weekdayBusinessAdvance,
  );
  const durationFields = normalizeReasonDurationFields(body);
  const scheduleValidationMessage = validateReasonScheduleFields(durationFields);

  if (advanceValidationMessage) {
    return NextResponse.json(
      { message: advanceValidationMessage },
      { status: 400 },
    );
  }

  if (scheduleValidationMessage) {
    return NextResponse.json({ message: scheduleValidationMessage }, { status: 400 });
  }

  const reason = await prisma.appointmentReason.create({
    data: {
      value,
      label,
      allowsExecutiveAssignment: durationFields.allowsExecutiveAssignment,
      usesAppointmentDuration: durationFields.usesAppointmentDuration,
      appointmentDurationMinutes: durationFields.appointmentDurationMinutes,
      usesServiceStartTime: durationFields.usesServiceStartTime,
      serviceStartTime: durationFields.serviceStartTime,
      usesDateRange: getBoolean(body.usesDateRange),
      usesPermitDetails: getBoolean(body.usesPermitDetails),
      isActive: body.isActive === undefined ? true : getBoolean(body.isActive),
      restrictedWeekdays: serializeRestrictedWeekdays(restrictedWeekdays),
      weekdayBusinessAdvance: serializeWeekdayBusinessAdvance(
        weekdayBusinessAdvance,
      ),
      requiresBusinessDayAdvance: legacyAdvanceFields.requiresBusinessDayAdvance,
      businessDaysAdvance: legacyAdvanceFields.businessDaysAdvance,
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
  const weekdayBusinessAdvance = resolveWeekdayBusinessAdvanceFromBody(body);
  const advanceValidationMessage =
    validateWeekdayBusinessAdvance(weekdayBusinessAdvance);
  const legacyAdvanceFields = deriveLegacyBusinessAdvanceFields(
    weekdayBusinessAdvance,
  );
  const durationFields = normalizeReasonDurationFields(body);
  const scheduleValidationMessage = validateReasonScheduleFields(durationFields);

  if (advanceValidationMessage) {
    return NextResponse.json(
      { message: advanceValidationMessage },
      { status: 400 },
    );
  }

  if (scheduleValidationMessage) {
    return NextResponse.json({ message: scheduleValidationMessage }, { status: 400 });
  }

  try {
    const reason = await prisma.appointmentReason.update({
      where: { id },
      data: {
        label,
        allowsExecutiveAssignment: durationFields.allowsExecutiveAssignment,
        usesAppointmentDuration: durationFields.usesAppointmentDuration,
        appointmentDurationMinutes: durationFields.appointmentDurationMinutes,
        usesServiceStartTime: durationFields.usesServiceStartTime,
        serviceStartTime: durationFields.serviceStartTime,
        usesDateRange: getBoolean(body.usesDateRange),
        usesPermitDetails: getBoolean(body.usesPermitDetails),
        isActive: getBoolean(body.isActive),
        restrictedWeekdays: serializeRestrictedWeekdays(restrictedWeekdays),
        weekdayBusinessAdvance: serializeWeekdayBusinessAdvance(
          weekdayBusinessAdvance,
        ),
        requiresBusinessDayAdvance: legacyAdvanceFields.requiresBusinessDayAdvance,
        businessDaysAdvance: legacyAdvanceFields.businessDaysAdvance,
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
