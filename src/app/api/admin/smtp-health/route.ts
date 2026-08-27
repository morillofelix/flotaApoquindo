import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  getNotificaSmtpPublicErrorMessage,
  getNotificaSmtpSummary,
  verifyNotificaSmtpConnection,
} from "@/lib/notifica-smtp";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

  if (unauthorized) {
    return unauthorized;
  }

  const summary = getNotificaSmtpSummary();

  if (!summary.configured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: "Correo de citas no configurado.",
      env: summary.env,
    });
  }

  try {
    await verifyNotificaSmtpConnection();

    return NextResponse.json({
      ok: true,
      configured: true,
      verified: true,
      source: summary.source,
      host: summary.host,
      port: summary.port,
      user: summary.user,
      from: summary.from,
      passwordLength: summary.passwordLength,
      env: summary.env,
    });
  } catch (error) {
    console.error("[admin/smtp-health] verify failed:", error);

    return NextResponse.json({
      ok: false,
      configured: true,
      verified: false,
      source: summary.source,
      host: summary.host,
      port: summary.port,
      user: summary.user,
      from: summary.from,
      passwordLength: summary.passwordLength,
      env: summary.env,
      message: getNotificaSmtpPublicErrorMessage(error),
    });
  }
}
