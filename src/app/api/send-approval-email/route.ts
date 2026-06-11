import {
  type Appointment,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import { NextResponse, type NextRequest } from "next/server";
import nodemailer from "nodemailer";

type ApprovalEmailPayload = Pick<
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
  | "vacationStartDate"
  | "vacationEndDate"
  | "permitType"
  | "permitStartDate"
  | "permitEndDate"
  | "permitDate"
  | "permitStartTime"
  | "permitEndTime"
  | "email"
  | "phone"
  | "status"
>;

function isApprovalEmailPayload(value: unknown): value is ApprovalEmailPayload {
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
    typeof payload.vacationStartDate === "string" &&
    typeof payload.vacationEndDate === "string" &&
    typeof payload.permitType === "string" &&
    typeof payload.permitStartDate === "string" &&
    typeof payload.permitEndDate === "string" &&
    typeof payload.permitDate === "string" &&
    typeof payload.permitStartTime === "string" &&
    typeof payload.permitEndTime === "string" &&
    typeof payload.email === "string" &&
    typeof payload.phone === "string" &&
    (payload.status === "aprobado" || payload.status === "rechazado") &&
    (payload.reasonUsesDateRange || payload.reasonUsesPermitDetails)
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

function getDateRange(appointment: ApprovalEmailPayload) {
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

function getPermitDetail(appointment: ApprovalEmailPayload) {
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

function createEmailHtml(appointment: ApprovalEmailPayload) {
  const driverName = escapeHtml(appointment.driverName);
  const ticketId = escapeHtml(getAppointmentTicketLabel(appointment));
  const reason = escapeHtml(appointment.appointmentReasonLabel);
  const dateRange = getDateRange(appointment);
  const permitDetail = getPermitDetail(appointment);
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
      ${dateRange ? `<p><strong>Rango de fechas:</strong> ${escapeHtml(dateRange)}</p>` : ""}
      ${permitDetail ? `<p><strong>Detalle permiso:</strong> ${escapeHtml(permitDetail)}</p>` : ""}
      <p style="margin-top: 20px;">Guarde este correo como respaldo de la aprobación.</p>
      <p style="color: #53657a; font-size: 13px;">Este correo fue generado automáticamente por el sistema de agendamientos de Transportes Apoquindo.</p>
    </div>
  `;
}

function createEmailText(appointment: ApprovalEmailPayload) {
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

  if (dateRange) {
    lines.push(`Rango de fechas: ${dateRange}`);
  }

  if (permitDetail) {
    lines.push(`Detalle permiso: ${permitDetail}`);
  }

  lines.push(
    "",
    "Guarde este correo como respaldo de la aprobación.",
    "Este correo fue generado automáticamente por el sistema de agendamientos de Transportes Apoquindo.",
  );

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

  if (!isApprovalEmailPayload(body)) {
    return NextResponse.json(
      { message: "Datos de aprobación incompletos." },
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
      subject: `${
        body.status === "aprobado" ? "Solicitud aprobada" : "Solicitud rechazada"
      } - Ticket ${getAppointmentTicketLabel(body)}`,
      html: createEmailHtml(body),
      text: createEmailText(body),
    });

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch {
    return NextResponse.json(
      { message: "No se pudo enviar el correo de aprobación." },
      { status: 502 },
    );
  }
}
