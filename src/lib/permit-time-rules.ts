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

  if (permitEndTime <= permitStartTime) {
    return "La hora hasta debe ser posterior a la hora desde.";
  }

  if (isPermitClockTimeInPast(permitDate, permitStartTime, now)) {
    return getPastPermitTimeMessage();
  }

  if (isPermitClockTimeInPast(permitDate, permitEndTime, now)) {
    return getPastPermitTimeMessage();
  }

  return "";
}
