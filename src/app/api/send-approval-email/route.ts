import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  isDecisionEmailPayload,
  sendDecisionEmailServer,
} from "@/lib/appointment-decision-email-server";
import { getNotificaSmtpConfig } from "@/lib/notifica-smtp";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

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

  if (!isDecisionEmailPayload(body)) {
    return NextResponse.json(
      { message: "Datos de aprobación incompletos." },
      { status: 400 },
    );
  }

  try {
    const result = await sendDecisionEmailServer(body);
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (error) {
    console.error("[send-approval-email] SMTP send failed:", error);
    return NextResponse.json(
      { message: "No se pudo enviar el correo de aprobación." },
      { status: 502 },
    );
  }
}
