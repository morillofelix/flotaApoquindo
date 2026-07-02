import {
  type Appointment,
  type AppointmentStatus,
  type ExecutiveConfig,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import {
  formatClockTime,
  resolveAppointmentSchedule,
} from "@/lib/appointment-scheduling";
import { statusLabels } from "@/lib/agendamientos-appointments";

export type CalendarViewMode = "month" | "day";

export type CalendarEventKind = "executive" | "approval";

export type AppointmentCalendarEvent = {
  id: string;
  appointmentId: string;
  date: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  timeLabel: string;
  kind: CalendarEventKind;
  executive: string;
  vehicleNumber: string;
  driverName: string;
  reasonValue: string;
  reasonLabel: string;
  status: AppointmentStatus;
  calendarStatusLabel: string;
  ticketLabel: string;
  sortKey: number;
};

export type CalendarDayGroup = {
  key: string;
  title: string;
  kind: CalendarEventKind;
  events: AppointmentCalendarEvent[];
};

const HIDDEN_STATUSES = new Set<AppointmentStatus>(["cancelado", "rechazado"]);

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

function getCalendarStatusLabel(
  appointment: Appointment,
  kind: CalendarEventKind,
) {
  if (kind === "approval") {
    if (appointment.status === "aprobado") {
      return "Aprobada";
    }

    if (appointment.status === "pendiente") {
      return "Sin aprobar";
    }
  }

  return statusLabels[appointment.status] ?? appointment.status;
}

function buildEvent(
  appointment: Appointment,
  kind: CalendarEventKind,
  event: Omit<
    AppointmentCalendarEvent,
    | "id"
    | "appointmentId"
    | "ticketLabel"
    | "kind"
    | "calendarStatusLabel"
  >,
) {
  return {
    ...event,
    kind,
    calendarStatusLabel: getCalendarStatusLabel(appointment, kind),
    id: `${appointment.id}-${event.date}-${event.sortKey}-${kind}`,
    appointmentId: appointment.id,
    ticketLabel: getAppointmentTicketLabel(appointment),
  };
}

function pushApprovalDateRangeEvents(
  appointment: Appointment,
  events: AppointmentCalendarEvent[],
  startDate: string,
  endDate: string,
  timeLabel: string,
  sortKey: number,
) {
  for (const date of enumerateDateRange(startDate, endDate)) {
    events.push(
      buildEvent(appointment, "approval", {
        date,
        startHour: 0,
        startMinute: 0,
        endHour: 23,
        endMinute: 59,
        timeLabel,
        executive: "",
        vehicleNumber: appointment.vehicleNumber,
        driverName: appointment.driverName,
        reasonValue: appointment.appointmentReason,
        reasonLabel: appointment.appointmentReasonLabel,
        status: appointment.status,
        sortKey,
      }),
    );
  }
}

export function getAppointmentCalendarEvents(
  appointment: Appointment,
  executivesByName?: Map<string, ExecutiveConfig>,
): AppointmentCalendarEvent[] {
  if (HIDDEN_STATUSES.has(appointment.status)) {
    return [];
  }

  const events: AppointmentCalendarEvent[] = [];
  const isApprovalOnly = !appointment.reasonAllowsExecutiveAssignment;

  if (
    !isApprovalOnly &&
    appointment.reasonAllowsExecutiveAssignment &&
    appointment.assignedExecutive
  ) {
    const executive = executivesByName?.get(appointment.assignedExecutive);
    const schedule = resolveAppointmentSchedule({
      appointmentDate: appointment.appointmentDate,
      reasonAllowsExecutiveAssignment:
        appointment.reasonAllowsExecutiveAssignment,
      reasonUsesAppointmentDuration: appointment.reasonUsesAppointmentDuration,
      reasonAppointmentDurationMinutes:
        appointment.reasonAppointmentDurationMinutes,
      executiveLunchBreak: executive
        ? {
            lunchBreakEnabled: executive.lunchBreakEnabled,
            lunchBreakStart: executive.lunchBreakStart,
            lunchBreakEnd: executive.lunchBreakEnd,
          }
        : null,
    });

    if (schedule) {
      events.push(
        buildEvent(appointment, "executive", {
          date: appointment.appointmentDate,
          startHour: schedule.startHour,
          startMinute: schedule.startMinute,
          endHour: schedule.endHour,
          endMinute: schedule.endMinute,
          timeLabel: schedule.timeRangeLabel,
          executive: appointment.assignedExecutive,
          vehicleNumber: appointment.vehicleNumber,
          driverName: appointment.driverName,
          reasonValue: appointment.appointmentReason,
        reasonLabel: appointment.appointmentReasonLabel,
          status: appointment.status,
          sortKey: toSortKey(schedule.startHour, schedule.startMinute),
        }),
      );
    }

    return events;
  }

  if (!isApprovalOnly) {
    return events;
  }

  if (
    appointment.reasonUsesDateRange &&
    appointment.vacationStartDate &&
    appointment.vacationEndDate
  ) {
    pushApprovalDateRangeEvents(
      appointment,
      events,
      appointment.vacationStartDate,
      appointment.vacationEndDate,
      "",
      0,
    );
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
        buildEvent(appointment, "approval", {
          date: appointment.permitDate,
          startHour: start.hour,
          startMinute: start.minute,
          endHour: end.hour,
          endMinute: end.minute,
          timeLabel: `${formatClockTime(start.hour, start.minute)}-${formatClockTime(end.hour, end.minute)}`,
          executive: "",
          vehicleNumber: appointment.vehicleNumber,
          driverName: appointment.driverName,
          reasonValue: appointment.appointmentReason,
        reasonLabel: appointment.appointmentReasonLabel,
          status: appointment.status,
          sortKey: toSortKey(start.hour, start.minute),
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
    pushApprovalDateRangeEvents(
      appointment,
      events,
      appointment.permitStartDate,
      appointment.permitEndDate,
      "",
      0,
    );
  }

  return events;
}

export function collectCalendarEvents(
  appointments: Appointment[],
  executivesByName?: Map<string, ExecutiveConfig>,
) {
  return appointments
    .flatMap((appointment) =>
      getAppointmentCalendarEvents(appointment, executivesByName),
    )
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }

      if (left.kind !== right.kind) {
        return left.kind === "executive" ? -1 : 1;
      }

      if (left.sortKey !== right.sortKey) {
        return left.sortKey - right.sortKey;
      }

      const leftTitle =
        left.kind === "executive" ? left.executive : left.reasonLabel;
      const rightTitle =
        right.kind === "executive" ? right.executive : right.reasonLabel;

      return leftTitle.localeCompare(rightTitle, "es");
    });
}

export function groupCalendarDayEvents(events: AppointmentCalendarEvent[]) {
  const groups = new Map<string, CalendarDayGroup>();

  for (const event of events) {
    const key =
      event.kind === "executive"
        ? `executive:${event.executive}`
        : `approval:${event.reasonLabel}`;
    const title =
      event.kind === "executive" ? event.executive : event.reasonLabel;
    const currentGroup = groups.get(key);

    if (currentGroup) {
      currentGroup.events.push(event);
      continue;
    }

    groups.set(key, {
      key,
      title,
      kind: event.kind,
      events: [event],
    });
  }

  return [...groups.values()]
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "executive" ? -1 : 1;
      }

      return left.title.localeCompare(right.title, "es");
    })
    .map((group) => ({
      ...group,
      events: group.events.sort((left, right) => left.sortKey - right.sortKey),
    }));
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

/** @deprecated Use groupCalendarDayEvents */
export function groupEventsByExecutive(events: AppointmentCalendarEvent[]) {
  return groupCalendarDayEvents(events).map((group) => ({
    executive: group.title,
    events: group.events,
  }));
}
