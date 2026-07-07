export type WeekdayKey =
  | "lunes"
  | "martes"
  | "miercoles"
  | "jueves"
  | "viernes"
  | "sabado"
  | "domingo";

export const weekdayOptions: Array<{
  value: WeekdayKey;
  label: string;
  shortLabel: string;
}> = [
  { value: "lunes", label: "Lunes", shortLabel: "lu" },
  { value: "martes", label: "Martes", shortLabel: "ma" },
  { value: "miercoles", label: "Miércoles", shortLabel: "mi" },
  { value: "jueves", label: "Jueves", shortLabel: "ju" },
  { value: "viernes", label: "Viernes", shortLabel: "vi" },
  { value: "sabado", label: "Sábado", shortLabel: "sa" },
  { value: "domingo", label: "Domingo", shortLabel: "do" },
];

/** Todos los días de la semana: anticipación por día en el mantenedor de motivos. */
export const weekdayBusinessAdvanceOptions = weekdayOptions;

export const RESTRICTED_DAY_MESSAGE =
  "Estimado usuario: las solicitudes para los días viernes, sábado, domingo y feriados deben ser tramitadas directamente en las oficinas de la empresa Transportes Apoquindo.";

export function formatBusinessDaysLabel(requiredDays: number) {
  if (requiredDays === 1) {
    return "1 día hábil";
  }

  return `${requiredDays} días hábiles`;
}

export function formatCompactAdvanceDate(dateValue: string) {
  const formatted = new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateValue}T12:00:00`));

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatSuggestedStartDate(dateValue: string) {
  const formatted = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateValue}T12:00:00`));

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function getRestrictedDateMessage(
  requiredDays: number,
  minimumStartDate: string,
) {
  const formattedDate = formatSuggestedStartDate(minimumStartDate);

  return `La fecha solicitada requiere un plazo mínimo de ${formatBusinessDaysLabel(requiredDays)} de anticipación. Podrá realizar esta solicitud a partir del ${formattedDate}. Para más información, contacte al Departamento de Flota o a la Oficina Administrativa.`;
}

export function getReasonRestrictedMessage(
  requiredDays: number,
  minimumStartDate: string,
) {
  return getRestrictedDateMessage(requiredDays, minimumStartDate);
}

type BusinessDayAdvanceMessageContext = {
  ingressDate?: string;
  selectedDate?: string;
  holidayDates?: Set<string>;
  usesDateRange?: boolean;
  usesPermitDetails?: boolean;
  allowsExecutiveAssignment?: boolean;
};

export function getBusinessDayAdvanceMessage(
  requiredDays: number,
  minimumStartDate: string,
  context?: BusinessDayAdvanceMessageContext,
) {
  const formattedDate = formatCompactAdvanceDate(minimumStartDate);

  if (context?.ingressDate && context?.selectedDate) {
    const currentCount = countBusinessDaysBetween(
      context.ingressDate,
      context.selectedDate,
      context.holidayDates,
    );

    return `Su fecha tiene ${currentCount} de ${requiredDays} días hábiles desde el ingreso. Puede solicitar desde el ${formattedDate}.`;
  }

  return `Se requieren ${formatBusinessDaysLabel(requiredDays)} desde el ingreso. Puede solicitar desde el ${formattedDate}.`;
}

export type ReasonStartDateInput = {
  usesDateRange: boolean;
  usesPermitDetails: boolean;
  allowsExecutiveAssignment?: boolean;
  vacationStartDate?: string;
  permitType?: string;
  permitStartDate?: string;
  permitDate?: string;
  appointmentDate?: string;
};

export type WeekdayBusinessAdvanceRule = {
  enabled: boolean;
  days: number;
};

export type WeekdayBusinessAdvanceConfig = Record<
  WeekdayKey,
  WeekdayBusinessAdvanceRule
>;

export function createDefaultWeekdayBusinessAdvance(): WeekdayBusinessAdvanceConfig {
  return Object.fromEntries(
    weekdayOptions.map((option) => [
      option.value,
      { enabled: false, days: 1 },
    ]),
  ) as WeekdayBusinessAdvanceConfig;
}

function normalizeBusinessAdvanceDays(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, 365);
}

export function serializeWeekdayBusinessAdvance(
  config: WeekdayBusinessAdvanceConfig,
) {
  return JSON.stringify(config);
}

