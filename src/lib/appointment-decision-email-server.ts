import {
  type Appointment,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import { getDriverPwaEmailBlock } from "@/lib/driver-pwa-email-block";
import {
  createNotificaTransporter,
  getNotificaSmtpConfig,
} from "@/lib/notifica-smtp";

export type DecisionEmailPayload = Pick<
  Appointment,
  | "id"
  | "ticketNumber"
  | "driverName"
  | "vehicleNumber"
  | "appointmentDate"
  | "appointmentReason"
  | "appointmentReasonLabel"
  | "reasonUsesDateRange"
  | "reasonUsesPermitDetails"
  | "reasonUsesDaySwap"
  | "vacationStartDate"
  | "vacationEndDate"
  | "permitType"
  | "permitStartDate"
  | "permitEndDate"
  | "permitDate"
  | "permitStartTime"
  | "permitEndTime"
  | "swapFromDate"
  | "swapToDate"
  | "observation"
  | "email"
  | "phone"
  | "status"
  | "rejectionMessage"
>;

export function isDecisionEmailPayload(
  value: unknown,
): value is DecisionEmailPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.id === "string" &&
    typeof payload.ticketNumber === "number" &&
    typeof payload.driverName === "string" &&
    typeof payload.vehicleNumber === "string" &&
    typeof payload.appointmentDate === "string" &&
    typeof payload.appointmentReason === "string" &&
    typeof payload.appointmentReasonLabel === "string" &&
    typeof payload.reasonUsesDateRange === "boolean" &&
    typeof payload.reasonUsesPermitDetails === "boolean" &&
    typeof payload.reasonUsesDaySwap === "boolean" &&
    typeof payload.vacationStartDate === "string" &&
    typeof payload.vacationEndDate === "string" &&
    typeof payload.permitType === "string" &&
    typeof payload.permitStartDate === "string" &&
    typeof payload.permitEndDate === "string" &&
    typeof payload.permitDate === "string" &&
    typeof payload.permitStartTime === "string" &&
    typeof payload.permitEndTime === "string" &&
    typeof payload.swapFromDate === "string" &&
    typeof payload.swapToDate === "string" &&
    typeof payload.email === "string" &&
    typeof payload.phone === "string" &&
    (payload.rejectionMessage === undefined ||
      typeof payload.rejectionMessage === "string") &&
    (payload.observation === undefined ||
      typeof payload.observation === "string") &&
    (payload.status === "aprobado" || payload.status === "rechazado") &&
    (payload.reasonUsesDateRange ||
      payload.reasonUsesPermitDetails ||
      payload.reasonUsesDaySwap)
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getDateRange(appointment: DecisionEmailPayload) {
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

function getPermitDetail(appointment: DecisionEmailPayload) {
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

function getDaySwapDetail(appointment: DecisionEmailPayload) {
  if (
    !appointment.reasonUsesDaySwap ||
    !appointment.swapFromDate ||
    !appointment.swapToDate
  ) {
    return "";
  }

  return `Cambia el ${formatDate(appointment.swapFromDate)} por el ${formatDate(
    appointment.swapToDate,
  )}`;
}

function createEmailHtml(appointment: DecisionEmailPayload) {
  const driverName = escapeHtml(appointment.driverName);
  const ticketId = escapeHtml(getAppointmentTicketLabel(appointment));
  const reason = escapeHtml(appointment.appointmentReasonLabel);
  const dateRange = getDateRange(appointment);
  const permitDetail = getPermitDetail(appointment);
  const daySwapDetail = getDaySwapDetail(appointment);
  const rejectionMessage = appointment.rejectionMessage?.trim() ?? "";
  const isApproved = appointment.status === "aprobado";
  const title = isApproved ? "Solicitud aprobada" : "Solicitud rechazada";
  const message = isApproved
    ? "Su solicitud ha sido aprobada."
    : "Su solicitud fue rechazada.";

  return `
    <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6;">
      <h1 style="margin: 0 0 12px;">${title}</h1>
      <p>Hola ${driverName},</p>
      <p>${message}</p>
      <p style="font-size: 18px; margin: 18px 0;">
        <strong>Número de ticket:</strong> ${ticketId}
      </p>
      <hr style="border: 0; border-top: 1px solid #d8e2ef; margin: 20px 0;" />
      <p><strong>Conductor:</strong> ${driverName}</p>
      <p><strong>Móvil:</strong> ${escapeHtml(appointment.vehicleNumber)}</p>
      <p><strong>Motivo:</strong> ${reason}</p>
      ${
        appointment.observation?.trim()
          ? `<p><strong>Observación:</strong> ${escapeHtml(appointment.observation.trim())}</p>`
          : ""
      }
      ${dateRange ? `<p><strong>Rango de fechas:</strong> ${escapeHtml(dateRange)}</p>` : ""}
      ${permitDetail ? `<p><strong>Detalle permiso:</strong> ${escapeHtml(permitDetail)}</p>` : ""}
      ${daySwapDetail ? `<p><strong>Cambio de día:</strong> ${escapeHtml(daySwapDetail)}</p>` : ""}
      ${
        !isApproved && rejectionMessage
          ? `<p><strong>Motivo del rechazo:</strong> ${escapeHtml(rejectionMessage)}</p>`
          : ""
      }
      <p style="margin-top: 20px;">Guarde este correo como respaldo de la aprobación.</p>
      ${getDriverPwaEmailBlock().html}
      <p style="color: #53657a; font-size: 13px;">Este correo fue generado automáticamente por el sistema de agendamientos de Transportes Apoquindo.</p>
    </div>
  `;
}

function createEmailText(appointment: DecisionEmailPayload) {
  const isApproved = appointment.status === "aprobado";
  const lines = [
    `Hola ${appointment.driverName},`,
    "",
    isApproved ? "Su solicitud ha sido aprobada." : "Su solicitud fue rechazada.",
    `Número de ticket: ${getAppointmentTicketLabel(appointment)}`,
    "",
    `Conductor: ${appointment.driverName}`,
    `Móvil: ${appointment.vehicleNumber}`,
    `Motivo: ${appointment.appointmentReasonLabel}`,
  ];
  const dateRange = getDateRange(appointment);
  const permitDetail = getPermitDetail(appointment);
  const daySwapDetail = getDaySwapDetail(appointment);
  const rejectionMessage = appointment.rejectionMessage?.trim() ?? "";
  const observation = appointment.observation?.trim() ?? "";

  if (observation) {
    lines.push(`Observación: ${observation}`);
  }

  if (dateRange) {
    lines.push(`Rango de fechas: ${dateRange}`);
  }

  if (permitDetail) {
    lines.push(`Detalle permiso: ${permitDetail}`);
  }

  if (daySwapDetail) {
    lines.push(`Cambio de día: ${daySwapDetail}`);
  }

  if (!isApproved && rejectionMessage) {
    lines.push(`Motivo del rechazo: ${rejectionMessage}`);
  }

  lines.push(
    "",
    "Guarde este correo como respaldo de la aprobación.",
    "",
    getDriverPwaEmailBlock().text,
    "",
    "Este correo fue generado automáticamente por el sistema de agendamientos de Transportes Apoquindo.",
  );

  return lines.join("\n");
}

export async function sendDecisionEmailServer(appointment: DecisionEmailPayload) {
  const smtp = getNotificaSmtpConfig();

  if (!smtp) {
    throw new Error("Servicio de correo no configurado.");
  }

  if (!appointment.email.trim()) {
    throw new Error("La solicitud no tiene correo del solicitante.");
  }

  const transporter = createNotificaTransporter();

  return transporter.sendMail({
    from: smtp.from,
    to: appointment.email.trim(),
    subject: `${
      appointment.status === "aprobado" ? "Solicitud aprobada" : "Solicitud rechazada"
    } - Ticket ${getAppointmentTicketLabel(appointment)}`,
    html: createEmailHtml(appointment),
    text: createEmailText(appointment),
  });
}
