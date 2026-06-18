import {
  type Appointment,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import { NextResponse, type NextRequest } from "next/server";
import nodemailer from "nodemailer";

type CancellationEmailPayload = Pick<
  Appointment,
  | "id"
  | "ticketNumber"
  | "driverName"
  | "vehicleNumber"
  | "appointmentDate"
  | "appointmentReasonLabel"
  | "reasonAllowsExecutiveAssignment"
  | "email"
  | "phone"
  | "status"
>;

function isCancellationEmailPayload(
  value: unknown,
): value is CancellationEmailPayload {
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
    payload.reasonAllowsExecutiveAssignment === true &&
    typeof payload.email === "string" &&
    typeof payload.phone === "string" &&
    payload.status === "cancelado"
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

function createEmailHtml(appointment: CancellationEmailPayload) {
  const driverName = escapeHtml(appointment.driverName);
  const ticketId = escapeHtml(getAppointmentTicketLabel(appointment));

  return `
    <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6;">
      <h1 style="margin: 0 0 12px;">Cita cancelada</h1>
      <p>Hola ${driverName},</p>
      <p>Su solicitud agendada ha sido cancelada.</p>
      <p style="font-size: 18px; margin: 18px 0;">
        <strong>Número de ticket:</strong> ${ticketId}
      </p>
      <hr style="border: 0; border-top: 1px solid #d8e2ef; margin: 20px 0;" />
      <p><strong>Conductor:</strong> ${driverName}</p>
      <p><strong>Móvil:</strong> ${escapeHtml(appointment.vehicleNumber)}</p>
      <p><strong>Fecha requerida:</strong> ${escapeHtml(formatDate(appointment.appointmentDate))}</p>
      <p><strong>Motivo:</strong> ${escapeHtml(appointment.appointmentReasonLabel)}</p>
      <p style="margin-top: 20px;">Si necesita una nueva cita, puede ingresar una nueva solicitud.</p>
      <p style="color: #53657a; font-size: 13px;">Este correo fue generado automáticamente por el sistema de agendamientos de Transportes Apoquindo.</p>
    </div>
  `;
}

function createEmailText(appointment: CancellationEmailPayload) {
  return [
    `Hola ${appointment.driverName},`,
    "",
    "Su solicitud agendada ha sido cancelada.",
    `Número de ticket: ${getAppointmentTicketLabel(appointment)}`,
    "",
    `Conductor: ${appointment.driverName}`,
    `Móvil: ${appointment.vehicleNumber}`,
    `Fecha requerida: ${formatDate(appointment.appointmentDate)}`,
    `Motivo: ${appointment.appointmentReasonLabel}`,
    "",
    "Si necesita una nueva cita, puede ingresar una nueva solicitud.",
    "Este correo fue generado automáticamente por el sistema de agendamientos de Transportes Apoquindo.",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const emailFrom = process.env.EMAIL_FROM;

  if (!smtpHost || !smtpUser || !smtpPassword || !emailFrom) {
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

  if (!isCancellationEmailPayload(body)) {
    return NextResponse.json(
      { message: "Datos de cancelación incompletos." },
      { status: 400 },
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  try {
    const result = await transporter.sendMail({
      from: emailFrom,
      to: body.email,
      subject: `Cita cancelada - Ticket ${getAppointmentTicketLabel(body)}`,
      html: createEmailHtml(body),
      text: createEmailText(body),
    });

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch {
    return NextResponse.json(
      { message: "No se pudo enviar el correo de cancelación." },
      { status: 502 },
    );
  }
}
