import {
  appointmentDateRange,
  enumerateDateRange,
} from "@/lib/appointment-schedule-sync";
import {
  daysInMonth,
  isValidPlanningMonth,
  operationalStatusCodeForAppointmentReason,
} from "@/lib/fleet-schedule";
import { ensureDefaultOperationalStatuses } from "@/lib/operational-status";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type GenerateScope = {
  /** all | group | vehicle | range */
  mode?: "all" | "group" | "vehicle" | "range";
  groupId?: string;
  vehicleNumber?: string;
  vehicleFrom?: string;
  vehicleTo?: string;
};

export type GenerateMonthlyScheduleOptions = {
  year: number;
  month: number;
  generatedByEmail: string;
  preserveManualOverrides?: boolean;
  overwriteCalculated?: boolean;
  scope?: GenerateScope;
  /** Tamaño de lote de conductores por transacción. */
  batchSize?: number;
};

const DRIVER_BATCH_SIZE = 40;

function atUtcNoon(year: number, month: number, day: number) {
  return new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00.000Z`,
  );
}

function isoWeekday(date: Date) {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function normalizeVehicleKey(value: string) {
  return value.trim().replace(/^0+(?=\d)/, "") || "0";
}

function vehicleSortKey(value: string): number | string {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits) {
    return Number.parseInt(digits, 10);
  }
  return trimmed.toLowerCase();
}

function vehicleInRange(vehicleNumber: string, from: string, to: string) {
  const current = vehicleSortKey(vehicleNumber);
  const start = vehicleSortKey(from);
  const end = vehicleSortKey(to);
  if (typeof current === "number" && typeof start === "number" && typeof end === "number") {
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    return current >= min && current <= max;
  }
  const a = String(start);
  const b = String(end);
  const value = String(current);
  return value >= (a < b ? a : b) && value <= (a > b ? a : b);
}

/** Estado base del día según las reglas del turno (Lun–Dom). */
function baseStatusCodeFromShift(
  date: Date,
  shift:
    | {
        saturdayRule: string;
        sundayRule: string;
        holidayRule?: string;
        dayRules: Array<{
          weekday: number;
          works: boolean;
          defaultStatusCode: string;
        }>;
      }
    | null
    | undefined,
) {
  const weekday = isoWeekday(date);
  const baseCode = weekday >= 6 ? "LIBRE" : "TRABAJA";

  if (!shift) {
    return baseCode;
  }

  const rule = shift.dayRules.find((item) => item.weekday === weekday);
  if (rule) {
    return rule.defaultStatusCode || (rule.works ? "TRABAJA" : "LIBRE");
  }

  if (
    (weekday === 6 && shift.saturdayRule === "work") ||
    (weekday === 7 && shift.sundayRule === "work")
  ) {
    return "TRABAJA";
  }

  if (
    (weekday === 6 && shift.saturdayRule === "free") ||
    (weekday === 7 && shift.sundayRule === "free")
  ) {
    return "LIBRE";
  }

  return baseCode;
}

function buildDriverWhere(scope?: GenerateScope): Prisma.DriverOwnerWhereInput {
  const where: Prisma.DriverOwnerWhereInput = {
    isActive: true,
    isConductor: true,
  };
  const mode = scope?.mode ?? "all";

  if (mode === "group" && scope?.groupId?.trim()) {
    where.groupId = scope.groupId.trim();
  }

  if (mode === "vehicle" && scope?.vehicleNumber?.trim()) {
    where.vehicleNumber = scope.vehicleNumber.trim();
  }

  return where;
}

export async function previewMonthlyScheduleGeneration(options: {
  year: number;
  month: number;
  scope?: GenerateScope;
}) {
  if (!isValidPlanningMonth(options.year, options.month)) {
    throw new Error("Mes de planificación inválido.");
  }

  const mode = options.scope?.mode ?? "all";
  const where = buildDriverWhere(options.scope);
  let drivers = await prisma.driverOwner.findMany({
    where,
    select: {
      id: true,
      vehicleNumber: true,
      fullName: true,
      groupId: true,
      group: { select: { id: true, name: true } },
    },
    orderBy: { vehicleNumber: "asc" },
  });

  if (mode === "range") {
    const from = options.scope?.vehicleFrom?.trim() ?? "";
    const to = options.scope?.vehicleTo?.trim() ?? "";
    if (!from || !to) {
      throw new Error("Indica el rango de móviles (desde / hasta).");
    }
    drivers = drivers.filter((driver) =>
      vehicleInRange(driver.vehicleNumber, from, to),
    );
  }

  if (mode === "vehicle" && !options.scope?.vehicleNumber?.trim()) {
    throw new Error("Indica el número de móvil.");
  }

  if (mode === "group" && !options.scope?.groupId?.trim()) {
    throw new Error("Selecciona un grupo.");
  }

  return {
    year: options.year,
    month: options.month,
    mode,
    driversCount: drivers.length,
    daysPerDriver: daysInMonth(options.year, options.month),
    estimatedCells:
      drivers.length * daysInMonth(options.year, options.month),
    sample: drivers.slice(0, 8).map((driver) => ({
      vehicleNumber: driver.vehicleNumber,
      fullName: driver.fullName,
      groupName: driver.group?.name ?? "Sin grupo",
    })),
  };
}

export async function generateMonthlySchedule(
  options: GenerateMonthlyScheduleOptions,
) {
  if (!isValidPlanningMonth(options.year, options.month)) {
    throw new Error("Mes de planificación inválido.");
  }

  await ensureDefaultOperationalStatuses();
  const firstDate = atUtcNoon(options.year, options.month, 1);
  const lastDay = daysInMonth(options.year, options.month);
  const lastDate = atUtcNoon(options.year, options.month, lastDay);
  const monthDates = Array.from({ length: lastDay }, (_, index) =>
    atUtcNoon(options.year, options.month, index + 1),
  );
  const batchSize = Math.max(5, options.batchSize ?? DRIVER_BATCH_SIZE);
  const mode = options.scope?.mode ?? "all";

  const [monthly, statuses, holidays] = await Promise.all([
    prisma.monthlySchedule.upsert({
      where: { year_month: { year: options.year, month: options.month } },
      create: {
        year: options.year,
        month: options.month,
        status: "draft",
        generatedAt: new Date(),
        generatedByEmail: options.generatedByEmail.trim().toLowerCase(),
      },
      update: {
        generatedAt: new Date(),
        generatedByEmail: options.generatedByEmail.trim().toLowerCase(),
      },
    }),
    prisma.operationalStatus.findMany(),
    prisma.holiday.findMany({
      where: {
        year: options.year,
        isActive: true,
        date: { gte: firstDate, lte: lastDate },
      },
    }),
  ]);

  const statusByCode = new Map(statuses.map((status) => [status.code, status]));
  for (const code of ["TRABAJA", "LIBRE", "FERIADO", "BLOQUEADO"]) {
    if (!statusByCode.has(code)) {
      throw new Error(`Falta el estado operativo ${code}.`);
    }
  }

  let drivers = await prisma.driverOwner.findMany({
    where: buildDriverWhere(options.scope),
    include: {
      group: true,
      shiftAssignments: {
        where: {
          isActive: true,
          effectiveFrom: { lte: lastDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: firstDate } }],
        },
        include: {
          shiftDefinition: {
            include: { dayRules: true },
          },
        },
        orderBy: { effectiveFrom: "desc" },
      },
    },
    orderBy: [{ vehicleNumber: "asc" }],
  });

  if (mode === "range") {
    const from = options.scope?.vehicleFrom?.trim() ?? "";
    const to = options.scope?.vehicleTo?.trim() ?? "";
    if (!from || !to) {
      throw new Error("Indica el rango de móviles (desde / hasta).");
    }
    drivers = drivers.filter((driver) =>
      vehicleInRange(driver.vehicleNumber, from, to),
    );
  }

  if (mode === "vehicle" && !options.scope?.vehicleNumber?.trim()) {
    throw new Error("Indica el número de móvil.");
  }

  if (mode === "group" && !options.scope?.groupId?.trim()) {
    throw new Error("Selecciona un grupo.");
  }

  if (!drivers.length) {
    throw new Error("No hay conductores activos que coincidan con el alcance.");
  }

  const vehicleNumbers = drivers.map((driver) => driver.vehicleNumber);
  const driverIds = drivers.map((driver) => driver.id);
  const [appointments, blocks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: "aprobado",
        vehicleNumber: { in: vehicleNumbers },
        OR: [
          { appointmentDate: { gte: firstDate, lte: lastDate } },
          {
            vacationStartDate: { lte: lastDate },
            OR: [
              { vacationEndDate: null },
              { vacationEndDate: { gte: firstDate } },
            ],
          },
          {
            permitStartDate: { lte: lastDate },
            OR: [
              { permitEndDate: null },
              { permitEndDate: { gte: firstDate } },
            ],
          },
          { permitDate: { gte: firstDate, lte: lastDate } },
        ],
      },
    }),
    prisma.driverBlock.findMany({
      where: {
        driverOwnerId: { in: driverIds },
        isActive: true,
        status: { notIn: ["ended", "cancelled"] },
        startsAt: {
          lte: new Date(`${lastDate.toISOString().slice(0, 10)}T23:59:59.999Z`),
        },
        OR: [
          { endsAt: null },
          {
            endsAt: {
              gte: new Date(
                `${firstDate.toISOString().slice(0, 10)}T00:00:00.000Z`,
              ),
            },
          },
        ],
      },
    }),
  ]);

  const appointmentsByVehicleAndDate = new Map<string, typeof appointments>();
  for (const appointment of appointments) {
    const range = appointmentDateRange(appointment);
    for (const date of enumerateDateRange(range.start, range.end)) {
      if (date < firstDate || date > lastDate) continue;
      const key = `${appointment.vehicleNumber}:${date.toISOString().slice(0, 10)}`;
      appointmentsByVehicleAndDate.set(key, [
        ...(appointmentsByVehicleAndDate.get(key) ?? []),
        appointment,
      ]);
    }
  }

  const holidayDates = new Set(
    holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)),
  );

  const summary = {
    monthlyScheduleId: monthly.id,
    year: options.year,
    month: options.month,
    mode,
    driversTargeted: drivers.length,
    drivers: drivers.length,
    days: 0,
    created: 0,
    updated: 0,
    preservedManualOverrides: 0,
    preservedCalculated: 0,
    appointmentEvents: 0,
    blockedDays: 0,
    holidayDays: 0,
    batches: 0,
  };

  for (let offset = 0; offset < drivers.length; offset += batchSize) {
    const batch = drivers.slice(offset, offset + batchSize);
    const batchIds = batch.map((driver) => driver.id);
    summary.batches += 1;

    await prisma.$transaction(
      async (tx) => {
        const existingRows = await tx.dailySchedule.findMany({
          where: {
            driverOwnerId: { in: batchIds },
            date: { gte: firstDate, lte: lastDate },
          },
        });
        const existingByKey = new Map(
          existingRows.map((row) => [
            `${row.driverOwnerId}:${row.date.toISOString().slice(0, 10)}`,
            row,
          ]),
        );

        const creates: Prisma.DailyScheduleCreateManyInput[] = [];
        const eventCreates: Prisma.DailyScheduleEventCreateManyInput[] = [];
        const dayIdsForEventRefresh: string[] = [];

        for (const driver of batch) {
          for (const date of monthDates) {
            const dateKey = date.toISOString().slice(0, 10);
            const assignment = driver.shiftAssignments.find(
              (item) =>
                item.effectiveFrom <= date &&
                (!item.effectiveTo || item.effectiveTo >= date),
            );
            const shift = assignment?.shiftDefinition;
            const baseCode = baseStatusCodeFromShift(date, shift);
            const baseStatus =
              statusByCode.get(baseCode) ?? statusByCode.get("TRABAJA")!;
            const candidates = [baseStatus];
            const isHoliday = holidayDates.has(dateKey);
            if (isHoliday && shift?.holidayRule !== "work") {
              candidates.push(statusByCode.get("FERIADO")!);
              summary.holidayDays += 1;
            }

            const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
            const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
            const block = blocks.find(
              (item) =>
                item.driverOwnerId === driver.id &&
                item.startsAt <= dayEnd &&
                (!item.endsAt || item.endsAt >= dayStart),
            );
            if (block) {
              candidates.push(statusByCode.get("BLOQUEADO")!);
              summary.blockedDays += 1;
            }

            const dayAppointments =
              appointmentsByVehicleAndDate.get(
                `${driver.vehicleNumber}:${dateKey}`,
              ) ?? [];
            for (const appointment of dayAppointments) {
              const appointmentStatus = statusByCode.get(
                operationalStatusCodeForAppointmentReason(
                  appointment.appointmentReason,
                ),
              );
              if (appointmentStatus) candidates.push(appointmentStatus);
            }

            const effectiveStatus =
              [...candidates].sort(
                (left, right) => left.priority - right.priority,
              )[0] ?? baseStatus;

            const changeOrigin = dayAppointments.length
              ? "appointment"
              : block
                ? "block"
                : isHoliday
                  ? "holiday"
                  : "generated";

            const existing = existingByKey.get(`${driver.id}:${dateKey}`);
            const preserveManual =
              options.preserveManualOverrides !== false &&
              existing?.isManualOverride === true;
            const preserveCalculated =
              options.overwriteCalculated === false &&
              Boolean(existing) &&
              !preserveManual;

            if (!existing) {
              creates.push({
                monthlyScheduleId: monthly.id,
                date,
                driverOwnerId: driver.id,
                vehicleNumber: driver.vehicleNumber,
                shiftAssignmentId: assignment?.id ?? null,
                baseStatusId: baseStatus.id,
                effectiveStatusId: effectiveStatus.id,
                appointmentId: dayAppointments[0]?.id ?? null,
                driverBlockId: block?.id ?? null,
                changeOrigin,
              });
              summary.created += 1;
            } else {
              dayIdsForEventRefresh.push(existing.id);
              if (preserveManual) {
                summary.preservedManualOverrides += 1;
              } else if (preserveCalculated) {
                summary.preservedCalculated += 1;
              } else {
                await tx.dailySchedule.update({
                  where: { id: existing.id },
                  data: {
                    monthlyScheduleId: monthly.id,
                    vehicleNumber: driver.vehicleNumber,
                    shiftAssignmentId: assignment?.id ?? null,
                    baseStatusId: baseStatus.id,
                    effectiveStatusId: effectiveStatus.id,
                    appointmentId: dayAppointments[0]?.id ?? null,
                    driverBlockId: block?.id ?? null,
                    changeOrigin: "regenerated",
                    modifiedByEmail: options.generatedByEmail
                      .trim()
                      .toLowerCase(),
                    modifiedAt: new Date(),
                    version: { increment: 1 },
                  },
                });
                summary.updated += 1;
              }
            }

            summary.days += 1;
            summary.appointmentEvents += dayAppointments.length;

            // Events for newly created rows are attached after createMany below.
            if (existing && dayAppointments.length) {
              for (const appointment of dayAppointments) {
                eventCreates.push({
                  dailyScheduleId: existing.id,
                  appointmentId: appointment.id,
                  eventType: "appointment",
                  label: appointment.appointmentReason,
                  metadata: JSON.stringify({
                    ticketNumber: appointment.ticketNumber,
                  }),
                });
              }
            }
          }
        }

        if (creates.length) {
          await tx.dailySchedule.createMany({ data: creates });
          const createdRows = await tx.dailySchedule.findMany({
            where: {
              monthlyScheduleId: monthly.id,
              driverOwnerId: { in: batchIds },
              date: { gte: firstDate, lte: lastDate },
              id: { notIn: existingRows.map((row) => row.id) },
            },
            select: {
              id: true,
              driverOwnerId: true,
              date: true,
              vehicleNumber: true,
            },
          });

          for (const row of createdRows) {
            const dateKey = row.date.toISOString().slice(0, 10);
            const dayAppointments =
              appointmentsByVehicleAndDate.get(
                `${row.vehicleNumber}:${dateKey}`,
              ) ?? [];
            for (const appointment of dayAppointments) {
              eventCreates.push({
                dailyScheduleId: row.id,
                appointmentId: appointment.id,
                eventType: "appointment",
                label: appointment.appointmentReason,
                metadata: JSON.stringify({
                  ticketNumber: appointment.ticketNumber,
                }),
              });
            }
          }
        }

        if (dayIdsForEventRefresh.length) {
          await tx.dailyScheduleEvent.deleteMany({
            where: {
              dailyScheduleId: { in: dayIdsForEventRefresh },
              eventType: "appointment",
            },
          });
        }

        if (eventCreates.length) {
          await tx.dailyScheduleEvent.createMany({ data: eventCreates });
        }
      },
      { timeout: 120_000 },
    );
  }

  return summary;
}

export { normalizeVehicleKey };
