import {
  APPOINTMENT_REASON_TO_STATUS_CODE,
  operationalStatusCodeForAppointmentReason,
} from "@/lib/fleet-schedule";
import { ensureDefaultOperationalStatuses } from "@/lib/operational-status";
import { prisma } from "@/lib/prisma";
import type { Appointment } from "@prisma/client";

export function toDateOnly(value: Date) {
  return new Date(`${value.toISOString().slice(0, 10)}T12:00:00.000Z`);
}

export function appointmentDateRange(
  appointment: Pick<
    Appointment,
    | "appointmentReason"
    | "appointmentDate"
    | "vacationStartDate"
    | "vacationEndDate"
    | "permitType"
    | "permitStartDate"
    | "permitEndDate"
    | "permitDate"
  >,
) {
  const reason = appointment.appointmentReason.trim().toLowerCase();
  let start: Date;
  let end: Date;

  if (
    (reason.includes("vacacion") || reason.includes("licencia")) &&
    appointment.vacationStartDate
  ) {
    start = appointment.vacationStartDate;
    end = appointment.vacationEndDate ?? start;
  } else if (appointment.permitType === "dias" && appointment.permitStartDate) {
    start = appointment.permitStartDate;
    end = appointment.permitEndDate ?? start;
  } else if (appointment.permitType === "horas" && appointment.permitDate) {
    start = appointment.permitDate;
    end = start;
  } else {
    start = appointment.appointmentDate;
    end = start;
  }

  const normalizedStart = toDateOnly(start);
  const normalizedEnd = toDateOnly(end);
  return {
    start: normalizedStart,
    end: normalizedEnd < normalizedStart ? normalizedStart : normalizedEnd,
  };
}

export function enumerateDateRange(start: Date, end: Date) {
  const dates: Date[] = [];
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    dates.push(new Date(cursor));
  }
  return dates;
}

const APPOINTMENT_STATUS_CODES = new Set([
  ...Object.values(APPOINTMENT_REASON_TO_STATUS_CODE),
  "PERMISO",
]);

export type AppointmentDriverCandidate = {
  id: string;
  vehicleNumber: string;
  fullName: string;
};

const nameTokenCache = new Map<string, string[]>();

function nameTokens(value: string) {
  const cached = nameTokenCache.get(value);
  if (cached) return cached;
  const tokens = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (nameTokenCache.size > 5000) nameTokenCache.clear();
  nameTokenCache.set(value, tokens);
  return tokens;
}

/** "exact" mismo nombre normalizado; "similar" mismo nombre con diferencias menores. */
export function driverNamesMatch(left: string, right: string) {
  const a = nameTokens(left);
  const b = nameTokens(right);
  if (!a.length || !b.length) return null;
  if (a.join(" ") === b.join(" ")) return "exact" as const;
  const rightSet = new Set(b);
  const shared = a.filter((token) => rightSet.has(token)).length;
  const shorter = Math.min(a.length, b.length);
  if ((shorter >= 2 && shared === shorter) || shared >= 3) {
    return "similar" as const;
  }
  return null;
}

/**
 * La solicitud pertenece a la persona que la pidió, no al móvil: si el móvil
 * cambió de conductor, no se aplica al nuevo; si el conductor se movió a otro
 * móvil, lo sigue.
 */
export function resolveAppointmentDriver<T extends AppointmentDriverCandidate>(
  appointment: Pick<Appointment, "driverName" | "vehicleNumber">,
  drivers: T[],
): T | null {
  const vehicleOwner =
    drivers.find((driver) => driver.vehicleNumber === appointment.vehicleNumber) ??
    null;
  if (!appointment.driverName.trim()) return vehicleOwner;
  const matchWith = (driver: T) =>
    driverNamesMatch(appointment.driverName, driver.fullName);
  if (vehicleOwner && matchWith(vehicleOwner) === "exact") return vehicleOwner;
  const exact = drivers.find((driver) => matchWith(driver) === "exact");
  if (exact) return exact;
  if (vehicleOwner && matchWith(vehicleOwner) === "similar") return vehicleOwner;
  return drivers.find((driver) => matchWith(driver) === "similar") ?? null;
}

async function findAppointmentDriver(
  appointment: Pick<Appointment, "driverName" | "vehicleNumber">,
) {
  const vehicleOwner = await prisma.driverOwner.findUnique({
    where: { vehicleNumber: appointment.vehicleNumber },
    select: { id: true, vehicleNumber: true, fullName: true },
  });
  if (
    vehicleOwner &&
    (!appointment.driverName.trim() ||
      driverNamesMatch(appointment.driverName, vehicleOwner.fullName) === "exact")
  ) {
    return vehicleOwner;
  }
  const drivers = await prisma.driverOwner.findMany({
    select: { id: true, vehicleNumber: true, fullName: true },
  });
  return resolveAppointmentDriver(appointment, drivers);
}

function eventTimes(appointment: Appointment, date: Date) {
  if (appointment.permitType !== "horas") return { startAt: null, endAt: null };
  const parse = (time: string, dayOffset = 0) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) return null;
    const result = new Date(date);
    if (dayOffset) {
      result.setUTCDate(result.getUTCDate() + dayOffset);
    }
    result.setUTCHours(Number(match[1]), Number(match[2]), 0, 0);
    return result;
  };
  const start = appointment.permitStartTime.trim();
  const end = appointment.permitEndTime.trim();
  const overnight = Boolean(start && end && end < start);
  return {
    startAt: parse(start),
    endAt: parse(end, overnight ? 1 : 0),
  };
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * Quita la solicitud de los días de planificación que ya no le corresponden
 * (todos si `keepDateKeys` no se entrega). Si el día sigue teniendo otra
 * solicitud, se conserva su estado.
 */
