import { requireDriverSession } from "@/lib/admin-api-server";
import { sendAppointmentTicketEmail } from "@/lib/appointment-ticket-email-server";
import { type AppointmentEmailPayload } from "@/lib/appointments";
import { readDriverSession } from "@/lib/driver-auth";
import { normalizeVehicleNumber } from "@/lib/driver-owners";
import { getNotificaSmtpConfig } from "@/lib/notifica-smtp";
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
    (payload.reasonUsesDaySwap === undefined ||
      typeof payload.reasonUsesDaySwap === "boolean") &&
    (payload.swapFromDate === undefined ||
      typeof payload.swapFromDate === "string") &&
    (payload.swapToDate === undefined ||
      typeof payload.swapToDate === "string") &&
    (payload.observation === undefined ||
      typeof payload.observation === "string") &&
    typeof payload.email === "string" &&
    typeof payload.phone === "string" &&
    typeof payload.createdAt === "string"
  );
}

export async function POST(request: NextRequest) {
  const unauthorized = requireDriverSession(request);

  if (unauthorized) {
    return unauthorized;
  }

  if (!getNotificaSmtpConfig()) {
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

  try {
    const result = await sendAppointmentTicketEmail(body);
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch {
    return NextResponse.json(
      { message: "No se pudo enviar el correo." },
      { status: 502 },
    );
  }
}
