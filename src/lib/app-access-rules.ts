export type AppAccessWindowInput = {
  weekday: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

export type AppAccessTodayWindow = {
  enabled: boolean;
  startTime: string;
  endTime: string;
};

export const APP_ACCESS_WEEKDAYS = [
  { weekday: 1, label: "Lunes" },
  { weekday: 2, label: "Martes" },
  { weekday: 3, label: "Miércoles" },
  { weekday: 4, label: "Jueves" },
  { weekday: 5, label: "Viernes" },
  { weekday: 6, label: "Sábado" },
  { weekday: 7, label: "Domingo" },
] as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidAccessTime(value: string) {
  return TIME_PATTERN.test(value);
}

function toMinutes(value: string) {
  if (!isValidAccessTime(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

const WEEKDAY_SHORT_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function getSantiagoClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour")) % 24;
  const minute = Number(value("minute"));
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(now);
  return {
    date,
    weekday: WEEKDAY_SHORT_TO_ISO[value("weekday")] ?? 1,
    minutes: hour * 60 + minute,
  };
}

/**
 * Permite si la hora cae en la ventana de hoy, o en la parte después de
 * medianoche de una ventana de ayer que cruza la medianoche (ej. 22:00–02:00).
 */
export function isAccessAllowedAt(
  windows: AppAccessWindowInput[],
  clock: { weekday: number; minutes: number },
) {
  const byWeekday = new Map(windows.map((window) => [window.weekday, window]));
  const today = byWeekday.get(clock.weekday);
  if (today?.enabled) {
    const start = toMinutes(today.startTime);
    const end = toMinutes(today.endTime);
    if (start !== null && end !== null) {
      if (start <= end && clock.minutes >= start && clock.minutes <= end) {
        return true;
      }
      if (start > end && clock.minutes >= start) return true;
    }
  }
  const yesterday = byWeekday.get(clock.weekday === 1 ? 7 : clock.weekday - 1);
  if (yesterday?.enabled) {
    const start = toMinutes(yesterday.startTime);
    const end = toMinutes(yesterday.endTime);
    if (start !== null && end !== null && start > end && clock.minutes <= end) {
      return true;
    }
  }
  return false;
}

export function buildRestrictedMessage(todayWindow: AppAccessTodayWindow | null) {
  const allowedToday =
    todayWindow?.enabled && todayWindow.startTime && todayWindow.endTime
      ? ` Horario permitido hoy: ${todayWindow.startTime} a ${todayWindow.endTime}.`
      : " Hoy no está habilitado el envío de solicitudes desde la app.";
  return `Este horario está restringido para realizar solicitudes.${allowedToday} Para más información, contacte al Departamento de Flota.`;
}
