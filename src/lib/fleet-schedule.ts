/**
 * Constantes y tipos compartidos del módulo de planificación mensual.
 * Sin lógica de generación todavía (Etapa 4).
 */

export const FLEET_SCHEDULE_MODULE = "planificacion-mensual" as const;

export const LONG_TRIP_RESTRICTION_LABEL = "Tercer fichero" as const;

export const DAILY_CHANGE_ORIGINS = [
  "generated",
  "manual",
  "appointment",
  "block",
  "holiday",
  "regenerated",
] as const;

export type DailyChangeOrigin = (typeof DAILY_CHANGE_ORIGINS)[number];

export const DAILY_EVENT_TYPES = [
  "appointment",
  "note",
  "conflict",
] as const;

export type DailyEventType = (typeof DAILY_EVENT_TYPES)[number];

export const DRIVER_BLOCK_STATUSES = [
  "scheduled",
  "active",
  "ended",
  "cancelled",
] as const;

export type DriverBlockStatus = (typeof DRIVER_BLOCK_STATUSES)[number];

export const LONG_TRIP_RESTRICTION_STATUSES = [
  "enabled",
  "blocked",
] as const;

export type LongTripRestrictionStatus =
  (typeof LONG_TRIP_RESTRICTION_STATUSES)[number];

export const MONTHLY_SCHEDULE_STATUSES = [
  "draft",
  "published",
] as const;

export type MonthlyScheduleStatus = (typeof MONTHLY_SCHEDULE_STATUSES)[number];

export const SHIFT_DAY_RULES = [
  "default",
  "work",
  "free",
  "special",
] as const;

export type ShiftDayRuleMode = (typeof SHIFT_DAY_RULES)[number];

/** Mapeo motivo de solicitud → código de estado operativo sugerido. */
export const APPOINTMENT_REASON_TO_STATUS_CODE: Record<string, string> = {
  vacaciones: "VACACIONES",
  "licencia-medica": "PERMISO",
  permisos: "PERMISO",
  otros: "OTRO",
};

export function operationalStatusCodeForAppointmentReason(reason: string) {
  const key = reason.trim().toLowerCase();
  return APPOINTMENT_REASON_TO_STATUS_CODE[key] ?? "PERMISO";
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function isValidPlanningMonth(year: number, month: number) {
  return (
    Number.isInteger(year) &&
    year >= 2000 &&
    year <= 2100 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  );
}
