import {
  type AppointmentEmailPayload,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import { requireDriverSession } from "@/lib/admin-api-server";
import { readDriverSession } from "@/lib/driver-auth";
import { normalizeVehicleNumber } from "@/lib/driver-owners";
import {
  createNotificaTransporter,
  getNotificaSmtpConfig,
} from "@/lib/notifica-smtp";
import { normalizeEmail } from "@/lib/password-utils";
import { NextResponse, type NextRequest } from "next/server";

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
    typeof payload.appointmentReasonLabel === "string" &&
    typeof payload.reasonUsesDateRange === "boolean" &&
    typeof payload.reasonUsesPermitDetails === "boolean" &&
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
  const lines = [
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
  ];

  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  const unauthorized = requireDriverSession(request);

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

  if (!isAppointmentEmailPayload(body)) {
    return NextResponse.json(
      { message: "Datos de solicitud incompletos." },
      { status: 400 },
    );
  }

  const session = readDriverSession(request);

  if (
    !session ||
    normalizeVehicleNumber(body.vehicleNumber) !==
      normalizeVehicleNumber(session.vehicleNumber) ||
    normalizeEmail(body.email) !== normalizeEmail(session.email)
  ) {
    return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  }

  const transporter = createNotificaTransporter();

  try {
    const result = await transporter.sendMail({
      from: smtp.from,
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
