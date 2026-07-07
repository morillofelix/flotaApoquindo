import {
  type Appointment,
  type AppointmentStatus,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import { adminFetchInit } from "@/lib/admin-fetch";

export const statusLabels: Record<AppointmentStatus, string> = {
  pendiente: "Pendiente",
  revisado: "Agendado",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

export const statusStyles: Record<AppointmentStatus, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-800",
  revisado: "border-green-200 bg-green-50 text-green-800",
  aprobado: "border-blue-200 bg-blue-50 text-blue-800",
  rechazado: "border-red-200 bg-red-50 text-red-800",
  cancelado: "border-slate-300 bg-slate-100 text-slate-700",
};

export type DateFilter =
  | "todos"
  | "hoy"
  | "ultimos7"
  | "ultimos15"
  | "ultimos30"
  | "personalizado";

export type EmailNotice =
  | {
      status: "sending" | "sent";
      message: string;
    }
  | null;

export function formatDate(value: string) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getAppointmentDateRange(appointment: Appointment) {
  if (
    !appointment.reasonUsesDateRange ||
    !appointment.vacationStartDate ||
    !appointment.vacationEndDate
  ) {
    return "";
  }

  return `${formatDate(appointment.vacationStartDate)} al ${formatDate(
    appointment.vacationEndDate,
  )}`;
}

export function getPermitDetail(appointment: Appointment) {
  if (!appointment.reasonUsesPermitDetails) {
    return "";
  }

  if (
    appointment.permitType === "dias" &&
    appointment.permitStartDate &&
    appointment.permitEndDate
  ) {
    return `Por día: ${formatDate(appointment.permitStartDate)} al ${formatDate(
      appointment.permitEndDate,
    )}`;
  }

  if (
    appointment.permitType === "horas" &&
    appointment.permitDate &&
    appointment.permitStartTime &&
    appointment.permitEndTime
  ) {
    return `Por horas: ${formatDate(appointment.permitDate)}, ${
      appointment.permitStartTime
    } a ${appointment.permitEndTime}`;
  }

  return "";
}

export function getRequestDateDetail(appointment: Appointment) {
  return getPermitDetail(appointment) || getAppointmentDateRange(appointment);
}

function parseDateOnly(value: string) {
  if (!value) {
    return null;
  }

  const date = value.includes("T")
    ? new Date(value)
    : new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getTodayDateOnly() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function getDateDaysAgo(days: number) {
  const date = getTodayDateOnly();
  date.setDate(date.getDate() - (days - 1));
  return date;
}

export function isWithinDateFilter(
  dateValue: string,
  dateFilter: DateFilter,
  customStartDate: string,
  customEndDate: string,
) {
  if (dateFilter === "todos") {
    return true;
  }

  const date = parseDateOnly(dateValue);

  if (!date) {
    return false;
  }

  if (dateFilter === "hoy") {
    return date.getTime() === getTodayDateOnly().getTime();
  }

  if (dateFilter === "personalizado") {
    const startDate = parseDateOnly(customStartDate);
    const endDate = parseDateOnly(customEndDate);

    if (startDate && date < startDate) {
      return false;
    }

    if (endDate && date > endDate) {
      return false;
    }

    return true;
  }

  const daysByFilter: Record<
    Exclude<DateFilter, "todos" | "hoy" | "personalizado">,
    number
  > = {
    ultimos7: 7,
    ultimos15: 15,
    ultimos30: 30,
  };
  const startDate = getDateDaysAgo(daysByFilter[dateFilter]);
  const endDate = getTodayDateOnly();

  return date >= startDate && date <= endDate;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createExcelTable(appointments: Appointment[]) {
  const rows = appointments
    .map((appointment) => {
      const dateFrom =
        appointment.permitType === "dias"
          ? appointment.permitStartDate
          : appointment.vacationStartDate;
      const dateTo =
        appointment.permitType === "dias"
          ? appointment.permitEndDate
          : appointment.vacationEndDate;
      const permitTypeLabel =
        appointment.permitType === "dias"
          ? "Por día"
          : appointment.permitType === "horas"
            ? "Por horas"
            : "";

      return `
        <tr>
          <td>${escapeHtml(getAppointmentTicketLabel(appointment))}</td>
          <td>${escapeHtml(appointment.driverName)}</td>
          <td>${escapeHtml(appointment.vehicleNumber)}</td>
          <td>${escapeHtml(formatDate(appointment.appointmentDate))}</td>
          <td>${escapeHtml(appointment.appointmentReasonLabel)}</td>
          <td>${escapeHtml(appointment.permitDate || "No aplica")}</td>
          <td>${escapeHtml(permitTypeLabel || "No aplica")}</td>
          <td>${escapeHtml(dateFrom || "No aplica")}</td>
          <td>${escapeHtml(dateTo || "No aplica")}</td>
          <td>${escapeHtml(appointment.permitStartTime || "No aplica")}</td>
          <td>${escapeHtml(appointment.permitEndTime || "No aplica")}</td>
          <td>${escapeHtml(statusLabels[appointment.status])}</td>
          <td>${escapeHtml(appointment.email)}</td>
          <td>${escapeHtml(appointment.phone)}</td>
          <td>${escapeHtml(appointment.assignedExecutive || "Sin asignar")}</td>
          <td>${escapeHtml(formatCreatedAt(appointment.createdAt))}</td>
        </tr>`;
    })
    .join("");

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
      </head>
      <body>
        <table border="1">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Conductor</th>
              <th>Móvil</th>
              <th>Fecha requerida</th>
              <th>Motivo</th>
              <th>Fecha permiso</th>
              <th>Tipo permiso</th>
              <th>Fecha desde</th>
              <th>Fecha hasta</th>
              <th>Hora desde</th>
              <th>Hora hasta</th>
              <th>Estado</th>
              <th>Correo</th>
              <th>Teléfono</th>
              <th>Ejecutivo</th>
              <th>Fecha de registro</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>`;
}

export function downloadExcel(appointments: Appointment[], fileName: string) {
  const htmlTable = createExcelTable(appointments);
  const blob = new Blob([htmlTable], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function shouldSendCalendarInvite(appointment: Appointment) {
  return (
    appointment.status === "revisado" &&
    appointment.reasonAllowsExecutiveAssignment &&
    appointment.assignedExecutive !== ""
  );
}

export function appointmentAllowsExecutive(appointment: Appointment) {
  return appointment.reasonAllowsExecutiveAssignment;
}

export function shouldSendDecisionEmail(appointment: Appointment) {
  return (
    (appointment.status === "aprobado" || appointment.status === "rechazado") &&
    (appointment.reasonUsesDateRange || appointment.reasonUsesPermitDetails)
  );
}

export function shouldSendCancellationEmails(appointment: Appointment) {
  return (
    appointment.status === "cancelado" &&
    appointment.reasonAllowsExecutiveAssignment
  );
}

export async function sendCancellationToRequester(appointment: Appointment) {
  const response = await fetch("/api/send-cancellation-email", {
    ...adminFetchInit,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(appointment),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar el correo de cancelación al solicitante.");
  }
}

export async function sendCalendarCancelToExecutive(appointment: Appointment) {
  const response = await fetch("/api/send-calendar-cancel", {
    ...adminFetchInit,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(appointment),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar la cancelación de cita al ejecutivo.");
  }
}

export async function sendCalendarInvite(appointment: Appointment) {
  const response = await fetch("/api/send-calendar-invite", {
    ...adminFetchInit,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(appointment),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar la cita al ejecutivo.");
  }
}

export async function sendScheduledEmailToRequester(appointment: Appointment) {
  const response = await fetch("/api/send-scheduled-email", {
    ...adminFetchInit,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(appointment),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar el correo de cita al solicitante.");
  }
}

export async function sendExecutiveAssignmentEmails(appointment: Appointment) {
  await sendCalendarInvite(appointment);
  await sendScheduledEmailToRequester(appointment);
}

export async function sendCalendarRescheduleCancel(appointment: Appointment) {
  const response = await fetch("/api/send-calendar-cancel", {
    ...adminFetchInit,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...appointment, reschedule: true }),
  });

  if (!response.ok) {
    throw new Error("No se pudo cancelar la cita anterior del ejecutivo.");
  }
}

export async function sendCalendarRescheduleInvite(appointment: Appointment) {
  const response = await fetch("/api/send-calendar-invite", {
    ...adminFetchInit,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...appointment, reschedule: true }),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar la nueva cita al ejecutivo.");
  }
}

export async function sendDateChangeEmail(appointment: Appointment) {
  if (!appointment.dateChangeMessage.trim()) {
    return;
  }

  const response = await fetch("/api/send-date-change-email", {
    ...adminFetchInit,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: appointment.id,
      ticketNumber: appointment.ticketNumber,
      driverName: appointment.driverName,
      vehicleNumber: appointment.vehicleNumber,
      appointmentDate: appointment.appointmentDate,
      appointmentReasonLabel: appointment.appointmentReasonLabel,
      reasonAllowsExecutiveAssignment:
        appointment.reasonAllowsExecutiveAssignment,
      reasonUsesDateRange: appointment.reasonUsesDateRange,
      reasonUsesPermitDetails: appointment.reasonUsesPermitDetails,
      email: appointment.email,
      status: appointment.status,
      dateChangeMessage: appointment.dateChangeMessage,
      vacationStartDate: appointment.vacationStartDate,
      vacationEndDate: appointment.vacationEndDate,
      permitType: appointment.permitType,
      permitStartDate: appointment.permitStartDate,
      permitEndDate: appointment.permitEndDate,
      permitDate: appointment.permitDate,
      permitStartTime: appointment.permitStartTime,
      permitEndTime: appointment.permitEndTime,
    }),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar el correo de cambio de fecha.");
  }
}

export async function sendAppointmentDateChangeEmails(
  savedAppointment: Appointment,
  previousAppointment: Appointment,
  options: {
    requiresCalendarCancel: boolean;
    requiresCalendarInvite: boolean;
  },
) {
  if (options.requiresCalendarCancel) {
    await sendCalendarRescheduleCancel(previousAppointment);
  }

  if (options.requiresCalendarInvite) {
    await sendCalendarRescheduleInvite(savedAppointment);
  }

  await sendDateChangeEmail(savedAppointment);
}

export async function sendDecisionEmail(appointment: Appointment) {
  const response = await fetch("/api/send-approval-email", {
    ...adminFetchInit,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(appointment),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar el correo de respuesta.");
  }
}
