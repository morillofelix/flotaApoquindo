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

export type GenerateMonthlyScheduleOptions = {
  year: number;
  month: number;
  generatedByEmail: string;
  preserveManualOverrides?: boolean;
  overwriteCalculated?: boolean;
};

function atUtcNoon(year: number, month: number, day: number) {
  return new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00.000Z`,
  );
}

function isoWeekday(date: Date) {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/** Estado base del día según las reglas del turno (Lun–Dom). Sin patrón separado. */
function baseStatusCodeFromShift(
  date: Date,
  shift:
    | {
        saturdayRule: string;
        sundayRule: string;
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

export async function generateMonthlySchedule(
  options: GenerateMonthlyScheduleOptions,
) {
  if (!isValidPlanningMonth(options.year, options.month)) {
    throw new Error("Mes de planificación inválido.");
  }

  await ensureDefaultOperationalStatuses();
  const firstDate = atUtcNoon(options.year, options.month, 1);
  const lastDate = atUtcNoon(
    options.year,
    options.month,
    daysInMonth(options.year, options.month),
  );
  const [monthly, statuses, holidays, drivers] = await Promise.all([
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
    prisma.driverOwner.findMany({
      where: { isActive: true, isConductor: true },
      include: {
        group: true,
        subgroupAssignments: { include: { subgroup: true } },
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
    }),
  ]);

  const statusByCode = new Map(statuses.map((status) => [status.code, status]));
  const requiredCodes = ["TRABAJA", "LIBRE", "FERIADO", "BLOQUEADO"];
  for (const code of requiredCodes) {
    if (!statusByCode.has(code)) throw new Error(`Falta el estado operativo ${code}.`);
  }

  const vehicleNumbers = drivers.map((driver) => driver.vehicleNumber);
  const [appointments, blocks] = vehicleNumbers.length
    ? await Promise.all([
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
            driverOwnerId: { in: drivers.map((driver) => driver.id) },
            isActive: true,
            status: { notIn: ["ended", "cancelled"] },
            startsAt: { lte: new Date(`${lastDate.toISOString().slice(0, 10)}T23:59:59.999Z`) },
            OR: [{ endsAt: null }, { endsAt: { gte: new Date(`${firstDate.toISOString().slice(0, 10)}T00:00:00.000Z`) } }],
          },
        }),
      ])
    : [[], []];

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
    drivers: drivers.length,
    days: 0,
    created: 0,
    updated: 0,
    preservedManualOverrides: 0,
    preservedCalculated: 0,
    appointmentEvents: 0,
    blockedDays: 0,
    holidayDays: 0,
  };

  for (const driver of drivers) {
    await prisma.$transaction(
      async (tx) => {
        for (let dayNumber = 1; dayNumber <= daysInMonth(options.year, options.month); dayNumber += 1) {
          const date = atUtcNoon(options.year, options.month, dayNumber);
          const dateKey = date.toISOString().slice(0, 10);
          const assignment = driver.shiftAssignments.find(
            (item) =>
              item.effectiveFrom <= date &&
              (!item.effectiveTo || item.effectiveTo >= date),
          );
          const shift = assignment?.shiftDefinition;
          const baseCode = baseStatusCodeFromShift(date, shift);
          const baseStatus = statusByCode.get(baseCode) ?? statusByCode.get("TRABAJA")!;
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
            appointmentsByVehicleAndDate.get(`${driver.vehicleNumber}:${dateKey}`) ??
            [];
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
          if (!effectiveStatus) {
            throw new Error("No hay estados operativos configurados.");
          }
          const existing = await tx.dailySchedule.findUnique({
            where: { driverOwnerId_date: { driverOwnerId: driver.id, date } },
          });
          const preserveManual =
            options.preserveManualOverrides !== false &&
            existing?.isManualOverride === true;
          const preserveCalculated =
            options.overwriteCalculated === false && Boolean(existing) && !preserveManual;

          const day = await tx.dailySchedule.upsert({
            where: { driverOwnerId_date: { driverOwnerId: driver.id, date } },
            create: {
              monthlyScheduleId: monthly.id,
              date,
              driverOwnerId: driver.id,
              vehicleNumber: driver.vehicleNumber,
              shiftAssignmentId: assignment?.id ?? null,
              baseStatusId: baseStatus.id,
              effectiveStatusId: effectiveStatus.id,
              appointmentId: dayAppointments[0]?.id ?? null,
              driverBlockId: block?.id ?? null,
              changeOrigin: dayAppointments.length
                ? "appointment"
                : block
                  ? "block"
                  : isHoliday
                    ? "holiday"
                    : "generated",
            },
            update: {
              monthlyScheduleId: monthly.id,
              vehicleNumber: driver.vehicleNumber,
              shiftAssignmentId: assignment?.id ?? null,
              baseStatusId: baseStatus.id,
              appointmentId: dayAppointments[0]?.id ?? null,
              driverBlockId: block?.id ?? null,
              ...(!preserveManual && !preserveCalculated
                ? {
                    effectiveStatusId: effectiveStatus.id,
                    changeOrigin: "regenerated",
                    modifiedByEmail: options.generatedByEmail.trim().toLowerCase(),
                    modifiedAt: new Date(),
                    version: { increment: 1 },
                  }
                : {}),
            },
          });

          await tx.dailyScheduleEvent.deleteMany({
            where: { dailyScheduleId: day.id, eventType: "appointment" },
          });
          for (const appointment of dayAppointments) {
            await tx.dailyScheduleEvent.create({
              data: {
                dailyScheduleId: day.id,
                appointmentId: appointment.id,
                eventType: "appointment",
                label: appointment.appointmentReason,
                metadata: JSON.stringify({ ticketNumber: appointment.ticketNumber }),
              },
            });
            summary.appointmentEvents += 1;
          }

          summary.days += 1;
          if (!existing) summary.created += 1;
          else if (preserveManual) summary.preservedManualOverrides += 1;
          else if (preserveCalculated) summary.preservedCalculated += 1;
          else summary.updated += 1;
        }
      },
      { timeout: 30_000 },
    );
  }

  return summary;
}
