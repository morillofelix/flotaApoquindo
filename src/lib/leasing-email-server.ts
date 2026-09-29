import { getSuperAdminEmail } from "@/lib/access-users";
import {
  formatLeasingCodigo,
  formatLeasingFecha,
  formatLeasingMonto,
  LEASING_MEDIO_PAGO_LABELS,
  type LeasingMedioPago,
} from "@/lib/leasing";
import {
  toPesos,
  writeLeasingAuditStandalone,
  type LeasingActor,
} from "@/lib/leasing-server";
import {
  createPagoPropietarioMailTransporter,
  getPagoPropietarioSmtpConfig,
} from "@/lib/pago-propietario-mail";
import { prisma } from "@/lib/prisma";

const SEND_TIMEOUT_MS = 20_000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeError(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  const secret = (process.env.PAGO_SMTP_PASSWORD ?? "").trim();

  if (secret) {
    message = message.split(secret).join("[oculto]");
  }

  return message.slice(0, 300);
}

export function isLeasingEmailTestMode() {
  return (process.env.LEASING_EMAIL_MODE ?? "").trim().toLowerCase() !== "produccion";
}

function getTestRecipient() {
  const configured = (process.env.LEASING_EMAIL_TEST_TO ?? "").trim();
  return emailPattern.test(configured) ? configured : getSuperAdminEmail();
}

type CorreoPagoData = {
  razonSocial: string;
  rut: string;
  movil: string;
  codigo: string;
  numeroCuota: number;
  cantidadCuotas: number;
  fechaPago: string;
  monto: number;
  medioPago: string;
  numeroOperacion: string;
  saldoCuota: number;
  saldoLeasing: number;
};

function buildCorreoPago(data: CorreoPagoData, destinatarioReal: string, testMode: boolean) {
  const subject = `${testMode ? "[PRUEBA] " : ""}Confirmación de pago leasing ${data.codigo} – cuota ${data.numeroCuota} de ${data.cantidadCuotas}`;
  const rows: Array<[string, string]> = [
    ["Razón social", data.razonSocial],
    ["RUT", data.rut],
    ["Móvil", data.movil],
    ["Leasing", data.codigo],
    ["Cuota", `${data.numeroCuota} de ${data.cantidadCuotas}`],
    ["Fecha de pago", formatLeasingFecha(data.fechaPago)],
    ["Monto pagado", formatLeasingMonto(data.monto)],
    ["Medio de pago", data.medioPago],
    ...(data.numeroOperacion
      ? ([["N° de operación", data.numeroOperacion]] as Array<[string, string]>)
      : []),
    ["Saldo de la cuota", formatLeasingMonto(data.saldoCuota)],
    ["Saldo total del leasing", formatLeasingMonto(data.saldoLeasing)],
  ];

  const testBanner = testMode
    ? `<p style="margin:0 0 16px;padding:10px 12px;border:1px solid #f5c26b;background:#fff8e6;color:#8a5a00;font-size:13px;">Correo de prueba. En producción se enviaría a: <strong>${escapeHtml(destinatarioReal || "(sin correo)")}</strong></p>`
    : "";

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#eef3f9;font-family:Arial,Helvetica,sans-serif;color:#0f2747;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #9fb8d9;">
    <tr><td style="background:#0f2747;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold;">Transportes Nueva Apoquindo</td></tr>
    <tr><td style="padding:24px;">
      ${testBanner}
      <p style="margin:0 0 12px;font-size:15px;">Estimado(a) ${escapeHtml(data.razonSocial)}:</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.5;">Le confirmamos que hemos registrado el siguiente pago asociado a su leasing:</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
        ${rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:8px 10px;border:1px solid #dbe6f3;background:#f5f8fc;color:#173b68;width:45%;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #dbe6f3;font-weight:bold;">${escapeHtml(value)}</td></tr>`,
          )
          .join("")}
      </table>
      <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#173b68;">Si tiene consultas sobre este pago, comuníquese con el Departamento de Flota.</p>
      <p style="margin:12px 0 0;font-size:12px;color:#5b6f8a;">Este es un correo automático, por favor no responder.</p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    testMode ? `CORREO DE PRUEBA. En producción se enviaría a: ${destinatarioReal || "(sin correo)"}` : "",
    `Estimado(a) ${data.razonSocial}:`,
    "",
    "Le confirmamos que hemos registrado el siguiente pago asociado a su leasing:",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Si tiene consultas sobre este pago, comuníquese con el Departamento de Flota.",
    "Este es un correo automático, por favor no responder.",
  ]
    .filter((line, index) => index > 0 || line)
    .join("\n");

  return { subject, html, text };
}

