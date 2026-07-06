import {
  type Appointment,
  defaultExecutives,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import {
  DEFAULT_APPOINTMENT_START_HOUR,
  DEFAULT_APPOINTMENT_START_MINUTE,
  resolveAppointmentSchedule,
  type ExecutiveLunchBreakConfig,
} from "@/lib/appointment-scheduling";
import { prisma } from "@/lib/prisma";
import {
  createNotificaTransporter,
  getNotificaSmtpConfig,
} from "@/lib/notifica-smtp";
import { NextResponse, type NextRequest } from "next/server";

const calendarTimezone = "America/Santiago";

type CalendarInvitePayload = Pick<
  Appointment,
  | "id"
  | "ticketNumber"
  | "driverName"
  | "vehicleNumber"
  | "appointmentDate"
  | "appointmentReason"
  | "appointmentReasonLabel"
  | "reasonAllowsExecutiveAssignment"
  | "reasonUsesAppointmentDuration"
  | "reasonAppointmentDurationMinutes"
  | "scheduledStartTime"
  | "scheduledEndTime"
  | "reasonUsesDateRange"
  | "vacationStartDate"
  | "vacationEndDate"
  | "email"
  | "phone"
  | "assignedExecutive"
  | "status"
>;

function isCalendarInvitePayload(value: unknown): value is CalendarInvitePayload {
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
    typeof payload.reasonAllowsExecutiveAssignment === "boolean" &&
    typeof payload.reasonUsesAppointmentDuration === "boolean" &&
    typeof payload.reasonAppointmentDurationMinutes === "number" &&
    typeof payload.reasonUsesDateRange === "boolean" &&
    typeof payload.vacationStartDate === "string" &&
    typeof payload.vacationEndDate === "string" &&
    typeof payload.email === "string" &&
    typeof payload.phone === "string" &&
    typeof payload.assignedExecutive === "string" &&
    payload.assignedExecutive.length > 0 &&
    (payload.status === "revisado" ||
      (payload.reschedule === true && payload.status === "aprobado"))
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

function getAppointmentSchedule(
  appointment: CalendarInvitePayload,
  executiveLunchBreak?: ExecutiveLunchBreakConfig | null,
) {
  return resolveAppointmentSchedule({
    appointmentDate: appointment.appointmentDate,
    reasonAllowsExecutiveAssignment: appointment.reasonAllowsExecutiveAssignment,
    reasonUsesAppointmentDuration: appointment.reasonUsesAppointmentDuration,
    reasonAppointmentDurationMinutes:
      appointment.reasonAppointmentDurationMinutes,
    scheduledStartTime: appointment.scheduledStartTime,
    scheduledEndTime: appointment.scheduledEndTime,
    startHour: DEFAULT_APPOINTMENT_START_HOUR,
    startMinute: DEFAULT_APPOINTMENT_START_MINUTE,
    executiveLunchBreak,
  });
}

function getAppointmentDateRange(appointment: CalendarInvitePayload) {
  if (
    !appointment.reasonUsesDateRange ||
    !appointment.vacationStartDate ||
    !appointment.vacationEndDate
  ) {
    return "";
  }

  return `${formatDisplayDate(appointment.vacationStartDate)} al ${formatDisplayDate(
    appointment.vacationEndDate,
  )}`;
}

function createInviteDescription(appointment: CalendarInvitePayload) {
  const dateRange = getAppointmentDateRange(appointment);
  return [
    `Ticket: ${getAppointmentTicketLabel(appointment)}`,
    `Conductor: ${appointment.driverName}`,
    `Móvil: ${appointment.vehicleNumber}`,
    `Motivo: ${appointment.appointmentReasonLabel}`,
    `Fecha requerida: ${formatDisplayDate(appointment.appointmentDate)}`,
    dateRange ? `Rango de fechas: ${dateRange}` : "",
    `Correo solicitante: ${appointment.email}`,
    `Teléfono: ${appointment.phone}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function createCalendarInvite(
  appointment: CalendarInvitePayload,
  executiveEmail: string,
  emailFrom: string,
  executiveLunchBreak?: ExecutiveLunchBreakConfig | null,
) {
  const schedule = getAppointmentSchedule(appointment, executiveLunchBreak);

  if (!schedule) {
    throw new Error("No se pudo calcular la duración de la cita.");
  }

  const startDateTime = formatCalendarDateTime(
    appointment.appointmentDate,
    schedule.startHour,
    schedule.startMinute,
  );
  const endDateTime = formatCalendarDateTime(
    appointment.appointmentDate,
    schedule.endHour,
    schedule.endMinute,
  );
  const subject = `Cita Apoquindo - Ticket ${getAppointmentTicketLabel(appointment)}`;
  const description = createInviteDescription(appointment);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Transportes Apoquindo//Agendamientos//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
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
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function createEmailHtml(
  appointment: CalendarInvitePayload,
  executiveLunchBreak?: ExecutiveLunchBreakConfig | null,
) {
  const reason = escapeHtml(appointment.appointmentReasonLabel);
  const dateRange = getAppointmentDateRange(appointment);
  const schedule = getAppointmentSchedule(appointment, executiveLunchBreak);

  if (!schedule) {
    return "";
  }

  return `
    <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6;">
      <h1 style="margin: 0 0 12px;">Cita agendada</h1>
      <p>Hola ${escapeHtml(appointment.assignedExecutive)},</p>
      <p>Se ha agendado una cita de ${schedule.durationMinutes} minutos para atender la siguiente solicitud.</p>
      <hr style="border: 0; border-top: 1px solid #d8e2ef; margin: 20px 0;" />
      <p><strong>Ticket:</strong> ${escapeHtml(getAppointmentTicketLabel(appointment))}</p>
      <p><strong>Conductor:</strong> ${escapeHtml(appointment.driverName)}</p>
      <p><strong>Móvil:</strong> ${escapeHtml(appointment.vehicleNumber)}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(schedule.dateLabel)}</p>
      <p><strong>Hora:</strong> ${escapeHtml(schedule.timeRangeLabel)} (${schedule.durationMinutes} min)</p>
      <p><strong>Motivo:</strong> ${reason}</p>
      ${dateRange ? `<p><strong>Rango de fechas:</strong> ${escapeHtml(dateRange)}</p>` : ""}
      <p><strong>Correo solicitante:</strong> ${escapeHtml(appointment.email)}</p>
      <p><strong>Teléfono:</strong> ${escapeHtml(appointment.phone)}</p>
      <p style="margin-top: 20px;">La invitación de calendario viene adjunta para Outlook.</p>
    </div>
  `;
}

function createEmailText(
  appointment: CalendarInvitePayload,
  executiveLunchBreak?: ExecutiveLunchBreakConfig | null,
) {
  const schedule = getAppointmentSchedule(appointment, executiveLunchBreak);

  if (!schedule) {
    return "";
  }

  return [
    `Hola ${appointment.assignedExecutive},`,
    "",
    `Se ha agendado una cita de ${schedule.durationMinutes} minutos para atender la siguiente solicitud.`,
    "",
    createInviteDescription(appointment),
    `Hora: ${schedule.timeRangeLabel} (${schedule.durationMinutes} min)`,
    "",
    "La invitación de calendario viene adjunta para Outlook.",
  ].join("\n");
}

export async function POST(request: NextRequest) {
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

  if (!isCalendarInvitePayload(body)) {
    return NextResponse.json(
      { message: "Datos de cita incompletos." },
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

  const transporter = createNotificaTransporter();
  const executiveLunchBreak = executive
    ? {
        lunchBreakEnabled: executive.lunchBreakEnabled,
        lunchBreakStart: executive.lunchBreakStart,
        lunchBreakEnd: executive.lunchBreakEnd,
      }
    : null;
  const calendarInvite = createCalendarInvite(
    body,
    executiveEmail,
    smtp.from,
    executiveLunchBreak,
  );

  try {
    const result = await transporter.sendMail({
      from: smtp.from,
      to: executiveEmail,
      subject: `Cita agendada - Ticket ${getAppointmentTicketLabel(body)}`,
      html: createEmailHtml(body, executiveLunchBreak),
      text: createEmailText(body, executiveLunchBreak),
      icalEvent: {
        filename: `cita-${getAppointmentTicketLabel(body)}.ics`,
        method: "REQUEST",
        content: calendarInvite,
      },
    });

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch {
    return NextResponse.json(
      { message: "No se pudo enviar la cita al ejecutivo." },
      { status: 502 },
    );
  }
}
