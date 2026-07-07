import {
  type Appointment,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import { getRequestDateDetail } from "@/lib/agendamientos-appointments";
import {
  createNotificaTransporter,
  getNotificaSmtpConfig,
} from "@/lib/notifica-smtp";
import { requireAdminPermission } from "@/lib/admin-api-server";
import { NextResponse, type NextRequest } from "next/server";

type DateChangeEmailPayload = Pick<
  Appointment,
  | "id"
  | "ticketNumber"
  | "driverName"
  | "vehicleNumber"
  | "appointmentDate"
  | "appointmentReasonLabel"
  | "reasonAllowsExecutiveAssignment"
  | "reasonUsesDateRange"
  | "reasonUsesPermitDetails"
  | "email"
  | "status"
> & {
  dateChangeMessage: string;
};

function isDateChangeEmailPayload(
  value: unknown,
): value is DateChangeEmailPayload {
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
    typeof payload.appointmentReasonLabel === "string" &&
    typeof payload.reasonAllowsExecutiveAssignment === "boolean" &&
    typeof payload.reasonUsesDateRange === "boolean" &&
    typeof payload.reasonUsesPermitDetails === "boolean" &&
    typeof payload.email === "string" &&
    typeof payload.dateChangeMessage === "string" &&
    payload.dateChangeMessage.trim().length > 0 &&
    (payload.status === "pendiente" ||
      payload.status === "revisado" ||
      payload.status === "aprobado")
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createEmailHtml(appointment: DateChangeEmailPayload) {
  const detail = getRequestDateDetail(appointment as Appointment);

  return `
    <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6;">
      <h1 style="margin: 0 0 12px;">Actualización de fechas en tu solicitud</h1>
      <p>Hola ${escapeHtml(appointment.driverName)},</p>
      <p>Tu solicitud fue actualizada por el departamento de flota.</p>
      <p style="font-size: 18px; margin: 18px 0;">
        <strong>Número de ticket:</strong> ${escapeHtml(getAppointmentTicketLabel(appointment))}
      </p>
      <p><strong>Motivo:</strong> ${escapeHtml(appointment.appointmentReasonLabel)}</p>
      <p><strong>Detalle del cambio:</strong> ${escapeHtml(appointment.dateChangeMessage)}</p>
      ${detail ? `<p><strong>Fechas actuales:</strong> ${escapeHtml(detail)}</p>` : ""}
      ${appointment.reasonAllowsExecutiveAssignment ? `<p><strong>Fecha requerida:</strong> ${escapeHtml(appointment.appointmentDate)}</p>` : ""}
      <p style="margin-top: 20px;">Si tienes dudas, contacta al departamento de flota.</p>
    </div>
  `;
}

function createEmailText(appointment: DateChangeEmailPayload) {
  const detail = getRequestDateDetail(appointment as Appointment);
  const lines = [
    `Hola ${appointment.driverName},`,
    "",
    "Tu solicitud fue actualizada por el departamento de flota.",
    `Número de ticket: ${getAppointmentTicketLabel(appointment)}`,
    `Motivo: ${appointment.appointmentReasonLabel}`,
    `Detalle del cambio: ${appointment.dateChangeMessage}`,
  ];

  if (detail) {
    lines.push(`Fechas actuales: ${detail}`);
  }

  if (appointment.reasonAllowsExecutiveAssignment) {
    lines.push(`Fecha requerida: ${appointment.appointmentDate}`);
  }

  lines.push("", "Si tienes dudas, contacta al departamento de flota.");

  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

  if (unauthorized) {
    return unauthorized;
  }

  const smtp = getNotificaSmtpConfig();

  if (!smtp) {
    return NextResponse.json(
      { message: "Servicio de correo no configurado." },
      { status: 500 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  if (!isDateChangeEmailPayload(body)) {
    return NextResponse.json(
      { message: "Datos de cambio de fecha incompletos." },
      { status: 400 },
    );
  }

  const transporter = createNotificaTransporter();

  try {
    const result = await transporter.sendMail({
      from: smtp.from,
      to: body.email,
      subject: `Fechas actualizadas - Ticket ${getAppointmentTicketLabel(body)}`,
      html: createEmailHtml(body),
      text: createEmailText(body),
    });

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch {
    return NextResponse.json(
      { message: "No se pudo enviar el correo de cambio de fecha." },
      { status: 502 },
    );
  }
}
