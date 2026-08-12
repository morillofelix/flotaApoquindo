import {
  APPOINTMENT_SLOT_BUFFER_MINUTES,
  parseClockTime,
  type ExistingExecutiveSlot,
} from "@/lib/executive-appointment-slot";
import {
  DEFAULT_APPOINTMENT_START_HOUR,
  DEFAULT_APPOINTMENT_START_MINUTE,
  FALLBACK_APPOINTMENT_DURATION_MINUTES,
  formatClockTime,
  getReasonAppointmentDurationMinutes,
  type ExecutiveLunchBreakConfig,
} from "@/lib/appointment-scheduling";
import { type Appointment, type AppointmentReasonConfig } from "@/lib/appointments";

/** Configuración base del sistema cuando el motivo no fija ventana horaria. */
export const DEFAULT_DAY_START_MINUTES =
  DEFAULT_APPOINTMENT_START_HOUR * 60 + DEFAULT_APPOINTMENT_START_MINUTE;
export const DEFAULT_DAY_END_MINUTES = 18 * 60;
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

export type SelectedTimeRange = {
  startTime: string;
  endTime: string;
};

export type TimeRangeValidation =
  | { ok: true }
  | { ok: false; message: string };

export type ExecutiveDayAvailability = {
  busy: BusyInterval[];
  free: FreeInterval[];
  suggestedStarts: SuggestedStartSlot[];
  durationMinutes: number;
  hasLunchBreak: boolean;
  dayStartTime: string;
  dayEndTime: string;
  dayStartMinutes: number;
  dayEndMinutes: number;
  /** Minutos desde medianoche (Santiago). Si hay valor, no se permiten inicios anteriores. */
  earliestSelectableStartMinutes: number | null;
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

/** Hora actual en minutos desde medianoche, zona America/Santiago. */
export function getSantiagoNowMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hourRaw = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  const hour = hourRaw === 24 ? 0 : hourRaw;

  return toMinutes(hour, minute);
}

export function getSantiagoTodayDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(now);
}

/**
 * Si la cita es para hoy (Santiago), no se puede sugerir/seleccionar
 * una hora de inicio anterior al instante actual.
 */