export function parseWeekdayBusinessAdvance(
  value: string | WeekdayBusinessAdvanceConfig | null | undefined,
  legacy?: {
    requiresBusinessDayAdvance: boolean;
    businessDaysAdvance: number;
  },
): WeekdayBusinessAdvanceConfig {
  const defaults = createDefaultWeekdayBusinessAdvance();
  let hasAnyConfigured = false;

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const option of weekdayOptions) {
      const rule = value[option.value];

      if (rule && typeof rule === "object") {
        defaults[option.value] = {
          enabled: Boolean(rule.enabled),
          days: normalizeBusinessAdvanceDays(rule.days),
        };

        if (defaults[option.value].enabled) {
          hasAnyConfigured = true;
        }
      }
    }
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as Partial<WeekdayBusinessAdvanceConfig>;

      for (const option of weekdayOptions) {
        const rule = parsed[option.value];

        if (rule && typeof rule === "object") {
          defaults[option.value] = {
            enabled: Boolean(rule.enabled),
            days: normalizeBusinessAdvanceDays(rule.days),
          };

          if (defaults[option.value].enabled) {
            hasAnyConfigured = true;
          }
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }

  if (
    !hasAnyConfigured &&
    legacy?.requiresBusinessDayAdvance &&
    legacy.businessDaysAdvance >= 1
  ) {
    for (const option of weekdayOptions) {
      defaults[option.value] = {
        enabled: true,
        days: legacy.businessDaysAdvance,
      };
    }
  }

  return defaults;
}

export function deriveLegacyBusinessAdvanceFields(
  config: WeekdayBusinessAdvanceConfig,
) {
  const enabledRules = weekdayOptions
    .map((option) => config[option.value])
    .filter((rule) => rule.enabled && rule.days >= 1);

  return {
    requiresBusinessDayAdvance: enabledRules.length > 0,
    businessDaysAdvance: enabledRules[0]?.days ?? 0,
  };
}

export function hasEnabledWeekdayBusinessAdvance(
  config: WeekdayBusinessAdvanceConfig,
) {
  return weekdayOptions.some(
    (option) =>
      config[option.value].enabled && config[option.value].days >= 1,
  );
}

export function isWeekdayAdvanceEnabled(
  config: WeekdayBusinessAdvanceConfig,
  weekday: WeekdayKey,
) {
  const rule = config[weekday];

  return Boolean(rule?.enabled && rule.days >= 1);
}

export function findNextUnrestrictedDate(
  fromDate: string,
  restrictedWeekdays: WeekdayKey[],
) {
  if (restrictedWeekdays.length === 0) {
    return fromDate;
  }

  const current = parseDateOnlyValue(fromDate);

  for (let index = 0; index < 370; index += 1) {
    const dateValue = formatDateOnlyValue(current);

    if (!isReasonRestrictedOnDate(restrictedWeekdays, dateValue)) {
      return dateValue;
    }

    current.setDate(current.getDate() + 1);
  }

  return fromDate;
}

export function getRestrictedWeekdayOnlyMessage(
  restrictedWeekdays: WeekdayKey[],
  nextAllowedDate: string,
) {
  const formattedRestricted = formatRestrictedWeekdays(restrictedWeekdays);
  const formattedNext = formatSuggestedStartDate(nextAllowedDate);

  return `El día seleccionado no está habilitado para dicho trámite. Los días no habilitados para este motivo son: ${formattedRestricted}. Podrá realizar esta solicitud a partir del ${formattedNext}. Para más información, diríjase a la Oficina de Flota o contacte al Departamento de Flota.`;
}

export function formatBusinessDayAdvanceSummary(
  config: WeekdayBusinessAdvanceConfig,
) {
  const parts = weekdayOptions
    .filter(
      (option) =>
        config[option.value].enabled && config[option.value].days >= 1,
    )
    .map((option) => `${option.shortLabel}:${config[option.value].days}`);

  return parts.length ? `Anticip: ${parts.join(" ")}` : "";
}

function parseDateOnlyValue(dateValue: string) {
  const [yearValue, monthValue, dayValue] = dateValue.split("-").map(Number);
  return new Date(yearValue || 0, (monthValue || 1) - 1, dayValue || 1);
}

function formatDateOnlyValue(dateValue: Date) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isBusinessDay(dateValue: Date, holidayDates?: Set<string>) {
  const weekday = dateValue.getDay();

  if (weekday === 0 || weekday === 6) {
    return false;
  }

  if (holidayDates?.size) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const day = String(dateValue.getDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;

    if (holidayDates.has(dateKey)) {
      return false;
    }
  }

  return true;
}

