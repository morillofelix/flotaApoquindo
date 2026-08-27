/**
 * Motor genérico de patrón de turno: weekday rules o ciclo rotativo (NxM).
 */

export type PatternDayStatus = {
  statusCode: string;
  works: boolean;
  startTime: string;
  endTime: string;
  cyclePosition: number | null;
};

type DayRule = {
  weekday: number;
  works: boolean;
  startTime: string;
  endTime: string;
  defaultStatusCode: string;
};

type PatternDay = {
  dayOffset: number;
  statusCode: string;
  startTime: string;
  endTime: string;
};

export type ShiftPatternSource = {
  startTime?: string;
  endTime?: string;
  saturdayRule?: string;
  sundayRule?: string;
  holidayRule?: string;
  cycleLengthDays?: number;
  cycleStartDate?: Date | string | null;
  dayRules?: DayRule[];
  pattern?: {
    cycleLengthDays: number;
    baseDate?: Date | string | null;
    days: PatternDay[];
  } | null;
};

function atUtcNoonIso(value: Date | string) {
  if (typeof value === "string") {
    return new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  }
  return new Date(
    `${value.toISOString().slice(0, 10)}T12:00:00.000Z`,
  );
}

function isoWeekday(date: Date) {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/** Días enteros UTC entre base y fecha (puede ser negativo). */
export function utcDayDiff(from: Date, to: Date) {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

export function cyclePositionForDate(
  date: Date,
  baseDate: Date,
  cycleLength: number,
) {
  if (cycleLength <= 0) return 0;
  const diff = utcDayDiff(baseDate, date);
  return ((diff % cycleLength) + cycleLength) % cycleLength;
}

/**
 * Resuelve estado/horario de un día según turno.
 * - Si hay patrón rotativo (pattern.days o cycleLengthDays>0): usa ciclo + fecha base.
 * - Si no: usa reglas Lun–Dom (dayRules).
 */
export function resolveShiftDayStatus(
  date: Date,
  shift: ShiftPatternSource | null | undefined,
  options?: { patternBaseDate?: Date | string | null },
): PatternDayStatus {
  const weekday = isoWeekday(date);
  const defaultStart = shift?.startTime ?? "";
  const defaultEnd = shift?.endTime ?? "";

  if (!shift) {
    const works = weekday < 6;
    return {
      statusCode: works ? "TRABAJA" : "LIBRE",
      works,
      startTime: "",
      endTime: "",
      cyclePosition: null,
    };
  }

  const pattern = shift.pattern;
  const cycleLength =
    pattern && pattern.days.length
      ? pattern.cycleLengthDays || pattern.days.length
      : shift.cycleLengthDays && shift.cycleLengthDays > 0
        ? shift.cycleLengthDays
        : 0;

  const baseRaw =
    options?.patternBaseDate ??
    pattern?.baseDate ??
    shift.cycleStartDate ??
    null;

  if (cycleLength > 0 && baseRaw) {
    const base = atUtcNoonIso(baseRaw);
    const position = cyclePositionForDate(date, base, cycleLength);

    if (pattern?.days?.length) {
      const ordered = [...pattern.days].sort((a, b) => a.dayOffset - b.dayOffset);
      const day =
        ordered.find((item) => item.dayOffset === position) ??
        ordered[position % ordered.length];
      const code = day?.statusCode || "TRABAJA";
      const works = code !== "LIBRE" && code !== "TURNO_DIA_LIBRE";
      return {
        statusCode: code,
        works,
        startTime: day?.startTime || defaultStart,
        endTime: day?.endTime || defaultEnd,
        cyclePosition: position,
      };
    }

    // Ciclo Nx1 implícito: N-1 trabajan, último libre.
    const works = position < cycleLength - 1;
    return {
      statusCode: works ? "TRABAJA" : "LIBRE",
      works,
      startTime: works ? defaultStart : "",
      endTime: works ? defaultEnd : "",
      cyclePosition: position,
    };
  }

  const rule = shift.dayRules?.find((item) => item.weekday === weekday);
  if (rule) {
    return {
      statusCode: rule.defaultStatusCode || (rule.works ? "TRABAJA" : "LIBRE"),
      works: rule.works,
      startTime: rule.works ? rule.startTime || defaultStart : "",
      endTime: rule.works ? rule.endTime || defaultEnd : "",
      cyclePosition: null,
    };
  }

  if (
    (weekday === 6 && shift.saturdayRule === "work") ||
    (weekday === 7 && shift.sundayRule === "work")
  ) {
    return {
      statusCode: "TRABAJA",
      works: true,
      startTime: defaultStart,
      endTime: defaultEnd,
      cyclePosition: null,
    };
  }

  if (
    (weekday === 6 && shift.saturdayRule === "free") ||
    (weekday === 7 && shift.sundayRule === "free")
  ) {
    return {
      statusCode: "LIBRE",
      works: false,
      startTime: "",
      endTime: "",
      cyclePosition: null,
    };
  }

  const works = weekday < 6;
  return {
    statusCode: works ? "TRABAJA" : "LIBRE",
    works,
    startTime: works ? defaultStart : "",
    endTime: works ? defaultEnd : "",
    cyclePosition: null,
  };
}

/** Vista previa de todos los días del mes para un turno. */
export function previewMonthPattern(
  year: number,
  month: number,
  shift: ShiftPatternSource,
  options?: { patternBaseDate?: Date | string | null },
) {
  const lastDay = new Date(year, month, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    const date = new Date(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    );
    const resolved = resolveShiftDayStatus(date, shift, options);
    return {
      date: date.toISOString().slice(0, 10),
      day,
      weekday: isoWeekday(date),
      ...resolved,
    };
  });
}
