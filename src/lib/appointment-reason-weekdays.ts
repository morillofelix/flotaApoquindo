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

export const RESTRICTED_DAY_MESSAGE =
  "Estimado usuario: las solicitudes para los días viernes, sábado, domingo y feriados deben ser tramitadas directamente en las oficinas de la empresa Transportes Apoquindo.";

export function formatBusinessDaysLabel(requiredDays: number) {
  if (requiredDays === 1) {
    return "1 día hábil";
  }

  return `${requiredDays} días hábiles`;
}

export function getReasonRestrictedMessage(requiredDays: number) {
  return `Existe una restricción para la fecha solicitada, la cual debe tramitarse con ${formatBusinessDaysLabel(requiredDays)} de anticipación según la configuración del motivo. Por favor, diríjase a la oficina administrativa o contacte al departamento de flota.`;
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

export function getBusinessDayAdvanceMessage(requiredDays: number) {
  return getReasonRestrictedMessage(requiredDays);
}

export type WeekdayBusinessAdvanceRule = {
  enabled: boolean;
  days: number;
};

export type WeekdayBusinessAdvanceConfig = Record<
  WeekdayKey,
  WeekdayBusinessAdvanceRule
>;

function getWeekdayAdvanceDays(
  config: WeekdayBusinessAdvanceConfig,
  weekday: WeekdayKey,
) {
  const rule = config[weekday];

  if (rule && rule.days >= 1) {
    return rule.days;
  }

  return 1;
}

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

export function meetsBusinessDayAdvance(
  todayDate: string,
  startDate: string,
  requiredBusinessDays: number,
  holidayDates?: Set<string>,
) {
  if (requiredBusinessDays <= 0) {
    return true;
  }

  const minimumStartDate = addBusinessDays(
    todayDate,
    requiredBusinessDays,
    holidayDates,
  );
  return startDate >= minimumStartDate;
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
  todayDate: string,
  startDateInput: ReasonStartDateInput,
  holidayDates?: Set<string>,
) {
  const config = reason.weekdayBusinessAdvance;

  if (!hasEnabledWeekdayBusinessAdvance(config)) {
    return { blocked: false, message: "" };
  }

  const startDate = getReasonStartDate(startDateInput);

  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { blocked: false, message: "" };
  }

  const weekday = getWeekdayFromDate(startDate);

  if (!weekday) {
    return { blocked: false, message: "" };
  }

  const rule = config[weekday];

  if (!rule.enabled || rule.days < 1) {
    return { blocked: false, message: "" };
  }

  if (!meetsBusinessDayAdvance(todayDate, startDate, rule.days, holidayDates)) {
    return {
      blocked: true,
      message: getBusinessDayAdvanceMessage(rule.days),
      minimumStartDate: addBusinessDays(todayDate, rule.days, holidayDates),
    };
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
) {
  if (restrictedWeekdays.length === 0) {
    return { blocked: false, message: "" };
  }

  const dates = getReasonDatesToCheck(input);

  if (dates.length === 0) {
    return { blocked: false, message: "" };
  }

  for (const date of dates) {
    if (isReasonRestrictedOnDate(restrictedWeekdays, date)) {
      const weekday = getWeekdayFromDate(date);

      if (!weekday) {
        return { blocked: true, message: getReasonRestrictedMessage(1) };
      }

      return {
        blocked: true,
        message: getReasonRestrictedMessage(
          getWeekdayAdvanceDays(weekdayBusinessAdvance, weekday),
        ),
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
