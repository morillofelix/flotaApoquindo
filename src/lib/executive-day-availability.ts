import {
  APPOINTMENT_SLOT_BUFFER_MINUTES,
  parseClockTime,
  type ExistingExecutiveSlot,
} from "@/lib/executive-appointment-slot";
import {
  formatClockTime,
  getReasonAppointmentDurationMinutes,
  type ExecutiveLunchBreakConfig,
} from "@/lib/appointment-scheduling";
import { type Appointment, type AppointmentReasonConfig } from "@/lib/appointments";

export const EXECUTIVE_DAY_START_MINUTES = 9 * 60;
export const EXECUTIVE_DAY_END_MINUTES = 18 * 60;
export const AVAILABILITY_SLOT_STEP_MINUTES = 15;

export type BusyInterval = {
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
  kind: "cita" | "colacion";
  label: string;
};

export type FreeInterval = {
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
};

export type SuggestedStartSlot = {
  startTime: string;
  endTime: string;
};

export type ExecutiveDayAvailability = {
  busy: BusyInterval[];
  free: FreeInterval[];
  suggestedStarts: SuggestedStartSlot[];
  durationMinutes: number;
  hasLunchBreak: boolean;
};

function toMinutes(hour: number, minute: number) {
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return formatClockTime(Math.floor(normalized / 60), normalized % 60);
}

function parseMinutes(value: string) {
  const parsed = parseClockTime(value);
  if (!parsed) {
    return null;
  }

  return toMinutes(parsed.hour, parsed.minute);
}

function mergeIntervals(intervals: BusyInterval[]) {
  if (!intervals.length) {
    return [] as BusyInterval[];
  }

  const sorted = [...intervals].sort(
    (left, right) => left.startMinutes - right.startMinutes,
  );
  const merged: BusyInterval[] = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];

    if (!last || interval.startMinutes > last.endMinutes) {
      merged.push({ ...interval });
      continue;
    }

    if (interval.endMinutes > last.endMinutes) {
      last.endMinutes = interval.endMinutes;
      last.endTime = minutesToTime(interval.endMinutes);
      if (last.kind !== interval.kind) {
        last.label = `${last.label} / ${interval.label}`;
        last.kind = last.kind === "colacion" ? "colacion" : interval.kind;
      }
    }
  }

  return merged;
}

export function getExistingSlotsForExecutiveDay(
  appointments: Appointment[],
  executiveName: string,
  appointmentDate: string,
) {
  return appointments
    .filter(
      (appointment) =>
        appointment.assignedExecutive === executiveName &&
        appointment.appointmentDate === appointmentDate &&
        appointment.scheduledStartTime &&
        appointment.scheduledEndTime &&
        appointment.status !== "cancelado" &&
        appointment.status !== "rechazado",
    )
    .map((appointment) => ({
      startTime: appointment.scheduledStartTime,
      endTime: appointment.scheduledEndTime,
      ticketLabel: appointment.ticketNumber
        ? `Ticket ${appointment.ticketNumber}`
        : appointment.driverName || "Cita",
    }));
}

export function buildExecutiveDayAvailability(input: {
  existingSlots: Array<ExistingExecutiveSlot & { ticketLabel?: string }>;
  lunchBreak?: ExecutiveLunchBreakConfig | null;
  reason: Pick<
    AppointmentReasonConfig,
    | "allowsExecutiveAssignment"
    | "usesAppointmentDuration"
    | "appointmentDurationMinutes"
  >;
  dayStartMinutes?: number;
  dayEndMinutes?: number;
  slotStepMinutes?: number;
}): ExecutiveDayAvailability {
  const durationMinutes = getReasonAppointmentDurationMinutes(input.reason);
  const dayStart = input.dayStartMinutes ?? EXECUTIVE_DAY_START_MINUTES;
  const dayEnd = input.dayEndMinutes ?? EXECUTIVE_DAY_END_MINUTES;
  const step = input.slotStepMinutes ?? AVAILABILITY_SLOT_STEP_MINUTES;
  const busyRaw: BusyInterval[] = [];

  for (const slot of input.existingSlots) {
    const start = parseMinutes(slot.startTime);
    const end = parseMinutes(slot.endTime);

    if (start === null || end === null || end <= start) {
      continue;
    }

    busyRaw.push({
      startMinutes: start,
      endMinutes: end,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
      kind: "cita",
      label: slot.ticketLabel ?? "Cita agendada",
    });
  }

  let hasLunchBreak = false;

  if (input.lunchBreak?.lunchBreakEnabled) {
    const lunchStart = parseMinutes(input.lunchBreak.lunchBreakStart);
    const lunchEnd = parseMinutes(input.lunchBreak.lunchBreakEnd);

    if (
      lunchStart !== null &&
      lunchEnd !== null &&
      lunchEnd > lunchStart
    ) {
      hasLunchBreak = true;
      busyRaw.push({
        startMinutes: lunchStart,
        endMinutes: lunchEnd,
        startTime: minutesToTime(lunchStart),
        endTime: minutesToTime(lunchEnd),
        kind: "colacion",
        label: "Colación",
      });
    }
  }

  const busy = mergeIntervals(busyRaw);
  const free: FreeInterval[] = [];
  let cursor = dayStart;

  for (const block of busy) {
    const blockStart = Math.max(block.startMinutes, dayStart);
    const blockEnd = Math.min(block.endMinutes, dayEnd);

    if (blockStart >= dayEnd) {
      break;
    }

    if (cursor < blockStart) {
      free.push({
        startMinutes: cursor,
        endMinutes: Math.min(blockStart, dayEnd),
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(Math.min(blockStart, dayEnd)),
      });
    }

    cursor = Math.max(cursor, blockEnd);
  }

  if (cursor < dayEnd) {
    free.push({
      startMinutes: cursor,
      endMinutes: dayEnd,
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(dayEnd),
    });
  }

  const suggestedStarts: SuggestedStartSlot[] = [];

  for (
    let start = dayStart;
    start + durationMinutes <= dayEnd;
    start += step
  ) {
    const end = start + durationMinutes;
    const overlapsBusy = busy.some(
      (block) => start < block.endMinutes && end > block.startMinutes,
    );

    if (overlapsBusy) {
      continue;
    }

    // Buffer against previous appointment end (same rule as slot engine)
    const tooCloseToPrevious = busy.some((block) => {
      if (block.kind !== "cita") {
        return false;
      }

      return (
        start < block.endMinutes + APPOINTMENT_SLOT_BUFFER_MINUTES &&
        start >= block.endMinutes
      );
    });

    if (tooCloseToPrevious) {
      continue;
    }

    suggestedStarts.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
    });
  }

  return {
    busy,
    free,
    suggestedStarts,
    durationMinutes,
    hasLunchBreak,
  };
}