export async function releaseAppointmentFromDailySchedules(
  appointmentId: string,
  keepDateKeys?: Set<string>,
  keepDriverOwnerId?: string,
) {
  const linkedDays = await prisma.dailySchedule.findMany({
    where: {
      OR: [{ appointmentId }, { events: { some: { appointmentId } } }],
    },
    select: {
      id: true,
      date: true,
      driverOwnerId: true,
      appointmentId: true,
      changeOrigin: true,
      isManualOverride: true,
      baseStatusId: true,
      effectiveStatus: { select: { code: true } },
      events: { select: { appointmentId: true } },
    },
  });

  const toRelease = keepDateKeys
    ? linkedDays.filter(
        (day) =>
          !keepDateKeys.has(dateKey(day.date)) ||
          (keepDriverOwnerId !== undefined &&
            day.driverOwnerId !== keepDriverOwnerId),
      )
    : linkedDays;

  if (!toRelease.length) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.dailyScheduleEvent.deleteMany({
      where: {
        appointmentId,
        dailyScheduleId: { in: toRelease.map((day) => day.id) },
      },
    });

    for (const day of toRelease) {
      const otherAppointmentId =
        day.events.find(
          (event) => event.appointmentId && event.appointmentId !== appointmentId,
        )?.appointmentId ?? null;
      const statusFromAppointment =
        day.changeOrigin === "appointment" ||
        (day.changeOrigin === "regenerated" &&
          APPOINTMENT_STATUS_CODES.has(day.effectiveStatus?.code ?? ""));
      const shouldRestoreBase =
        !otherAppointmentId &&
        statusFromAppointment &&
        !day.isManualOverride &&
        Boolean(day.baseStatusId);

      await tx.dailySchedule.update({
        where: { id: day.id },
        data: {
          appointmentId:
            day.appointmentId === appointmentId
              ? otherAppointmentId
              : day.appointmentId,
          ...(shouldRestoreBase
            ? {
                effectiveStatusId: day.baseStatusId,
                changeOrigin: "generated",
                version: { increment: 1 },
              }
            : {}),
        },
      });
    }
  });

  return toRelease.length;
}

export async function syncAppointmentToDailySchedules(
  appointmentId: string,
  options?: { onlyFrom?: Date; onlyTo?: Date },
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!appointment) return { appointmentId, syncedDays: 0, removedEvents: 0 };

  if (appointment.status !== "aprobado") {
    const removedEvents = await releaseAppointmentFromDailySchedules(appointmentId);
    return { appointmentId, syncedDays: 0, removedEvents };
  }

  const driver = await findAppointmentDriver(appointment);
  if (!driver) {
    const removedEvents = await releaseAppointmentFromDailySchedules(appointmentId);
    return { appointmentId, syncedDays: 0, removedEvents };
  }

  await ensureDefaultOperationalStatuses();
  const status = await prisma.operationalStatus.findUnique({
    where: {
      code: operationalStatusCodeForAppointmentReason(
        appointment.appointmentReason,
      ),
    },
  });
  if (!status) throw new Error("No existe el estado operativo de la solicitud.");

  const { start, end } = appointmentDateRange(appointment);
  const dates = enumerateDateRange(start, end);
  const removedEvents = await releaseAppointmentFromDailySchedules(
    appointmentId,
    new Set(dates.map(dateKey)),
    driver.id,
  );
  const datesToSync = dates.filter(
    (date) =>
      (!options?.onlyFrom || date >= options.onlyFrom) &&
      (!options?.onlyTo || date <= options.onlyTo),
  );
  for (const date of datesToSync) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    await prisma.$transaction(async (tx) => {
      const monthly = await tx.monthlySchedule.upsert({
        where: { year_month: { year, month } },
        create: { year, month, status: "draft" },
        update: {},
      });
      const existing = await tx.dailySchedule.findUnique({
        where: { driverOwnerId_date: { driverOwnerId: driver.id, date } },
      });
      const weekday = date.getUTCDay();
      const fallbackCode = weekday === 0 || weekday === 6 ? "LIBRE" : "TRABAJA";
      const fallback = await tx.operationalStatus.findUnique({
        where: { code: fallbackCode },
      });
      if (!fallback) throw new Error(`No existe el estado ${fallbackCode}.`);

      const day = await tx.dailySchedule.upsert({
        where: { driverOwnerId_date: { driverOwnerId: driver.id, date } },
        create: {
          monthlyScheduleId: monthly.id,
          date,
          driverOwnerId: driver.id,
          vehicleNumber: driver.vehicleNumber,
          baseStatusId: fallback.id,
          effectiveStatusId: status.id,
          appointmentId,
          changeOrigin: "appointment",
        },
        update: {
          monthlyScheduleId: monthly.id,
          appointmentId,
          ...(!existing?.isManualOverride
            ? {
                effectiveStatusId: status.id,
                changeOrigin: "appointment",
                version: { increment: 1 },
              }
            : {}),
        },
      });
      await tx.dailyScheduleEvent.deleteMany({
        where: { dailyScheduleId: day.id, appointmentId },
      });
      const times = eventTimes(appointment, date);
      await tx.dailyScheduleEvent.create({
        data: {
          dailyScheduleId: day.id,
          appointmentId,
          eventType: "appointment",
          startAt: times.startAt,
          endAt: times.endAt,
          label: appointment.appointmentReason,
          metadata: JSON.stringify({
            vehicleNumber: appointment.vehicleNumber,
            ticketNumber: appointment.ticketNumber,
          }),
        },
      });
    });
  }
  return { appointmentId, syncedDays: datesToSync.length, removedEvents };
}
