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
  "Este día se encuentra restringido, por favor contactar al departamento de flota.";

export function getBusinessDayAdvanceMessage(requiredDays: number) {
  return `Esta solicitud requiere ${requiredDays} días hábiles de anticipación. Ajusta la fecha de inicio o contacta al departamento de flota.`;
}

export function formatBusinessDayAdvanceSummary(
  requiresBusinessDayAdvance: boolean,
  businessDaysAdvance: number,
) {
  if (!requiresBusinessDayAdvance || businessDaysAdvance < 1) {
    return "";
  }

  return `Anticip: ${businessDaysAdvance} d. háb.`;
}

type ReasonStartDateInput = {
  usesDateRange: boolean;
  usesPermitDetails: boolean;
  vacationStartDate?: string;
  permitType?: string;
  permitStartDate?: string;
  permitDate?: string;
};

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

function isBusinessDay(dateValue: Date) {
  const weekday = dateValue.getDay();
  return weekday !== 0 && weekday !== 6;
}

export function addBusinessDays(fromDate: string, businessDays: number) {
  if (businessDays <= 0) {
    return fromDate;
  }

  const currentDate = parseDateOnlyValue(fromDate);
  let addedDays = 0;

  while (addedDays < businessDays) {
    currentDate.setDate(currentDate.getDate() + 1);

    if (isBusinessDay(currentDate)) {
      addedDays += 1;
    }
  }

  return formatDateOnlyValue(currentDate);
}

export function meetsBusinessDayAdvance(
  todayDate: string,
  startDate: string,
  requiredBusinessDays: number,
) {
  if (requiredBusinessDays <= 0) {
    return true;
  }

  const minimumStartDate = addBusinessDays(todayDate, requiredBusinessDays);
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

  return null;
}

export function checkBusinessDayAdvance(
  reason: {
    requiresBusinessDayAdvance: boolean;
    businessDaysAdvance: number;
    usesDateRange: boolean;
    usesPermitDetails: boolean;
  },
  todayDate: string,
  startDateInput: ReasonStartDateInput,
) {
  if (!reason.requiresBusinessDayAdvance || reason.businessDaysAdvance < 1) {
    return { blocked: false, message: "" };
  }

  const startDate = getReasonStartDate(startDateInput);

  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { blocked: false, message: "" };
  }

  if (
    !meetsBusinessDayAdvance(
      todayDate,
      startDate,
      reason.businessDaysAdvance,
    )
  ) {
    return {
      blocked: true,
      message: getBusinessDayAdvanceMessage(reason.businessDaysAdvance),
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

export function isReasonRestrictedToday(
  restrictedWeekdays: WeekdayKey[],
  referenceDate = getSantiagoToday(),
) {
  return restrictedWeekdays.includes(referenceDate.weekday);
}
