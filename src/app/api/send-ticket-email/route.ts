import {
  type AppointmentEmailPayload,
  getPermissionReasonLabel,
} from "@/lib/appointments";
import { NextResponse, type NextRequest } from "next/server";
import nodemailer from "nodemailer";

function isAppointmentEmailPayload(value: unknown): value is AppointmentEmailPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.id === "string" &&
    typeof payload.driverName === "string" &&
    typeof payload.vehicleNumber === "string" &&
    typeof payload.appointmentDate === "string" &&
    typeof payload.appointmentReason === "string" &&
    (payload.vacationStartDate === undefined ||
      typeof payload.vacationStartDate === "string") &&
    (payload.vacationEndDate === undefined ||
      typeof payload.vacationEndDate === "string") &&
    typeof payload.email === "string" &&
    typeof payload.phone === "string" &&
    typeof payload.createdAt === "string"
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

function createEmailHtml(appointment: AppointmentEmailPayload) {
  const driverName = escapeHtml(appointment.driverName);
  const ticketId = escapeHtml(appointment.id);
  const vehicleNumber = escapeHtml(appointment.vehicleNumber);
  const appointmentDate = escapeHtml(formatDate(appointment.appointmentDate));
  const appointmentReason = escapeHtml(
    getPermissionReasonLabel(appointment.appointmentReason),
  );
  const vacationDateRange =
    appointment.appointmentReason === "vacaciones" &&
    appointment.vacationStartDate &&
    appointment.vacationEndDate
      ? `<p><strong>Vacaciones:</strong> ${escapeHtml(
          formatDate(appointment.vacationStartDate),
        )} al ${escapeHtml(formatDate(appointment.vacationEndDate))}</p>`
      : "";

  return `
    <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6;">
      <h1 style="margin: 0 0 12px;">Solicitud recibida</h1>
      <p>Hola ${driverName},</p>
      <p>Hemos recibido tu solicitud de cita correctamente.</p>
      <p style="font-size: 18px;">
        <strong>Número de ticket:</strong> ${ticketId}
      </p>
      <hr style="border: 0; border-top: 1px solid #d8e2ef; margin: 20px 0;" />
      <p><strong>Móvil:</strong> ${vehicleNumber}</p>
      <p><strong>Fecha requerida:</strong> ${appointmentDate}</p>
      <p><strong>Motivo:</strong> ${appointmentReason}</p>
      ${vacationDateRange}
      <p>Guarda este número para hacer seguimiento de tu solicitud.</p>
    </div>
  `;
}

function createEmailText(appointment: AppointmentEmailPayload) {
  const lines = [
    `Hola ${appointment.driverName},`,
    "",
    "Hemos recibido tu solicitud de cita correctamente.",
    `Número de ticket: ${appointment.id}`,
    "",
    `Móvil: ${appointment.vehicleNumber}`,
    `Fecha requerida: ${formatDate(appointment.appointmentDate)}`,
    `Motivo: ${getPermissionReasonLabel(appointment.appointmentReason)}`,
  ];

  if (
    appointment.appointmentReason === "vacaciones" &&
    appointment.vacationStartDate &&
    appointment.vacationEndDate
  ) {
    lines.push(
      `Vacaciones: ${formatDate(appointment.vacationStartDate)} al ${formatDate(
        appointment.vacationEndDate,
      )}`,
    );
  }

  lines.push("", "Guarda este número para hacer seguimiento de tu solicitud.");

  return lines.join("\n");
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

  if (!isAppointmentEmailPayload(body)) {
    return NextResponse.json(
      { message: "Datos de solicitud incompletos." },
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
      subject: `Solicitud recibida - Ticket ${body.id}`,
      html: createEmailHtml(body),
      text: createEmailText(body),
    });

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch {
    return NextResponse.json(
      { message: "No se pudo enviar el correo." },
      { status: 502 },
    );
  }
}
