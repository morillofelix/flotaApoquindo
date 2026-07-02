import { type ExecutiveConfig, type AppointmentReasonConfig } from "@/lib/appointments";
import { parseClockTime } from "@/lib/executive-appointment-slot";

export const DEFAULT_APPOINTMENT_START_HOUR = 9;
export const DEFAULT_APPOINTMENT_START_MINUTE = 0;
export const FALLBACK_APPOINTMENT_DURATION_MINUTES = 30;

export type ExecutiveLunchBreakConfig = Pick<
  ExecutiveConfig,
  "lunchBreakEnabled" | "lunchBreakStart" | "lunchBreakEnd"
>;

export type AppointmentScheduleInput = {
  appointmentDate: string;
  reasonAllowsExecutiveAssignment: boolean;
  reasonUsesAppointmentDuration: boolean;
  reasonAppointmentDurationMinutes: number;
  reasonUsesServiceStartTime?: boolean;
  reasonServiceStartTime?: string;
  startHour?: number;
  startMinute?: number;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  executiveLunchBreak?: ExecutiveLunchBreakConfig | null;
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

const clockTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

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

function toClockMinutes(hour: number, minute: number) {
  return hour * 60 + minute;
}

function parseClockMinutes(value: string) {
  if (!clockTimePattern.test(value)) {
    return null;
  }

  const [hourValue = 0, minuteValue = 0] = value.split(":").map(Number);
  return toClockMinutes(hourValue, minuteValue);
}

export function toExecutiveLunchBreakConfig(
  executive?: ExecutiveLunchBreakConfig | null,
): ExecutiveLunchBreakConfig | undefined {
  if (!executive?.lunchBreakEnabled) {
    return undefined;
  }

  return executive;
}

export function adjustStartTimeForLunchBreak(
  startHour: number,
  startMinute: number,
  durationMinutes: number,
  lunchBreak?: ExecutiveLunchBreakConfig | null,
) {
  if (!lunchBreak?.lunchBreakEnabled) {
    return { startHour, startMinute };
  }

  const lunchStartMinutes = parseClockMinutes(lunchBreak.lunchBreakStart);
  const lunchEndMinutes = parseClockMinutes(lunchBreak.lunchBreakEnd);

  if (
    lunchStartMinutes === null ||
    lunchEndMinutes === null ||
    lunchEndMinutes <= lunchStartMinutes
  ) {
    return { startHour, startMinute };
  }

  const startMinutes = toClockMinutes(startHour, startMinute);
  const endMinutes = startMinutes + durationMinutes;
  const overlapsLunch =
    startMinutes < lunchEndMinutes && endMinutes > lunchStartMinutes;

  if (!overlapsLunch) {
    return { startHour, startMinute };
  }

  const adjustedStartMinutes = lunchEndMinutes;

  return {
    startHour: Math.floor(adjustedStartMinutes / 60),
    startMinute: adjustedStartMinutes % 60,
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

  const durationMinutes = getReasonAppointmentDurationMinutes({
    allowsExecutiveAssignment: input.reasonAllowsExecutiveAssignment,
    usesAppointmentDuration: input.reasonUsesAppointmentDuration,
    appointmentDurationMinutes: input.reasonAppointmentDurationMinutes,
  });

  if (input.scheduledStartTime && input.scheduledEndTime) {
    const storedStart = parseClockTime(input.scheduledStartTime);
    const storedEnd = parseClockTime(input.scheduledEndTime);

    if (storedStart && storedEnd) {
      const timeRangeLabel = `${formatClockTime(storedStart.hour, storedStart.minute)} a ${formatClockTime(storedEnd.hour, storedEnd.minute)}`;
      const dateLabel = formatDisplayDate(input.appointmentDate);

      return {
        startHour: storedStart.hour,
        startMinute: storedStart.minute,
        durationMinutes,
        endHour: storedEnd.hour,
        endMinute: storedEnd.minute,
        dateLabel,
        timeRangeLabel,
        summaryLabel: `${dateLabel}, ${timeRangeLabel} (${durationMinutes} min)`,
      };
    }
  }

  const baseStartHour = input.startHour ?? DEFAULT_APPOINTMENT_START_HOUR;
  const baseStartMinute = input.startMinute ?? DEFAULT_APPOINTMENT_START_MINUTE;
  const adjustedStart = adjustStartTimeForLunchBreak(
    baseStartHour,
    baseStartMinute,
    durationMinutes,
    input.executiveLunchBreak,
  );
  const endTime = addMinutesToClockTime(
    adjustedStart.startHour,
    adjustedStart.startMinute,
    durationMinutes,
  );
  const startLabel = formatClockTime(
    adjustedStart.startHour,
    adjustedStart.startMinute,
  );
  const endLabel = formatClockTime(endTime.hour, endTime.minute);
  const dateLabel = formatDisplayDate(input.appointmentDate);
  const timeRangeLabel = `${startLabel} a ${endLabel}`;

  return {
    startHour: adjustedStart.startHour,
    startMinute: adjustedStart.startMinute,
    durationMinutes,
    endHour: endTime.hour,
    endMinute: endTime.minute,
    dateLabel,
    timeRangeLabel,
    summaryLabel: `${dateLabel}, ${timeRangeLabel} (${durationMinutes} min)`,
  };
}
