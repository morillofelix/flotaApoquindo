import { appointmentDateRange } from "@/lib/appointment-schedule-sync";
import { prisma } from "@/lib/prisma";

export type DriverAvailabilityConflict = {
  code: string;
  message: string;
};

export type CheckDriverAvailabilityOptions = {
  vehicleNumber: string;
  date: Date | string;
  startTime?: string;
  endTime?: string;
  longTrip?: boolean;
};

function dateOnly(value: Date | string) {
  const iso =
    value instanceof Date ? value.toISOString().slice(0, 10) : value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Fecha inválida.");
  return new Date(`${iso}T12:00:00.000Z`);
}

function minutes(value?: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() || "");
  if (!match) return null;
  const result = Number(match[1]) * 60 + Number(match[2]);
  return result >= 0 && result < 1440 ? result : null;
}

function overlapsTimes(
  requestedStart: number | null,
  requestedEnd: number | null,
  appointmentStart: number | null,
  appointmentEnd: number | null,
) {
  if (
    requestedStart === null ||
    requestedEnd === null ||
    appointmentStart === null ||
    appointmentEnd === null
  ) {
    return true;
  }
  return requestedStart < appointmentEnd && appointmentStart < requestedEnd;
}

export async function checkDriverAvailability(
  options: CheckDriverAvailabilityOptions,
) {
  const conflicts: DriverAvailabilityConflict[] = [];
  const date = dateOnly(options.date);
  const driver = await prisma.driverOwner.findUnique({
    where: { vehicleNumber: options.vehicleNumber.trim() },
  });
  if (!driver) {
    return {
      ok: false,
      conflicts: [{ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." }],
    };
  }
  if (!driver.isActive) {
    conflicts.push({ code: "DRIVER_INACTIVE", message: "El conductor está inactivo." });
  }
  if (!driver.isConductor) {
    conflicts.push({
      code: "NOT_A_DRIVER",
      message: "El registro no está habilitado como conductor.",
    });
  }

  const dayStart = new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const dayEnd = new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999Z`);
  const [daily, blocks, restrictions, appointments] = await Promise.all([
    prisma.dailySchedule.findUnique({
      where: { driverOwnerId_date: { driverOwnerId: driver.id, date } },
      include: { effectiveStatus: true },
    }),
    prisma.driverBlock.findMany({
      where: {
        driverOwnerId: driver.id,
        isActive: true,
        status: { notIn: ["ended", "cancelled"] },
        startsAt: { lte: dayEnd },
        OR: [{ endsAt: null }, { endsAt: { gte: dayStart } }],
      },
      include: { blockReason: true },
    }),
    options.longTrip
      ? prisma.driverLongTripRestriction.findMany({
          where: {
            driverOwnerId: driver.id,
            isActive: true,
            status: { in: ["enabled", "blocked"] },
            OR: [{ startsAt: null }, { startsAt: { lte: dayEnd } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: dayStart } }] }],
          },
        })
      : Promise.resolve([]),
    prisma.appointment.findMany({
      where: { vehicleNumber: driver.vehicleNumber, status: "aprobado" },
    }),
  ]);

  if (daily?.effectiveStatus?.blocksAssignments) {
    conflicts.push({
      code: "DAILY_STATUS_BLOCKS",
      message: `Estado diario: ${daily.effectiveStatus.name}.`,
    });
  }
  for (const block of blocks) {
    if (block.blocksAllServices || (options.longTrip && block.blocksLongTripsOnly)) {
      conflicts.push({
        code: "DRIVER_BLOCK",
        message: `Bloqueo activo: ${block.blockReason.name}.`,
      });
    }
  }
  if (restrictions.length > 0) {
    conflicts.push({
      code: "LONG_TRIP_RESTRICTION",
      message: "El conductor tiene una restricción vigente para viajes largos.",
    });
  }

  const requestedStart = minutes(options.startTime);
  const requestedEnd = minutes(options.endTime);
  for (const appointment of appointments) {
    const range = appointmentDateRange(appointment);
    if (date < range.start || date > range.end) continue;
    const isHourly = appointment.permitType === "horas";
    if (
      isHourly &&
      !overlapsTimes(
        requestedStart,
        requestedEnd,
        minutes(appointment.permitStartTime),
        minutes(appointment.permitEndTime),
      )
    ) {
      continue;
    }
    conflicts.push({
      code: "APPROVED_APPOINTMENT",
      message: `Solicitud aprobada superpuesta: ${appointment.appointmentReason}.`,
    });
  }

  return { ok: conflicts.length === 0, conflicts };
}
