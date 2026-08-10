import {
  isScheduledEmailPayload,
  sendScheduledConfirmationEmail,
} from "@/lib/appointment-emails-server";
import { getNotificaSmtpConfig } from "@/lib/notifica-smtp";
import { requireAdminPermission } from "@/lib/admin-api-server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

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

  if (!isScheduledEmailPayload(body)) {
    return NextResponse.json(
      { message: "Datos de cita incompletos." },
      { status: 400 },
    );
  }

  try {
    const result = await sendScheduledConfirmationEmail(body);
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "No se pudo enviar el correo al solicitante.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
