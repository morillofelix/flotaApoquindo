import {
  type Appointment,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import {
  formatClockTime,
  resolveAppointmentSchedule,
} from "@/lib/appointment-scheduling";

export type CalendarViewMode = "month" | "day";

export type AppointmentCalendarEvent = {
  id: string;
  appointmentId: string;
  date: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  timeLabel: string;
  executive: string;
  vehicleNumber: string;
  driverName: string;
  reasonLabel: string;
  status: string;
  ticketLabel: string;
  sortKey: number;
};

const HIDDEN_STATUSES = new Set(["cancelado", "rechazado"]);

const weekdayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function parseClock(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());

  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function toSortKey(hour: number, minute: number) {
  return hour * 60 + minute;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function enumerateDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);

  while (current <= end) {
    dates.push(toIsoDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function buildEvent(
  appointment: Appointment,
  event: Omit<AppointmentCalendarEvent, "id" | "appointmentId" | "ticketLabel">,
) {
  return {
    ...event,
    id: `${appointment.id}-${event.date}-${event.sortKey}`,
    appointmentId: appointment.id,
    ticketLabel: getAppointmentTicketLabel(appointment.ticketNumber),
  };
}

export function getAppointmentCalendarEvents(
  appointment: Appointment,
): AppointmentCalendarEvent[] {
  if (HIDDEN_STATUSES.has(appointment.status)) {
    return [];
  }

  const events: AppointmentCalendarEvent[] = [];

  if (
    appointment.reasonAllowsExecutiveAssignment &&
    appointment.assignedExecutive
  ) {
    const schedule = resolveAppointmentSchedule({
      appointmentDate: appointment.appointmentDate,
      reasonAllowsExecutiveAssignment:
        appointment.reasonAllowsExecutiveAssignment,
      reasonUsesAppointmentDuration: appointment.reasonUsesAppointmentDuration,
      reasonAppointmentDurationMinutes:
        appointment.reasonAppointmentDurationMinutes,
    });

    if (schedule) {
      events.push(
        buildEvent(appointment, {
          date: appointment.appointmentDate,
          startHour: schedule.startHour,
          startMinute: schedule.startMinute,
          endHour: schedule.endHour,
          endMinute: schedule.endMinute,
          timeLabel: schedule.timeRangeLabel,
          executive: appointment.assignedExecutive,
          vehicleNumber: appointment.vehicleNumber,
          driverName: appointment.driverName,
          reasonLabel: appointment.appointmentReasonLabel,
          status: appointment.status,
          sortKey: toSortKey(schedule.startHour, schedule.startMinute),
        }),
      );
    }
  }

  if (
    appointment.reasonUsesPermitDetails &&
    appointment.permitType === "horas" &&
    appointment.permitDate
  ) {
    const start = parseClock(appointment.permitStartTime);
    const end = parseClock(appointment.permitEndTime);

    if (start && end) {
      events.push(
        buildEvent(appointment, {
          date: appointment.permitDate,
          startHour: start.hour,
          startMinute: start.minute,
          endHour: end.hour,
          endMinute: end.minute,
          timeLabel: `${formatClockTime(start.hour, start.minute)} a ${formatClockTime(end.hour, end.minute)}`,
          executive: appointment.assignedExecutive || "Sin ejecutivo",
          vehicleNumber: appointment.vehicleNumber,
          driverName: appointment.driverName,
          reasonLabel: appointment.appointmentReasonLabel,
          status: appointment.status,
          sortKey: toSortKey(start.hour, start.minute),
        }),
      );
    }
  }

  if (
    appointment.reasonUsesDateRange &&
    appointment.vacationStartDate &&
    appointment.vacationEndDate
  ) {
    for (const date of enumerateDateRange(
      appointment.vacationStartDate,
      appointment.vacationEndDate,
    )) {
      events.push(
        buildEvent(appointment, {
          date,
          startHour: 0,
          startMinute: 0,
          endHour: 23,
          endMinute: 59,
          timeLabel: "Todo el día",
          executive: appointment.assignedExecutive || "Sin ejecutivo",
          vehicleNumber: appointment.vehicleNumber,
          driverName: appointment.driverName,
          reasonLabel: appointment.appointmentReasonLabel,
          status: appointment.status,
          sortKey: 0,
        }),
      );
    }
  }

  if (
    appointment.reasonUsesPermitDetails &&
    appointment.permitType === "dias" &&
    appointment.permitStartDate &&
    appointment.permitEndDate
  ) {
    for (const date of enumerateDateRange(
      appointment.permitStartDate,
      appointment.permitEndDate,
    )) {
      events.push(
        buildEvent(appointment, {
          date,
          startHour: 0,
          startMinute: 0,
          endHour: 23,
          endMinute: 59,
          timeLabel: "Todo el día",
          executive: appointment.assignedExecutive || "Sin ejecutivo",
          vehicleNumber: appointment.vehicleNumber,
          driverName: appointment.driverName,
          reasonLabel: appointment.appointmentReasonLabel,
          status: appointment.status,
          sortKey: 0,
        }),
      );
    }
  }

  return events;
}

export function collectCalendarEvents(appointments: Appointment[]) {
  return appointments
    .flatMap(getAppointmentCalendarEvents)
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }

      if (left.sortKey !== right.sortKey) {
        return left.sortKey - right.sortKey;
      }

      return left.executive.localeCompare(right.executive, "es");
    });
}

export function getMonthMatrix(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = [];

  for (let index = 0; index < startOffset; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toIsoDate(new Date(year, month, day)));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export function formatMonthYear(year: number, month: number) {
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1));
}

export function formatLongDate(dateValue: string) {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateValue}T12:00:00`));
}

export function formatShortWeekday(dateValue: string) {
  const day = new Date(`${dateValue}T12:00:00`).getDay();
  return weekdayLabels[day] ?? "";
}

export function getTodayIsoDate() {
  return toIsoDate(new Date());
}

export function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month + delta, 1);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
  };
}

export function shiftDate(dateValue: string, deltaDays: number) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return toIsoDate(date);
}

export function groupEventsByExecutive(events: AppointmentCalendarEvent[]) {
  const groups = new Map<string, AppointmentCalendarEvent[]>();

  for (const event of events) {
    const currentEvents = groups.get(event.executive) ?? [];
    currentEvents.push(event);
    groups.set(event.executive, currentEvents);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "es"))
    .map(([executive, executiveEvents]) => ({
      executive,
      events: executiveEvents.sort((left, right) => left.sortKey - right.sortKey),
    }));
}
