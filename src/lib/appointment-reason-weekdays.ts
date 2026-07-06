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
  "Este tipo de solicitud debe ser realizada de manera presencial en la oficina de Apoquindo.";

function formatBusinessDayMinimumDate(dateValue: string) {
  const parsed = parseDateOnlyValue(dateValue);
  const formatted = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getBusinessDayAdvanceActionPhrase(reason: {
  usesDateRange: boolean;
  usesPermitDetails: boolean;
  allowsExecutiveAssignment?: boolean;
}) {
  if (reason.usesDateRange) {
    return "pedir tus vacaciones";
  }

  if (reason.usesPermitDetails) {
    return "solicitar este permiso";
  }

  if (reason.allowsExecutiveAssignment) {
    return "agendar esta cita";
  }

  return "realizar esta solicitud";
}

export function getBusinessDayAdvanceMessage(
  requiredDays: number,
  minimumStartDate: string,
  reason: {
    usesDateRange: boolean;
    usesPermitDetails: boolean;
    allowsExecutiveAssignment?: boolean;
  },
) {
  const formattedDate = formatBusinessDayMinimumDate(minimumStartDate);
  const actionPhrase = getBusinessDayAdvanceActionPhrase(reason);

  return `Esta solicitud requiere ${requiredDays} días hábiles de anticipación. A partir del ${formattedDate} puedes ${actionPhrase} con esa fecha de inicio. Ajusta la fecha de inicio o contacta al departamento de flota.`;
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
  allowsExecutiveAssignment?: boolean;
  vacationStartDate?: string;
  permitType?: string;
  permitStartDate?: string;
  permitDate?: string;
  appointmentDate?: string;
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

  if (input.allowsExecutiveAssignment) {
    return input.appointmentDate?.trim() || null;
  }

  return null;
}

export function checkBusinessDayAdvance(
  reason: {
    requiresBusinessDayAdvance: boolean;
    businessDaysAdvance: number;
    usesDateRange: boolean;
    usesPermitDetails: boolean;
    allowsExecutiveAssignment?: boolean;
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
    const minimumStartDate = addBusinessDays(
      todayDate,
      reason.businessDaysAdvance,
    );

    return {
      blocked: true,
      message: getBusinessDayAdvanceMessage(
        reason.businessDaysAdvance,
        minimumStartDate,
        reason,
      ),
      minimumStartDate,
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
      return { blocked: true, message: RESTRICTED_DAY_MESSAGE };
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
