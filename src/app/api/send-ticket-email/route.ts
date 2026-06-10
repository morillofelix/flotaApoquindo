import {
  type AppointmentEmailPayload,
  appointmentReasonUsesPermitDetails,
  appointmentReasonUsesDateRange,
  getAppointmentTicketLabel,
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
    typeof payload.ticketNumber === "number" &&
    typeof payload.driverName === "string" &&
    typeof payload.vehicleNumber === "string" &&
    typeof payload.appointmentDate === "string" &&
    typeof payload.appointmentReason === "string" &&
    (payload.vacationStartDate === undefined ||
      typeof payload.vacationStartDate === "string") &&
    (payload.vacationEndDate === undefined ||
      typeof payload.vacationEndDate === "string") &&
    (payload.permitType === undefined || typeof payload.permitType === "string") &&
    (payload.permitStartDate === undefined ||
      typeof payload.permitStartDate === "string") &&
    (payload.permitEndDate === undefined ||
      typeof payload.permitEndDate === "string") &&
    (payload.permitDate === undefined ||
      typeof payload.permitDate === "string") &&
    (payload.permitStartTime === undefined ||
      typeof payload.permitStartTime === "string") &&
    (payload.permitEndTime === undefined ||
      typeof payload.permitEndTime === "string") &&
    typeof payload.email === "string" &&
    typeof payload.phone === "string" &&
    typeof payload.createdAt === "string"
  );
}

function getPermitDetail(appointment: AppointmentEmailPayload) {
  if (!appointmentReasonUsesPermitDetails(appointment.appointmentReason)) {
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
  const appointmentDate = escapeHtml(formatDate(appointment.appointmentDate));
  const appointmentReason = escapeHtml(
    getPermissionReasonLabel(appointment.appointmentReason),
  );
  const appointmentDateRange =
    appointmentReasonUsesDateRange(appointment.appointmentReason) &&
    appointment.vacationStartDate &&
    appointment.vacationEndDate
      ? `<p><strong>Rango de fechas:</strong> ${escapeHtml(
          formatDate(appointment.vacationStartDate),
        )} al ${escapeHtml(formatDate(appointment.vacationEndDate))}</p>`
      : "";
  const permitDetail = getPermitDetail(appointment)
    ? `<p><strong>Detalle permiso:</strong> ${escapeHtml(
        getPermitDetail(appointment),
      )}</p>`
    : "";

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
      <p><strong>Fecha requerida:</strong> ${appointmentDate}</p>
      <p><strong>Motivo:</strong> ${appointmentReason}</p>
      ${appointmentDateRange}
      ${permitDetail}
      <p style="margin-top: 20px;">Guarda este número de ticket para cualquier consulta o seguimiento.</p>
      <p style="color: #53657a; font-size: 13px;">Este correo fue generado automáticamente por el sistema de agendamientos de Transportes Apoquindo.</p>
    </div>
  `;
}

function createEmailText(appointment: AppointmentEmailPayload) {
  const lines = [
    `Hola ${appointment.driverName},`,
    "",
    "Hemos recibido tu requerimiento. Será revisado y atendido por el equipo correspondiente.",
    `Número de ticket: ${getAppointmentTicketLabel(appointment)}`,
    "",
    `Conductor: ${appointment.driverName}`,
    `Móvil: ${appointment.vehicleNumber}`,
    `Fecha requerida: ${formatDate(appointment.appointmentDate)}`,
    `Motivo: ${getPermissionReasonLabel(appointment.appointmentReason)}`,
  ];

  if (
    appointmentReasonUsesDateRange(appointment.appointmentReason) &&
    appointment.vacationStartDate &&
    appointment.vacationEndDate
  ) {
    lines.push(
      `Rango de fechas: ${formatDate(appointment.vacationStartDate)} al ${formatDate(
        appointment.vacationEndDate,
      )}`,
    );
  }

  const permitDetail = getPermitDetail(appointment);

  if (permitDetail) {
    lines.push(`Detalle permiso: ${permitDetail}`);
  }

  lines.push(
    "",
    "Guarda este número de ticket para cualquier consulta o seguimiento.",
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
      subject: `Solicitud recibida - Ticket ${getAppointmentTicketLabel(body)}`,
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
