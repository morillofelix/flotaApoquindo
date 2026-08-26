import { operationalStatusCodeForAppointmentReason } from "@/lib/fleet-schedule";
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

function eventTimes(appointment: Appointment, date: Date) {
  if (appointment.permitType !== "horas") return { startAt: null, endAt: null };
  const parse = (time: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) return null;
    const result = new Date(date);
    result.setUTCHours(Number(match[1]), Number(match[2]), 0, 0);
    return result;
  };
  return {
    startAt: parse(appointment.permitStartTime),
    endAt: parse(appointment.permitEndTime),
  };
}

export async function syncAppointmentToDailySchedules(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!appointment) return { appointmentId, syncedDays: 0, removedEvents: 0 };

  const driver = await prisma.driverOwner.findUnique({
    where: { vehicleNumber: appointment.vehicleNumber },
  });
  if (!driver) return { appointmentId, syncedDays: 0, removedEvents: 0 };

  if (appointment.status !== "aprobado") {
    const affected = await prisma.dailySchedule.findMany({
      where: { events: { some: { appointmentId } } },
      select: {
        id: true,
        appointmentId: true,
        changeOrigin: true,
        isManualOverride: true,
        baseStatusId: true,
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.dailyScheduleEvent.deleteMany({ where: { appointmentId } });
      for (const day of affected) {
        await tx.dailySchedule.update({
          where: { id: day.id },
          data: {
            appointmentId:
              day.appointmentId === appointmentId ? null : day.appointmentId,
            ...(day.changeOrigin === "appointment" &&
            !day.isManualOverride &&
            day.baseStatusId
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
    return {
      appointmentId,
      syncedDays: 0,
      removedEvents: affected.length,
    };
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
  for (const date of dates) {
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
  return { appointmentId, syncedDays: dates.length, removedEvents: 0 };
}