async function loadCorreoData(pagoId: string): Promise<CorreoPagoData | null> {
  const pago = await prisma.leasingPago.findUnique({
    where: { id: pagoId },
    include: {
      cuota: { select: { numeroCuota: true, montoOriginal: true, montoPagado: true } },
      leasing: {
        select: {
          numero: true,
          montoTotal: true,
          cantidadCuotas: true,
          razonSocialSnapshot: true,
          rutSnapshot: true,
          movilSnapshot: true,
          propietario: { select: { fullName: true, rut: true, vehicleNumber: true } },
        },
      },
    },
  });

  if (!pago) {
    return null;
  }

  const pagado = await prisma.leasingCuota.aggregate({
    where: { leasingId: pago.leasingId, estado: { not: "ANULADA" } },
    _sum: { montoPagado: true },
  });

  return {
    razonSocial: pago.leasing.propietario?.fullName ?? pago.leasing.razonSocialSnapshot,
    rut: pago.leasing.propietario?.rut ?? pago.leasing.rutSnapshot,
    movil: pago.leasing.propietario?.vehicleNumber ?? pago.leasing.movilSnapshot,
    codigo: formatLeasingCodigo(pago.leasing.numero),
    numeroCuota: pago.cuota.numeroCuota,
    cantidadCuotas: pago.leasing.cantidadCuotas,
    fechaPago: pago.fechaPago.toISOString().slice(0, 10),
    monto: toPesos(pago.monto),
    medioPago: LEASING_MEDIO_PAGO_LABELS[pago.medioPago as LeasingMedioPago] ?? pago.medioPago,
    numeroOperacion: pago.numeroOperacion,
    saldoCuota: Math.max(0, toPesos(pago.cuota.montoOriginal) - toPesos(pago.cuota.montoPagado)),
    saldoLeasing: Math.max(0, toPesos(pago.leasing.montoTotal) - toPesos(pagado._sum.montoPagado)),
  };
}

/**
 * Envía una notificación ya registrada. Toma la notificación con un update
 * condicional para que dos procesos no la envíen dos veces.
 */
export async function enviarNotificacionLeasing(notificacionId: string, actor: LeasingActor) {
  const claimed = await prisma.leasingNotificacion.updateMany({
    where: { id: notificacionId, estado: { in: ["PENDIENTE", "FALLIDO"] } },
    data: { estado: "ENVIANDO", cantidadIntentos: { increment: 1 } },
  });

  if (claimed.count === 0) {
    return { ok: false, message: "El correo ya fue enviado o se está enviando." };
  }

  const notificacion = await prisma.leasingNotificacion.findUniqueOrThrow({
    where: { id: notificacionId },
  });

  const fail = async (message: string) => {
    await prisma.leasingNotificacion.update({
      where: { id: notificacionId },
      data: { estado: "FALLIDO", ultimoError: message },
    });
    await writeLeasingAuditStandalone({
      actor,
      accion: "CORREO_FALLIDO",
      leasingId: notificacion.leasingId,
      pagoId: notificacion.pagoId,
      valoresNuevos: { notificacionId, error: message },
    }).catch(() => undefined);
    return { ok: false, message };
  };

  if (!emailPattern.test(notificacion.destinatario)) {
    return fail("El propietario no tiene un correo válido registrado.");
  }

  const smtp = getPagoPropietarioSmtpConfig();
  const transporter = createPagoPropietarioMailTransporter();

  if (!smtp || !transporter) {
    return fail("El servidor de correo no está configurado.");
  }

  const data = await loadCorreoData(notificacion.pagoId);

  if (!data) {
    return fail("No se encontró el pago asociado.");
  }

  const testMode = isLeasingEmailTestMode();
  const to = testMode ? getTestRecipient() : notificacion.destinatario;
  const { subject, html, text } = buildCorreoPago(data, notificacion.destinatario, testMode);

  try {
    const info = await Promise.race([
      transporter.sendMail({ from: smtp.from, to, subject, html, text }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tiempo de espera agotado al enviar el correo.")), SEND_TIMEOUT_MS),
      ),
    ]);

    await prisma.leasingNotificacion.update({
      where: { id: notificacionId },
      data: {
        estado: "ENVIADO",
        asunto: subject,
        messageId: typeof info.messageId === "string" ? info.messageId.slice(0, 200) : "",
        ultimoError: testMode ? `Modo prueba: enviado a ${to}` : "",
        enviadoAt: new Date(),
      },
    });
    await writeLeasingAuditStandalone({
      actor,
      accion: "CORREO_ENVIADO",
      leasingId: notificacion.leasingId,
      pagoId: notificacion.pagoId,
      valoresNuevos: { notificacionId, destinatario: to, modoPrueba: testMode },
    }).catch(() => undefined);

    return { ok: true, message: testMode ? `Correo de prueba enviado a ${to}.` : "Correo enviado." };
  } catch (error) {
    return fail(sanitizeError(error));
  } finally {
    transporter.close();
  }
}

export async function reenviarCorreoPago(pagoId: string, actor: LeasingActor) {
  const pago = await prisma.leasingPago.findUnique({
    where: { id: pagoId },
    select: {
      id: true,
      estado: true,
      leasingId: true,
      leasing: { select: { propietarioId: true, propietario: { select: { email: true } } } },
    },
  });

  if (!pago) {
    return { ok: false, status: 404, message: "Pago no encontrado." };
  }

  if (pago.estado !== "ACTIVO") {
    return { ok: false, status: 400, message: "No se envían correos de pagos anulados." };
  }

  const pendiente = await prisma.leasingNotificacion.findFirst({
    where: { pagoId, estado: { in: ["PENDIENTE", "FALLIDO"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const destinatario = pago.leasing.propietario?.email.trim() ?? "";
  const notificacionId =
    pendiente?.id ??
    (
      await prisma.leasingNotificacion.create({
        data: {
          leasingId: pago.leasingId,
          pagoId,
          propietarioId: pago.leasing.propietarioId,
          destinatario,
          tipo: "REENVIO_MANUAL",
          asunto: "",
          createdByEmail: actor.email,
        },
        select: { id: true },
      })
    ).id;

  if (pendiente) {
    await prisma.leasingNotificacion.update({
      where: { id: pendiente.id },
      data: { destinatario },
    });
  }

  const result = await enviarNotificacionLeasing(notificacionId, actor);
  return { ...result, status: result.ok ? 200 : 502 };
}
