import {
  type Appointment,
  defaultExecutives,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";
import nodemailer from "nodemailer";

const inviteStartHour = 9;
const inviteDurationMinutes = 30;
const calendarTimezone = "America/Santiago";

type CalendarCancelPayload = Pick<
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
  | "assignedExecutive"
  | "status"
>;

function isCalendarCancelPayload(value: unknown): value is CalendarCancelPayload {
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
    typeof payload.assignedExecutive === "string" &&
    payload.assignedExecutive.length > 0 &&
    payload.status === "cancelado"
  );
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatCalendarDateTime(dateValue: string, hour: number, minute: number) {
  const [year = "", month = "", day = ""] = dateValue.split("-");
  return `${year}${month}${day}T${hour.toString().padStart(2, "0")}${minute
    .toString()
    .padStart(2, "0")}00`;
}

function formatUtcDateTime(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function getInviteEndTime() {
  const endDate = new Date(2026, 0, 1, inviteStartHour, inviteDurationMinutes);
  return {
    hour: endDate.getHours(),
    minute: endDate.getMinutes(),
  };
}

function createInviteDescription(appointment: CalendarCancelPayload) {
  return [
    `Ticket: ${getAppointmentTicketLabel(appointment)}`,
    `Conductor: ${appointment.driverName}`,
    `Móvil: ${appointment.vehicleNumber}`,
    `Motivo: ${appointment.appointmentReasonLabel}`,
    `Fecha requerida: ${formatDisplayDate(appointment.appointmentDate)}`,
    `Correo solicitante: ${appointment.email}`,
    `Teléfono: ${appointment.phone}`,
  ].join("\n");
}

function createCalendarCancel(
  appointment: CalendarCancelPayload,
  executiveEmail: string,
  emailFrom: string,
) {
  const endTime = getInviteEndTime();
  const startDateTime = formatCalendarDateTime(
    appointment.appointmentDate,
    inviteStartHour,
    0,
  );
  const endDateTime = formatCalendarDateTime(
    appointment.appointmentDate,
    endTime.hour,
    endTime.minute,
  );
  const subject = `Cita cancelada - Ticket ${getAppointmentTicketLabel(appointment)}`;
  const description = createInviteDescription(appointment);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Transportes Apoquindo//Agendamientos//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:CANCEL",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@transportesapoquindo.cl`,
    `DTSTAMP:${formatUtcDateTime(new Date())}`,
    `DTSTART;TZID=${calendarTimezone}:${startDateTime}`,
    `DTEND;TZID=${calendarTimezone}:${endDateTime}`,
    `SUMMARY:${escapeText(subject)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText("Transportes Apoquindo")}`,
    `ORGANIZER;CN=${escapeText("Transportes Apoquindo")}:mailto:${emailFrom}`,
    `ATTENDEE;CN=${escapeText(
      appointment.assignedExecutive,
    )};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${executiveEmail}`,
    "STATUS:CANCELLED",
    "SEQUENCE:1",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function createEmailHtml(appointment: CalendarCancelPayload) {
  return `
    <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6;">
      <h1 style="margin: 0 0 12px;">Cita cancelada</h1>
      <p>Hola ${escapeHtml(appointment.assignedExecutive)},</p>
      <p>La cita asociada a la siguiente solicitud ha sido cancelada.</p>
      <hr style="border: 0; border-top: 1px solid #d8e2ef; margin: 20px 0;" />
      <p><strong>Ticket:</strong> ${escapeHtml(getAppointmentTicketLabel(appointment))}</p>
      <p><strong>Conductor:</strong> ${escapeHtml(appointment.driverName)}</p>
      <p><strong>Móvil:</strong> ${escapeHtml(appointment.vehicleNumber)}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(formatDisplayDate(appointment.appointmentDate))}</p>
      <p><strong>Motivo:</strong> ${escapeHtml(appointment.appointmentReasonLabel)}</p>
      <p style="margin-top: 20px;">La cancelación de calendario viene adjunta para Outlook.</p>
    </div>
  `;
}

function createEmailText(appointment: CalendarCancelPayload) {
  return [
    `Hola ${appointment.assignedExecutive},`,
    "",
    "La cita asociada a la siguiente solicitud ha sido cancelada.",
    "",
    createInviteDescription(appointment),
    "",
    "La cancelación de calendario viene adjunta para Outlook.",
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

  if (!isCalendarCancelPayload(body)) {
    return NextResponse.json(
      { message: "Datos de cancelación incompletos." },
      { status: 400 },
    );
  }

  await prisma.executive.createMany({
    data: defaultExecutives,
    skipDuplicates: true,
  });
  const executive = await prisma.executive.findUnique({
    where: { name: body.assignedExecutive },
  });
  const executiveEmail = executive?.isActive ? executive.email : "";

  if (!executiveEmail) {
    return NextResponse.json(
      { message: "El ejecutivo no tiene correo configurado." },
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
  const calendarCancel = createCalendarCancel(body, executiveEmail, emailFrom);

  try {
    const result = await transporter.sendMail({
      from: emailFrom,
      to: executiveEmail,
      subject: `Cita cancelada - Ticket ${getAppointmentTicketLabel(body)}`,
      html: createEmailHtml(body),
      text: createEmailText(body),
      icalEvent: {
        filename: `cancelacion-${getAppointmentTicketLabel(body)}.ics`,
        method: "CANCEL",
        content: calendarCancel,
      },
    });

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch {
    return NextResponse.json(
      { message: "No se pudo enviar la cancelación al ejecutivo." },
      { status: 502 },
    );
  }
}
