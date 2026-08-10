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

const calendarTimezone = "America/Santiago";

export type CalendarInvitePayload = Pick<
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

export type ScheduledEmailPayload = Pick<
  Appointment,
  | "id"
  | "ticketNumber"
  | "driverName"
  | "vehicleNumber"
  | "appointmentDate"
  | "appointmentReasonLabel"
  | "reasonAllowsExecutiveAssignment"
  | "reasonUsesAppointmentDuration"
  | "reasonAppointmentDurationMinutes"
  | "scheduledStartTime"
  | "scheduledEndTime"
  | "email"
  | "assignedExecutive"
  | "status"
>;

export function isCalendarInvitePayload(
  value: unknown,
): value is CalendarInvitePayload {
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

export function isScheduledEmailPayload(
  value: unknown,
): value is ScheduledEmailPayload {
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
    typeof payload.reasonUsesAppointmentDuration === "boolean" &&
    typeof payload.reasonAppointmentDurationMinutes === "number" &&
    typeof payload.email === "string" &&
    typeof payload.assignedExecutive === "string" &&
    payload.assignedExecutive.length > 0 &&
    payload.status === "revisado"
  );
}

export function shouldSendExecutiveAssignmentEmails(appointment: Appointment) {
  return (
    appointment.status === "revisado" &&
    appointment.reasonAllowsExecutiveAssignment &&
    appointment.assignedExecutive.trim() !== ""
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

async function loadExecutiveLunchBreak(assignedExecutive: string) {
  await prisma.executive.createMany({
    data: defaultExecutives,
    skipDuplicates: true,
  });

  const executive = await prisma.executive.findUnique({
    where: { name: assignedExecutive },
  });

  if (!executive?.isActive || !executive.email.trim()) {
    throw new Error("El ejecutivo no tiene correo configurado.");
  }

  return {
    executiveEmail: executive.email.trim(),
    executiveLunchBreak: {
      lunchBreakEnabled: executive.lunchBreakEnabled,
      lunchBreakStart: executive.lunchBreakStart,
      lunchBreakEnd: executive.lunchBreakEnd,
    } satisfies ExecutiveLunchBreakConfig,
  };
}

export async function sendCalendarInviteEmail(appointment: CalendarInvitePayload) {
  const smtp = getNotificaSmtpConfig();

  if (!smtp) {
    throw new Error("Servicio de correo no configurado.");
  }

  const { executiveEmail, executiveLunchBreak } = await loadExecutiveLunchBreak(
    appointment.assignedExecutive,
  );
  const transporter = createNotificaTransporter();
  const calendarInvite = createCalendarInvite(
    appointment,
    executiveEmail,
    smtp.from,
    executiveLunchBreak,
  );

  return transporter.sendMail({
    from: smtp.from,
    to: executiveEmail,
    subject: `Cita agendada - Ticket ${getAppointmentTicketLabel(appointment)}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6;">
        <h1 style="margin: 0 0 12px;">Cita agendada</h1>
        <p>Hola ${escapeHtml(appointment.assignedExecutive)},</p>
        <p>Se ha agendado una cita para atender la siguiente solicitud.</p>
        <p><strong>Ticket:</strong> ${escapeHtml(getAppointmentTicketLabel(appointment))}</p>
        <p><strong>Conductor:</strong> ${escapeHtml(appointment.driverName)}</p>
        <p><strong>Móvil:</strong> ${escapeHtml(appointment.vehicleNumber)}</p>
        <p><strong>Motivo:</strong> ${escapeHtml(appointment.appointmentReasonLabel)}</p>
        <p style="margin-top: 20px;">La invitación de calendario viene adjunta para Outlook.</p>
      </div>
    `,
    text: createEmailText(appointment, executiveLunchBreak),
    icalEvent: {
      filename: `cita-${getAppointmentTicketLabel(appointment)}.ics`,
      method: "REQUEST",
      content: calendarInvite,
    },
  });
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

export async function sendScheduledConfirmationEmail(
  appointment: ScheduledEmailPayload,
) {
  const smtp = getNotificaSmtpConfig();

  if (!smtp) {
    throw new Error("Servicio de correo no configurado.");
  }

  const { executiveLunchBreak } = await loadExecutiveLunchBreak(
    appointment.assignedExecutive,
  );
  const schedule = resolveAppointmentSchedule({
    appointmentDate: appointment.appointmentDate,
    reasonAllowsExecutiveAssignment: appointment.reasonAllowsExecutiveAssignment,
    reasonUsesAppointmentDuration: appointment.reasonUsesAppointmentDuration,
    reasonAppointmentDurationMinutes:
      appointment.reasonAppointmentDurationMinutes,
    scheduledStartTime: appointment.scheduledStartTime,
    scheduledEndTime: appointment.scheduledEndTime,
    executiveLunchBreak,
  });

  if (!schedule) {
    throw new Error("No se pudo calcular la hora de atención.");
  }

  const transporter = createNotificaTransporter();

  return transporter.sendMail({
    from: smtp.from,
    to: appointment.email,
    subject: `Cita agendada - Ticket ${getAppointmentTicketLabel(appointment)}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6;">
        <h1 style="margin: 0 0 12px;">Tu cita fue agendada</h1>
        <p>Hola ${escapeHtml(appointment.driverName)},</p>
        <p>Tu solicitud fue agendada y ya tiene ejecutivo asignado.</p>
        <p><strong>Ticket:</strong> ${escapeHtml(getAppointmentTicketLabel(appointment))}</p>
        <p><strong>Móvil:</strong> ${escapeHtml(appointment.vehicleNumber)}</p>
        <p><strong>Motivo:</strong> ${escapeHtml(appointment.appointmentReasonLabel)}</p>
        <p><strong>Atención:</strong> ${escapeHtml(schedule.summaryLabel)}</p>
        <p><strong>Ejecutivo:</strong> ${escapeHtml(appointment.assignedExecutive)}</p>
      </div>
    `,
    text: [
      `Hola ${appointment.driverName},`,
      "",
      "Tu solicitud fue agendada y ya tiene ejecutivo asignado.",
      "",
      `Ticket: ${getAppointmentTicketLabel(appointment)}`,
      `Móvil: ${appointment.vehicleNumber}`,
      `Motivo: ${appointment.appointmentReasonLabel}`,
      `Atención: ${schedule.summaryLabel}`,
      `Ejecutivo: ${appointment.assignedExecutive}`,
    ].join("\n"),
  });
}

export async function sendExecutiveAssignmentEmailsServer(
  appointment: Appointment,
) {
  if (!shouldSendExecutiveAssignmentEmails(appointment)) {
    return;
  }

  if (!isCalendarInvitePayload(appointment)) {
    throw new Error("Datos de cita incompletos para enviar la invitación.");
  }

  if (!isScheduledEmailPayload(appointment)) {
    throw new Error("Datos de cita incompletos para enviar la confirmación.");
  }

  await sendCalendarInviteEmail(appointment);
  await sendScheduledConfirmationEmail(appointment);
}
