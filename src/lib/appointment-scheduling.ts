import { type AppointmentReasonConfig } from "@/lib/appointments";

export const DEFAULT_APPOINTMENT_START_HOUR = 9;
export const DEFAULT_APPOINTMENT_START_MINUTE = 0;
export const FALLBACK_APPOINTMENT_DURATION_MINUTES = 30;

export type AppointmentScheduleInput = {
  appointmentDate: string;
  reasonAllowsExecutiveAssignment: boolean;
  reasonUsesAppointmentDuration: boolean;
  reasonAppointmentDurationMinutes: number;
  startHour?: number;
  startMinute?: number;
};

export type AppointmentSchedule = {
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  endHour: number;
  endMinute: number;
  dateLabel: string;
  timeRangeLabel: string;
  summaryLabel: string;
};

function padTimePart(value: number) {
  return value.toString().padStart(2, "0");
}

export function formatClockTime(hour: number, minute: number) {
  return `${padTimePart(hour)}:${padTimePart(minute)}`;
}

export function addMinutesToClockTime(
  hour: number,
  minute: number,
  durationMinutes: number,
) {
  const totalMinutes = hour * 60 + minute + durationMinutes;
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);

  return {
    hour: Math.floor(normalized / 60),
    minute: normalized % 60,
  };
}

export function getReasonAppointmentDurationMinutes(
  reason: Pick<
    AppointmentReasonConfig,
    | "allowsExecutiveAssignment"
    | "usesAppointmentDuration"
    | "appointmentDurationMinutes"
  >,
) {
  if (!reason.allowsExecutiveAssignment) {
    return FALLBACK_APPOINTMENT_DURATION_MINUTES;
  }

  if (
    reason.usesAppointmentDuration &&
    reason.appointmentDurationMinutes > 0
  ) {
    return reason.appointmentDurationMinutes;
  }

  return FALLBACK_APPOINTMENT_DURATION_MINUTES;
}

export function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function resolveAppointmentSchedule(
  input: AppointmentScheduleInput,
): AppointmentSchedule | null {
  if (!input.appointmentDate || !input.reasonAllowsExecutiveAssignment) {
    return null;
  }

  const startHour = input.startHour ?? DEFAULT_APPOINTMENT_START_HOUR;
  const startMinute = input.startMinute ?? DEFAULT_APPOINTMENT_START_MINUTE;
  const durationMinutes = getReasonAppointmentDurationMinutes({
    allowsExecutiveAssignment: input.reasonAllowsExecutiveAssignment,
    usesAppointmentDuration: input.reasonUsesAppointmentDuration,
    appointmentDurationMinutes: input.reasonAppointmentDurationMinutes,
  });
  const endTime = addMinutesToClockTime(startHour, startMinute, durationMinutes);
  const startLabel = formatClockTime(startHour, startMinute);
  const endLabel = formatClockTime(endTime.hour, endTime.minute);
  const dateLabel = formatDisplayDate(input.appointmentDate);
  const timeRangeLabel = `${startLabel} a ${endLabel}`;

  return {
    startHour,
    startMinute,
    durationMinutes,
    endHour: endTime.hour,
    endMinute: endTime.minute,
    dateLabel,
    timeRangeLabel,
    summaryLabel: `${dateLabel}, ${timeRangeLabel} (${durationMinutes} min)`,
  };
}