export function addBusinessDays(
  fromDate: string,
  businessDays: number,
  holidayDates?: Set<string>,
) {
  if (businessDays <= 0) {
    return fromDate;
  }

  const currentDate = parseDateOnlyValue(fromDate);
  let addedDays = 0;

  while (addedDays < businessDays) {
    currentDate.setDate(currentDate.getDate() + 1);

    if (isBusinessDay(currentDate, holidayDates)) {
      addedDays += 1;
    }
  }

  return formatDateOnlyValue(currentDate);
}

/** Días hábiles en el intervalo (fecha ingreso, fecha requerida]. */
export function countBusinessDaysBetween(
  ingressDate: string,
  requiredDate: string,
  holidayDates?: Set<string>,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(ingressDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(requiredDate) ||
    requiredDate <= ingressDate
  ) {
    return 0;
  }

  const current = parseDateOnlyValue(ingressDate);
  const end = parseDateOnlyValue(requiredDate);
  let count = 0;

  while (current < end) {
    current.setDate(current.getDate() + 1);

    if (isBusinessDay(current, holidayDates)) {
      count += 1;
    }
  }

  return count;
}

export function getEarliestRequiredDate(
  ingressDate: string,
  requiredBusinessDays: number,
  holidayDates?: Set<string>,
) {
  return addBusinessDays(ingressDate, requiredBusinessDays, holidayDates);
}

export function meetsBusinessDayAdvance(
  ingressDate: string,
  requiredDate: string,
  requiredBusinessDays: number,
  holidayDates?: Set<string>,
) {
  if (requiredBusinessDays <= 0) {
    return true;
  }

  return (
    countBusinessDaysBetween(ingressDate, requiredDate, holidayDates) >=
    requiredBusinessDays
  );
}

export function getReasonStartDate(input: ReasonStartDateInput) {
  if (input.usesDateRange) {
    return input.vacationStartDate?.trim() || null;
  }

  if (input.usesPermitDetails) {
    if (input.permitType === "dias") {
      return input.permitStartDate?.trim() || null;
    }

    if (input.permitType === "horas") {
      return input.permitDate?.trim() || null;
    }
  }

  if (input.allowsExecutiveAssignment) {
    return input.appointmentDate?.trim() || null;
  }

  return null;
}

export function checkBusinessDayAdvance(
  reason: {
    weekdayBusinessAdvance: WeekdayBusinessAdvanceConfig;
    usesDateRange: boolean;
    usesPermitDetails: boolean;
    allowsExecutiveAssignment?: boolean;
  },
  ingressDate: string,
  startDateInput: ReasonStartDateInput,
  holidayDates?: Set<string>,
) {
  const config = reason.weekdayBusinessAdvance;

  if (!hasEnabledWeekdayBusinessAdvance(config)) {
    return { blocked: false, message: "" };
  }

  const dates = getReasonDatesToCheck(startDateInput);

  if (dates.length === 0) {
    return { blocked: false, message: "" };
  }

  for (const date of dates) {
    const weekday = getWeekdayFromDate(date);

    if (!weekday || !isWeekdayAdvanceEnabled(config, weekday)) {
      continue;
    }

    const rule = config[weekday];

    if (!meetsBusinessDayAdvance(ingressDate, date, rule.days, holidayDates)) {
      const minimumStartDate = getEarliestRequiredDate(
        ingressDate,
        rule.days,
        holidayDates,
      );

      return {
        blocked: true,
        message: getBusinessDayAdvanceMessage(rule.days, minimumStartDate, {
          ingressDate,
          selectedDate: date,
          holidayDates,
          usesDateRange: reason.usesDateRange,
          usesPermitDetails: reason.usesPermitDetails,
          allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
        }),
        minimumStartDate,
      };
    }
  }

  return { blocked: false, message: "" };
}

const weekdayKeys = new Set<WeekdayKey>(
  weekdayOptions.map((option) => option.value),
);

const weekdayShortMap: Record<string, WeekdayKey> = {
  Sun: "domingo",
  Mon: "lunes",
  Tue: "martes",
  Wed: "miercoles",
  Thu: "jueves",
  Fri: "viernes",
  Sat: "sabado",
};

export function isWeekdayKey(value: string): value is WeekdayKey {
  return weekdayKeys.has(value as WeekdayKey);
}

export function parseRestrictedWeekdays(
  value: string | WeekdayKey[] | null | undefined,
): WeekdayKey[] {
  if (Array.isArray(value)) {
    return value.filter(isWeekdayKey);
  }

  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(isWeekdayKey);
}

export function serializeRestrictedWeekdays(weekdays: WeekdayKey[]) {
  return weekdays.join(",");
}

export function formatRestrictedWeekdays(weekdays: WeekdayKey[]) {
  return weekdayOptions
    .filter((option) => weekdays.includes(option.value))
    .map((option) => option.label)
    .join(", ");
}

