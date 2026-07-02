import {
  type Appointment,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import { resolveAppointmentSchedule, type ExecutiveLunchBreakConfig } from "@/lib/appointment-scheduling";
import { prisma } from "@/lib/prisma";
import {
  createNotificaTransporter,
  getNotificaSmtpConfig,
} from "@/lib/notifica-smtp";
import { NextResponse, type NextRequest } from "next/server";

type ScheduledEmailPayload = Pick<
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

function isScheduledEmailPayload(
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createEmailHtml(
  appointment: ScheduledEmailPayload,
  scheduleSummary: string,
) {
  return `
    <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6;">
      <h1 style="margin: 0 0 12px;">Tu cita fue agendada</h1>
      <p>Hola ${escapeHtml(appointment.driverName)},</p>
      <p>Tu solicitud fue agendada y ya tiene ejecutivo asignado.</p>
      <hr style="border: 0; border-top: 1px solid #d8e2ef; margin: 20px 0;" />
      <p><strong>Ticket:</strong> ${escapeHtml(getAppointmentTicketLabel(appointment))}</p>
      <p><strong>Móvil:</strong> ${escapeHtml(appointment.vehicleNumber)}</p>
      <p><strong>Motivo:</strong> ${escapeHtml(appointment.appointmentReasonLabel)}</p>
      <p><strong>Atención:</strong> ${escapeHtml(scheduleSummary)}</p>
      <p><strong>Ejecutivo:</strong> ${escapeHtml(appointment.assignedExecutive)}</p>
      <p style="margin-top: 20px;">Conserva tu ticket para futuras consultas.</p>
    </div>
  `;
}

function createEmailText(
  appointment: ScheduledEmailPayload,
  scheduleSummary: string,
) {
  return [
    `Hola ${appointment.driverName},`,
    "",
    "Tu solicitud fue agendada y ya tiene ejecutivo asignado.",
    "",
    `Ticket: ${getAppointmentTicketLabel(appointment)}`,
    `Móvil: ${appointment.vehicleNumber}`,
    `Motivo: ${appointment.appointmentReasonLabel}`,
    `Atención: ${scheduleSummary}`,
    `Ejecutivo: ${appointment.assignedExecutive}`,
    "",
    "Conserva tu ticket para futuras consultas.",
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

  if (!isScheduledEmailPayload(body)) {
    return NextResponse.json(
      { message: "Datos de cita incompletos." },
      { status: 400 },
    );
  }

  const executive = await prisma.executive.findUnique({
    where: { name: body.assignedExecutive },
  });
  const executiveLunchBreak: ExecutiveLunchBreakConfig | null = executive
    ? {
        lunchBreakEnabled: executive.lunchBreakEnabled,
        lunchBreakStart: executive.lunchBreakStart,
        lunchBreakEnd: executive.lunchBreakEnd,
      }
    : null;

  const schedule = resolveAppointmentSchedule({
    appointmentDate: body.appointmentDate,
    reasonAllowsExecutiveAssignment: body.reasonAllowsExecutiveAssignment,
    reasonUsesAppointmentDuration: body.reasonUsesAppointmentDuration,
    reasonAppointmentDurationMinutes: body.reasonAppointmentDurationMinutes,
    scheduledStartTime: body.scheduledStartTime,
    scheduledEndTime: body.scheduledEndTime,
    executiveLunchBreak,
  });

  if (!schedule) {
    return NextResponse.json(
      { message: "No se pudo calcular la hora de atención." },
      { status: 400 },
    );
  }

  const transporter = createNotificaTransporter();

  try {
    const result = await transporter.sendMail({
      from: smtp.from,
      to: body.email,
      subject: `Cita agendada - Ticket ${getAppointmentTicketLabel(body)}`,
      html: createEmailHtml(body, schedule.summaryLabel),
      text: createEmailText(body, schedule.summaryLabel),
    });

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch {
    return NextResponse.json(
      { message: "No se pudo enviar el correo al solicitante." },
      { status: 502 },
    );
  }
}
