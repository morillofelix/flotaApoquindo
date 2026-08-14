import {
  type AppointmentEmailPayload,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import {
  createNotificaTransporter,
  getNotificaSmtpConfig,
} from "@/lib/notifica-smtp";

function getPermitDetail(appointment: AppointmentEmailPayload) {
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function getRequiredDateLabel(appointment: AppointmentEmailPayload) {
  const permitDetail = getPermitDetail(appointment);

  if (permitDetail) {
    return permitDetail;
  }

  if (
    appointment.reasonUsesDateRange &&
    appointment.vacationStartDate &&
    appointment.vacationEndDate
  ) {
    return `${formatDate(appointment.vacationStartDate)} al ${formatDate(
      appointment.vacationEndDate,
    )}`;
  }

  return formatDate(appointment.appointmentDate);
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createEmailHtml(appointment: AppointmentEmailPayload) {
  const driverName = escapeHtml(appointment.driverName);
  const ticketId = escapeHtml(getAppointmentTicketLabel(appointment));
  const vehicleNumber = escapeHtml(appointment.vehicleNumber);
  const requiredDate = escapeHtml(getRequiredDateLabel(appointment));
  const registrationDate = escapeHtml(formatCreatedAt(appointment.createdAt));
  const appointmentReason = escapeHtml(appointment.appointmentReasonLabel);

  return `
    <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6;">
      <h1 style="margin: 0 0 12px;">Solicitud recibida correctamente</h1>
      <p>Hola ${driverName},</p>
      <p>Hemos recibido tu requerimiento. Será revisado y atendido por el equipo correspondiente.</p>
      <p style="font-size: 18px; margin: 18px 0;">
        <strong>Número de ticket:</strong> ${ticketId}
      </p>
      <hr style="border: 0; border-top: 1px solid #d8e2ef; margin: 20px 0;" />
      <p><strong>Conductor:</strong> ${driverName}</p>
      <p><strong>Móvil:</strong> ${vehicleNumber}</p>
      <p><strong>Fecha de registro:</strong> ${registrationDate}</p>
      <p><strong>Fecha requerida:</strong> ${requiredDate}</p>
      <p><strong>Motivo:</strong> ${appointmentReason}</p>
      <p style="margin-top: 20px;">Guarda este número de ticket para cualquier consulta o seguimiento.</p>
      <p style="color: #53657a; font-size: 13px;">Este correo fue generado automáticamente por el sistema de agendamientos de Transportes Apoquindo.</p>
    </div>
  `;
}

function createEmailText(appointment: AppointmentEmailPayload) {
  return [
    `Hola ${appointment.driverName},`,
    "",
    "Hemos recibido tu requerimiento. Será revisado y atendido por el equipo correspondiente.",
    `Número de ticket: ${getAppointmentTicketLabel(appointment)}`,
    "",
    `Conductor: ${appointment.driverName}`,
    `Móvil: ${appointment.vehicleNumber}`,
    `Fecha de registro: ${formatCreatedAt(appointment.createdAt)}`,
    `Fecha requerida: ${getRequiredDateLabel(appointment)}`,
    `Motivo: ${appointment.appointmentReasonLabel}`,
    "",
    "Guarda este número de ticket para cualquier consulta o seguimiento.",
    "Este correo fue generado automáticamente por el sistema de agendamientos de Transportes Apoquindo.",
  ].join("\n");
}

export async function sendAppointmentTicketEmail(
  appointment: AppointmentEmailPayload,
) {
  const smtp = getNotificaSmtpConfig();

  if (!smtp) {
    throw new Error("Servicio de correo no configurado.");
  }

  const transporter = createNotificaTransporter();

  return transporter.sendMail({
    from: smtp.from,
    to: appointment.email,
    subject: `Solicitud recibida - Ticket ${getAppointmentTicketLabel(appointment)}`,
    html: createEmailHtml(appointment),
    text: createEmailText(appointment),
  });
}