export function getSantiagoToday() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(now);
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    weekday: "short",
  }).format(now);

  return {
    date,
    weekday: weekdayShortMap[weekdayShort] ?? ("lunes" as WeekdayKey),
  };
}

type ReasonDateRangeInput = ReasonStartDateInput & {
  vacationEndDate?: string;
  permitEndDate?: string;
};

function enumerateDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = parseDateOnlyValue(startDate);
  const end = parseDateOnlyValue(endDate);

  while (current <= end) {
    dates.push(formatDateOnlyValue(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function getWeekdayFromDate(
  dateValue: string,
  timeZone = "America/Santiago",
): WeekdayKey | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return null;
  }

  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date(`${dateValue}T12:00:00`));

  return weekdayShortMap[weekdayShort] ?? null;
}

export function isReasonRestrictedOnDate(
  restrictedWeekdays: WeekdayKey[],
  dateValue: string,
) {
  if (restrictedWeekdays.length === 0) {
    return false;
  }

  const weekday = getWeekdayFromDate(dateValue);
  return weekday !== null && restrictedWeekdays.includes(weekday);
}

export function getReasonDatesToCheck(input: ReasonDateRangeInput) {
  if (input.usesDateRange) {
    const start = input.vacationStartDate?.trim() ?? "";
    const end = input.vacationEndDate?.trim() ?? "";

    if (start && end && end >= start) {
      return enumerateDateRange(start, end);
    }

    if (start) {
      return [start];
    }

    return [];
  }

  if (input.usesPermitDetails) {
    if (input.permitType === "dias") {
      const start = input.permitStartDate?.trim() ?? "";
      const end = input.permitEndDate?.trim() ?? "";

      if (start && end && end >= start) {
        return enumerateDateRange(start, end);
      }

      if (start) {
        return [start];
      }

      return [];
    }

    if (input.permitType === "horas") {
      const date = input.permitDate?.trim() ?? "";
      return date ? [date] : [];
    }
  }

  if (input.allowsExecutiveAssignment) {
    const date = input.appointmentDate?.trim() ?? "";
    return date ? [date] : [];
  }

  return [];
}

export function checkReasonRestrictedDates(
  restrictedWeekdays: WeekdayKey[],
  weekdayBusinessAdvance: WeekdayBusinessAdvanceConfig,
  input: ReasonDateRangeInput,
  ingressDate: string,
  holidayDates?: Set<string>,
) {
  return checkReasonDateRules(
    restrictedWeekdays,
    weekdayBusinessAdvance,
    input,
    ingressDate,
    holidayDates,
  );
}

export function checkReasonDateRules(
  restrictedWeekdays: WeekdayKey[],
  weekdayBusinessAdvance: WeekdayBusinessAdvanceConfig,
  input: ReasonDateRangeInput,
  ingressDate: string,
  holidayDates?: Set<string>,
) {
  const dates = getReasonDatesToCheck(input);

  if (dates.length === 0) {
    return { blocked: false, message: "" };
  }

  for (const date of dates) {
    const weekday = getWeekdayFromDate(date);

    if (!weekday) {
      continue;
    }

    if (isWeekdayAdvanceEnabled(weekdayBusinessAdvance, weekday)) {
      const rule = weekdayBusinessAdvance[weekday];

      if (
        !meetsBusinessDayAdvance(ingressDate, date, rule.days, holidayDates)
      ) {
        const minimumStartDate = getEarliestRequiredDate(
          ingressDate,
          rule.days,
          holidayDates,
        );

        return {
          blocked: true,
          message: getBusinessDayAdvanceMessage(rule.days, minimumStartDate, {
            ingressDate,
            selectedDate: date,
            holidayDates,
            usesDateRange: input.usesDateRange,
            usesPermitDetails: input.usesPermitDetails,
            allowsExecutiveAssignment: input.allowsExecutiveAssignment,
          }),
          minimumStartDate,
        };
      }

      continue;
    }

    if (isReasonRestrictedOnDate(restrictedWeekdays, date)) {
      const nextAllowedDate = findNextUnrestrictedDate(date, restrictedWeekdays);

      return {
        blocked: true,
        message: getRestrictedWeekdayOnlyMessage(
          restrictedWeekdays,
          nextAllowedDate,
        ),
        minimumStartDate: nextAllowedDate,
      };
    }
  }

  return { blocked: false, message: "" };
}

export function isReasonRestrictedToday(
  restrictedWeekdays: WeekdayKey[],
  referenceDate = getSantiagoToday(),
) {
  return restrictedWeekdays.includes(referenceDate.weekday);
}
