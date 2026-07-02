import {
  adjustStartTimeForLunchBreak,
  addMinutesToClockTime,
  type ExecutiveLunchBreakConfig,
  formatClockTime,
  getReasonAppointmentDurationMinutes,
} from "@/lib/appointment-scheduling";
import { type AppointmentReasonConfig } from "@/lib/appointments";

export const APPOINTMENT_SLOT_BUFFER_MINUTES = 10;

const clockTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ExistingExecutiveSlot = {
  startTime: string;
  endTime: string;
};

export type ComputedExecutiveSlot = {
  startTime: string;
  endTime: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

function toClockMinutes(hour: number, minute: number) {
  return hour * 60 + minute;
}

export function parseClockTime(value: string) {
  if (!clockTimePattern.test(value)) {
    return null;
  }

  const [hourValue = 0, minuteValue = 0] = value.split(":").map(Number);
  return { hour: hourValue, minute: minuteValue };
}

function clockMinutesFromTime(value: string) {
  const parsed = parseClockTime(value);
  if (!parsed) {
    return null;
  }

  return toClockMinutes(parsed.hour, parsed.minute);
}

function minutesToClock(minutes: number) {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return {
    hour: Math.floor(normalized / 60),
    minute: normalized % 60,
  };
}

function getInitialStartMinutes(
  usesServiceStartTime: boolean,
  serviceStartTime: string,
  defaultStartMinutes: number,
) {
  if (usesServiceStartTime) {
    const configuredStart = clockMinutesFromTime(serviceStartTime);
    if (configuredStart !== null) {
      return configuredStart;
    }
  }

  return defaultStartMinutes;
}

export function computeExecutiveAppointmentSlot(input: {
  reason: Pick<
    AppointmentReasonConfig,
    | "allowsExecutiveAssignment"
    | "usesAppointmentDuration"
    | "appointmentDurationMinutes"
    | "usesServiceStartTime"
    | "serviceStartTime"
  >;
  executiveLunchBreak?: ExecutiveLunchBreakConfig | null;
  existingSlots: ExistingExecutiveSlot[];
  defaultStartHour?: number;
  defaultStartMinute?: number;
}): ComputedExecutiveSlot | null {
  if (!input.reason.allowsExecutiveAssignment) {
    return null;
  }

  const durationMinutes = getReasonAppointmentDurationMinutes(input.reason);
  const defaultStartHour = input.defaultStartHour ?? 9;
  const defaultStartMinute = input.defaultStartMinute ?? 0;
  let startMinutes = getInitialStartMinutes(
    input.reason.usesServiceStartTime,
    input.reason.serviceStartTime,
    toClockMinutes(defaultStartHour, defaultStartMinute),
  );

  let changed = true;
  let guard = 0;

  while (changed && guard < 24) {
    guard += 1;
    changed = false;

    for (const slot of input.existingSlots) {
      const slotStart = clockMinutesFromTime(slot.startTime);
      const slotEnd = clockMinutesFromTime(slot.endTime);

      if (slotStart === null || slotEnd === null) {
        continue;
      }

      const nextAvailable = slotEnd + APPOINTMENT_SLOT_BUFFER_MINUTES;

      if (startMinutes < nextAvailable) {
        startMinutes = nextAvailable;
        changed = true;
      }
    }

    const currentStart = minutesToClock(startMinutes);
    const lunchAdjusted = adjustStartTimeForLunchBreak(
      currentStart.hour,
      currentStart.minute,
      durationMinutes,
      input.executiveLunchBreak,
    );
    const lunchAdjustedMinutes = toClockMinutes(
      lunchAdjusted.startHour,
      lunchAdjusted.startMinute,
    );

    if (lunchAdjustedMinutes !== startMinutes) {
      startMinutes = lunchAdjustedMinutes;
      changed = true;
    }
  }

  const startClock = minutesToClock(startMinutes);
  const endClock = addMinutesToClockTime(
    startClock.hour,
    startClock.minute,
    durationMinutes,
  );

  return {
    startTime: formatClockTime(startClock.hour, startClock.minute),
    endTime: formatClockTime(endClock.hour, endClock.minute),
    startHour: startClock.hour,
    startMinute: startClock.minute,
    endHour: endClock.hour,
    endMinute: endClock.minute,
  };
}
