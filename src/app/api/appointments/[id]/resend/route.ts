import { getAppointmentTicketLabel } from "@/lib/appointments";
import {
  getRequiredDateSummary,
  shouldSendDecisionEmail,
} from "@/lib/agendamientos-appointments";
import { sendDecisionEmailServer } from "@/lib/appointment-decision-email-server";
import {
  sendExecutiveAssignmentEmailsServer,
  shouldSendExecutiveAssignmentEmails,
} from "@/lib/appointment-emails-server";
import { toAppointment, toReasonConfig } from "@/lib/appointments-mapper";
import { requireAdminPermission } from "@/lib/admin-api-server";
import { getNotificaSmtpPublicErrorMessage } from "@/lib/notifica-smtp";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function canResendAppointment(appointment: ReturnType<typeof toAppointment>) {
  if (
    appointment.createdByType === "ejecutivo" &&
    appointment.driverApprovalPending
  ) {
    return true;
  }

  return (
    shouldSendExecutiveAssignmentEmails(appointment) ||
    shouldSendDecisionEmail(appointment)
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;

  try {
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!existingAppointment) {
      return NextResponse.json(
        { message: "Solicitud no encontrada." },
        { status: 404 },
      );
    }

    const reasonRecord = await prisma.appointmentReason.findUnique({
      where: { value: existingAppointment.appointmentReason },
    });
    const reason = toReasonConfig(reasonRecord);
    const appointment = toAppointment(existingAppointment, reason ?? undefined);

    if (!canResendAppointment(appointment)) {
      return NextResponse.json(
        { message: "Esta solicitud no admite reenvío." },
        { status: 400 },
      );
    }

    let reminderSent = false;
    let emailsSent = false;
    let decisionEmailSent = false;

    if (
      appointment.createdByType === "ejecutivo" &&
      appointment.driverApprovalPending
    ) {
      const reminderMessage = `Recordatorio: ${appointment.createdByExecutiveName || "Tu ejecutivo"} espera tu aprobación de la solicitud (${getAppointmentTicketLabel(appointment)}) por ${appointment.appointmentReasonLabel}. Fecha requerida: ${getRequiredDateSummary(appointment) || "No aplica"}. Revisa el detalle en la app del conductor y confirma para continuar.`;

      await prisma.appointment.update({
        where: { id },
        data: {
          driverApprovalPending: true,
          driverApprovalMessage: reminderMessage,
        },
      });

      reminderSent = true;
    }

    if (shouldSendExecutiveAssignmentEmails(appointment)) {
      await sendExecutiveAssignmentEmailsServer(appointment);
      emailsSent = true;
    }

    if (shouldSendDecisionEmail(appointment)) {
      await sendDecisionEmailServer(appointment);
      decisionEmailSent = true;
    }

    const updatedAppointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!updatedAppointment) {
      return NextResponse.json(
        { message: "No se pudo actualizar la solicitud." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      reminderSent,
      emailsSent,
      decisionEmailSent,
      appointment: toAppointment(updatedAppointment, reason ?? undefined),
    });
  } catch (error) {
    console.error("POST /api/appointments/[id]/resend failed:", error);

    const message = getNotificaSmtpPublicErrorMessage(error);

    return NextResponse.json({ message }, { status: 502 });
  }
}
