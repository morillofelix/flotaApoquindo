import {
  buildComprobanteMessage,
  type SendPagoPropietarioEmailItem,
  type SendPagoPropietarioEmailPayload,
} from "@/lib/pago-propietario";
import {
  createPagoPropietarioMailTransporter,
  getPagoPropietarioSmtpConfig,
} from "@/lib/pago-propietario-mail";
import {
  requireAdminSession,
  sanitizeServerErrorMessage,
} from "@/lib/admin-api-server";
import { NextResponse, type NextRequest } from "next/server";

const MAX_ITEMS_PER_SEND = 100;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidItem(value: unknown): value is SendPagoPropietarioEmailItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as SendPagoPropietarioEmailItem;

  return (
    typeof item.id === "string" &&
    typeof item.to === "string" &&
    emailPattern.test(item.to.trim()) &&
    typeof item.titularName === "string" &&
    item.titularName.trim().length > 0 &&
    typeof item.amount === "number" &&
    Number.isFinite(item.amount) &&
    item.amount > 0
  );
}

function isValidPayload(value: unknown): value is SendPagoPropietarioEmailPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as SendPagoPropietarioEmailPayload;

  return (
    typeof payload.periodFrom === "string" &&
    typeof payload.periodTo === "string" &&
    isValidDate(payload.periodFrom) &&
    isValidDate(payload.periodTo) &&
    Array.isArray(payload.items) &&
    payload.items.length > 0 &&
    payload.items.length <= MAX_ITEMS_PER_SEND &&
    payload.items.every(isValidItem)
  );
}

function createEmailHtml(input: {
  titularName: string;
  amount: number;
  periodFrom: string;
  periodTo: string;
}) {
  const message = buildComprobanteMessage(input);

  return `
    <div style="font-family: Arial, sans-serif; color: #0f2747; line-height: 1.6; max-width: 640px;">
      <h1 style="margin: 0 0 16px; font-size: 22px; color: #0b5cab;">Comprobante de pago</h1>
      <p style="margin: 0 0 16px; font-size: 16px;">${escapeHtml(message)}</p>
      <p style="margin: 24px 0 0; color: #53657a; font-size: 13px;">
        Este correo fue generado automáticamente por el sistema de pagos de Transportes Apoquindo.
      </p>
    </div>
  `;
}

function createEmailText(input: {
  titularName: string;
  amount: number;
  periodFrom: string;
  periodTo: string;
}) {
  return [
    "Comprobante de pago",
    "",
    buildComprobanteMessage(input),
    "",
    "Este correo fue generado automáticamente por el sistema de pagos de Transportes Apoquindo.",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminSession(request);

  if (unauthorized) {
    return unauthorized;
  }

  const smtp = getPagoPropietarioSmtpConfig();
  const transporter = createPagoPropietarioMailTransporter();

  if (!smtp || !transporter) {
    return NextResponse.json(
      {
        message:
          process.env.NODE_ENV === "production"
            ? "Servicio de correo de pagos no disponible."
            : "Correo de pagos a propietarios no configurado. Revisa PAGO_SMTP_* en el servidor.",
      },
      { status: 500 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  if (!isValidPayload(body)) {
    return NextResponse.json(
      {
        message:
          "Datos inválidos. Revisa período, montos y correos del titular.",
      },
      { status: 400 },
    );
  }

  const results = [];

  for (const item of body.items) {
    try {
      const mailResult = await transporter.sendMail({
        from: `"Facturación Móviles" <${smtp.from}>`,
        to: item.to.trim(),
        replyTo: smtp.from,
        subject: "Comprobante de pago — Transportes Apoquindo",
        html: createEmailHtml({
          titularName: item.titularName.trim(),
          amount: item.amount,
          periodFrom: body.periodFrom,
          periodTo: body.periodTo,
        }),
        text: createEmailText({
          titularName: item.titularName.trim(),
          amount: item.amount,
          periodFrom: body.periodFrom,
          periodTo: body.periodTo,
        }),
      });

      results.push({
        id: item.id,
        ok: true,
        messageId: mailResult.messageId,
      });
    } catch (error) {
      results.push({
        id: item.id,
        ok: false,
        error: sanitizeServerErrorMessage(
          error,
          "No se pudo enviar el correo.",
        ),
      });
    }
  }

  const sentCount = results.filter((result) => result.ok).length;

  return NextResponse.json({
    ok: sentCount > 0,
    sentCount,
    results,
  });
}
