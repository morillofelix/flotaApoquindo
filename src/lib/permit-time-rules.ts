import {
  getSantiagoNowMinutes,
  getSantiagoTodayDate,
} from "@/lib/executive-day-availability";

const clockTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseClockToMinutes(value: string) {
  const match = clockTimePattern.exec(value.trim());
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToClock(totalMinutes: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** True cuando el rango cruza medianoche (ej. 16:00 → 01:00). */
export function isOvernightPermitHours(
  permitStartTime: string,
  permitEndTime: string,
) {
  if (
    !clockTimePattern.test(permitStartTime) ||
    !clockTimePattern.test(permitEndTime)
  ) {
    return false;
  }

  return permitEndTime < permitStartTime;
}

/** Etiqueta militar del rango; si cruza medianoche indica +1 día. */
export function formatPermitHoursRange(
  permitStartTime: string,
  permitEndTime: string,
) {
  const start = permitStartTime.trim();
  const end = permitEndTime.trim();
  if (!start || !end) {
    return start || end;
  }
  if (isOvernightPermitHours(start, end)) {
    return `${start} a ${end} (+1 día)`;
  }
  return `${start} a ${end}`;
}

/** Minimum selectable clock time for a permit date (Santiago). Empty if not today. */
export function getPermitTimeMinForDate(permitDate: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(permitDate)) {
    return "";
  }

  if (permitDate !== getSantiagoTodayDate(now)) {
    return "";
  }

  return minutesToClock(getSantiagoNowMinutes(now));
}

export function isPermitClockTimeInPast(
  permitDate: string,
  clockTime: string,
  now = new Date(),
) {
  if (permitDate !== getSantiagoTodayDate(now)) {
    return false;
  }

  const minutes = parseClockToMinutes(clockTime);
  if (minutes === null) {
    return false;
  }

  return minutes < getSantiagoNowMinutes(now);
}

export function getPastPermitTimeMessage() {
  return "No puedes solicitar un permiso en una hora que ya pasó.";
}

export function validatePermitHoursRange(input: {
  permitDate: string;
  permitStartTime: string;
  permitEndTime: string;
  now?: Date;
}) {
  const { permitDate, permitStartTime, permitEndTime, now = new Date() } = input;

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(permitDate) ||
    !clockTimePattern.test(permitStartTime) ||
    !clockTimePattern.test(permitEndTime)
  ) {
    return "Completa la fecha y el rango horario del permiso.";
  }

  if (permitEndTime === permitStartTime) {
    return "La hora hasta debe ser distinta a la hora desde.";
  }

  const overnight = isOvernightPermitHours(permitStartTime, permitEndTime);

  if (isPermitClockTimeInPast(permitDate, permitStartTime, now)) {
    return getPastPermitTimeMessage();
  }

  // Si cruza medianoche, la hora hasta es del día siguiente: no se valida como "pasada" hoy.
  if (
    !overnight &&
    isPermitClockTimeInPast(permitDate, permitEndTime, now)
  ) {
    return getPastPermitTimeMessage();
  }

  return "";
}
