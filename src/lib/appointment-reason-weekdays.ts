export type WeekdayKey =
  | "lunes"
  | "martes"
  | "miercoles"
  | "jueves"
  | "viernes"
  | "sabado"
  | "domingo";

export const weekdayOptions: Array<{ value: WeekdayKey; label: string }> = [
  { value: "lunes", label: "Lunes" },
  { value: "martes", label: "Martes" },
  { value: "miercoles", label: "Miércoles" },
  { value: "jueves", label: "Jueves" },
  { value: "viernes", label: "Viernes" },
  { value: "sabado", label: "Sábado" },
  { value: "domingo", label: "Domingo" },
];

export const RESTRICTED_DAY_MESSAGE =
  "Este día se encuentra restringido, por favor contactar al departamento de flota.";

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