export function resolveEarliestSelectableStartMinutes(
  appointmentDate: string | undefined,
  now = new Date(),
) {
  if (!appointmentDate || !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
    return null;
  }

  if (appointmentDate !== getSantiagoTodayDate(now)) {
    return null;
  }

  return getSantiagoNowMinutes(now);
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

export function resolveAvailabilityDayWindow(
  reason: Pick<
    AppointmentReasonConfig,
    "usesServiceStartTime" | "serviceStartTime"
  >,
) {
  let dayStartMinutes = DEFAULT_DAY_START_MINUTES;

  if (reason.usesServiceStartTime && reason.serviceStartTime) {
    const configured = parseMinutes(reason.serviceStartTime);
    if (configured !== null) {
      dayStartMinutes = configured;
    }
  }

  const dayEndMinutes = Math.max(dayStartMinutes + 60, DEFAULT_DAY_END_MINUTES);

  return {
    dayStartMinutes,
    dayEndMinutes,
    dayStartTime: minutesToTime(dayStartMinutes),
    dayEndTime: minutesToTime(dayEndMinutes),
  };
}

export function getExistingSlotsForExecutiveDay(
  appointments: Appointment[],
  executiveName: string,
  appointmentDate: string,
  excludeAppointmentId?: string,
) {
  return appointments
    .filter(
      (appointment) =>
        appointment.assignedExecutive === executiveName &&
        appointment.appointmentDate === appointmentDate &&
        appointment.scheduledStartTime &&
        appointment.scheduledEndTime &&
        appointment.status !== "cancelado" &&
        appointment.status !== "rechazado" &&
        (!excludeAppointmentId || appointment.id !== excludeAppointmentId),
    )
    .map((appointment) => ({
      startTime: appointment.scheduledStartTime,
      endTime: appointment.scheduledEndTime,
      ticketLabel: appointment.ticketNumber
        ? `Ticket ${appointment.ticketNumber}`
        : appointment.driverName || "Cita",
    }));
}

export function buildBusyIntervals(input: {
  existingSlots: Array<ExistingExecutiveSlot & { ticketLabel?: string }>;
  lunchBreak?: ExecutiveLunchBreakConfig | null;
}) {
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

    if (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart) {
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

  return {
    busy: mergeIntervals(busyRaw),
    hasLunchBreak,
  };
}

export function buildExecutiveDayAvailability(input: {
  existingSlots: Array<ExistingExecutiveSlot & { ticketLabel?: string }>;
  lunchBreak?: ExecutiveLunchBreakConfig | null;
  reason: Pick<
    AppointmentReasonConfig,
    | "allowsExecutiveAssignment"
    | "usesAppointmentDuration"
    | "appointmentDurationMinutes"
    | "usesServiceStartTime"
    | "serviceStartTime"
  >;
  dayStartMinutes?: number;
  dayEndMinutes?: number;
  slotStepMinutes?: number;
  appointmentDate?: string;
  now?: Date;
}): ExecutiveDayAvailability {
  const durationMinutes = getReasonAppointmentDurationMinutes(input.reason);
  const window = resolveAvailabilityDayWindow(input.reason);
  const dayStart = input.dayStartMinutes ?? window.dayStartMinutes;
  const dayEnd = input.dayEndMinutes ?? window.dayEndMinutes;
  const step = input.slotStepMinutes ?? AVAILABILITY_SLOT_STEP_MINUTES;
  const earliestSelectableStartMinutes = resolveEarliestSelectableStartMinutes(
    input.appointmentDate,
    input.now,
  );
  const selectableFrom = Math.max(
    dayStart,
    earliestSelectableStartMinutes ?? dayStart,
  );
  const { busy, hasLunchBreak } = buildBusyIntervals(input);

  const freeRaw: FreeInterval[] = [];
  let cursor = dayStart;

  for (const block of busy) {
    const blockStart = Math.max(block.startMinutes, dayStart);
    const blockEnd = Math.min(block.endMinutes, dayEnd);

    if (blockStart >= dayEnd) {
      break;
    }

    if (cursor < blockStart) {
      freeRaw.push({
        startMinutes: cursor,
        endMinutes: Math.min(blockStart, dayEnd),
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(Math.min(blockStart, dayEnd)),
      });
    }

    cursor = Math.max(cursor, blockEnd);
  }

  if (cursor < dayEnd) {
    freeRaw.push({
      startMinutes: cursor,
      endMinutes: dayEnd,
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(dayEnd),
    });
  }

  const free: FreeInterval[] = [];

  for (const block of freeRaw) {
    const startMinutes = Math.max(block.startMinutes, selectableFrom);

    if (startMinutes >= block.endMinutes) {
      continue;
    }

    free.push({
      startMinutes,
      endMinutes: block.endMinutes,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(block.endMinutes),
    });
  }

  const suggestedStarts: SuggestedStartSlot[] = [];
  const suggestionStart =
    earliestSelectableStartMinutes === null
      ? dayStart
      : Math.ceil(selectableFrom / step) * step;

  for (
    let start = suggestionStart;
    start + durationMinutes <= dayEnd;
    start += step
  ) {
    if (start < selectableFrom) {
      continue;
    }
    const end = start + durationMinutes;
    const overlapsBusy = busy.some(
      (block) => start < block.endMinutes && end > block.startMinutes,
    );

    if (overlapsBusy) {
      continue;
    }

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
    dayStartTime: minutesToTime(dayStart),
    dayEndTime: minutesToTime(dayEnd),
    dayStartMinutes: dayStart,
    dayEndMinutes: dayEnd,
    earliestSelectableStartMinutes,
  };
}

export function suggestRangeFromFreeBlock(
  free: FreeInterval,
  durationMinutes: number,
): SelectedTimeRange | null {
  const usableDuration = Math.max(
    durationMinutes || FALLBACK_APPOINTMENT_DURATION_MINUTES,
    5,
  );

  if (free.endMinutes - free.startMinutes < usableDuration) {
    return null;
  }

  return {
    startTime: free.startTime,
    endTime: minutesToTime(free.startMinutes + usableDuration),
  };
}

export function validateAppointmentTimeRange(input: {
  startTime: string;
  endTime: string;
  availability: ExecutiveDayAvailability;
  enforceMinimumDuration?: boolean;
}): TimeRangeValidation {
  const start = parseMinutes(input.startTime);
  const end = parseMinutes(input.endTime);

  if (start === null || end === null) {
    return {
      ok: false,
      message: "Ingresa una hora de inicio y término válidas.",
    };
  }

  if (end <= start) {
    return {
      ok: false,
      message: "La hora de inicio debe ser anterior a la hora de término.",
    };
  }

  if (
    input.availability.earliestSelectableStartMinutes !== null &&
    start < input.availability.earliestSelectableStartMinutes
  ) {
    return {
      ok: false,
      message:
        "No puedes agendar una hora que ya pasó. Elige un horario posterior.",
    };
  }

  if (
    start < input.availability.dayStartMinutes ||
    end > input.availability.dayEndMinutes
  ) {
    return {
      ok: false,
      message: `El horario seleccionado está fuera del horario de atención (${input.availability.dayStartTime} – ${input.availability.dayEndTime}).`,
    };
  }

  if (
    input.enforceMinimumDuration !== false &&
    end - start < input.availability.durationMinutes
  ) {
    return {
      ok: false,
      message: `El horario seleccionado no cumple con la configuración del motivo (${input.availability.durationMinutes} min mínimo).`,
    };
  }

  const overlapsBusy = input.availability.busy.find(
    (block) => start < block.endMinutes && end > block.startMinutes,
  );

  if (overlapsBusy) {
    return {
      ok: false,
      message:
        "El horario seleccionado se cruza con un bloque no disponible. Selecciona otro rango.",
    };
  }

  const fitsInFree = input.availability.free.some(
    (block) => start >= block.startMinutes && end <= block.endMinutes,
  );

  if (!fitsInFree) {
    return {
      ok: false,
      message:
        "El horario seleccionado no está disponible. Selecciona otro rango.",
    };
  }

  return { ok: true };
}
