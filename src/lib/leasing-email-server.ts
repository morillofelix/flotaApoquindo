import { getSuperAdminEmail } from "@/lib/access-users";
import {
  formatLeasingBanco,
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

/**
 * Copias ocultas de cada correo de pago: la casilla de Facturación Móviles
 * (o LEASING_EMAIL_COPY_TO) y el usuario que registró el pago.
 */
function getCopyRecipients(smtpUser: string, to: string, procesadoPor: string) {
  const configured = (process.env.LEASING_EMAIL_COPY_TO ?? "").trim();
  const candidatos = [emailPattern.test(configured) ? configured : smtpUser, procesadoPor];
  const vistos = new Set([to.trim().toLowerCase()]);

  return candidatos
    .map((email) => email.trim())
    .filter((email) => {
      const key = email.toLowerCase();

      if (!emailPattern.test(email) || vistos.has(key)) {
        return false;
      }

      vistos.add(key);
      return true;
    });
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
  banco: string;
  procesadoPor: string;
  saldoCuota: number;
  montoTotal: number;
  totalPagado: number;
  saldoLeasing: number;
  cuotasPagadas: number;
};

function getEstadoCuotaTexto(data: CorreoPagoData) {
  return data.saldoCuota > 0
    ? `Abono parcial – faltan ${formatLeasingMonto(data.saldoCuota)} para completar esta cuota`
    : "Pagada completa";
}

function renderRows(rows: Array<[string, string]>) {
  return rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 10px;border:1px solid #dbe6f3;background:#f5f8fc;color:#173b68;width:42%;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #dbe6f3;font-weight:bold;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
}

function renderResumenBox(label: string, value: string, color: string, background: string) {
  return `<td width="33%" style="padding:12px 8px;border:1px solid #dbe6f3;background:${background};text-align:center;vertical-align:top;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#5b6f8a;">${escapeHtml(label)}</div>
    <div style="margin-top:4px;font-size:17px;font-weight:bold;color:${color};">${escapeHtml(value)}</div>
  </td>`;
}

function buildCorreoPago(data: CorreoPagoData, destinatarioReal: string, testMode: boolean) {
  const subject = `${testMode ? "[PRUEBA] " : ""}Confirmación de pago leasing ${data.codigo} – cuota ${data.numeroCuota} de ${data.cantidadCuotas}`;
  const identificacion: Array<[string, string]> = [
    ["Razón social", data.razonSocial],
    ["RUT", data.rut],
    ["Móvil", data.movil],
    ["Leasing", data.codigo],
  ];
  const pagoRows: Array<[string, string]> = [
    ["Cuota", `${data.numeroCuota} de ${data.cantidadCuotas}`],
    ["Fecha de pago", formatLeasingFecha(data.fechaPago)],
    ["Monto pagado", formatLeasingMonto(data.monto)],
    ["Medio de pago", data.medioPago],
    ...(data.banco ? ([["Banco", data.banco]] as Array<[string, string]>) : []),
    ...(data.numeroOperacion
      ? ([["N° de operación", data.numeroOperacion]] as Array<[string, string]>)
      : []),
    ["Estado de la cuota", getEstadoCuotaTexto(data)],
  ];
  const resumenRows: Array<[string, string]> = [
    ["Monto total del leasing", formatLeasingMonto(data.montoTotal)],
    ["Total pagado a la fecha", formatLeasingMonto(data.totalPagado)],
    ["Saldo pendiente del leasing", formatLeasingMonto(data.saldoLeasing)],
    ["Cuotas pagadas", `${data.cuotasPagadas} de ${data.cantidadCuotas}`],
  ];
  const sectionTitle = (title: string) =>
    `<p style="margin:20px 0 8px;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.6px;color:#0b5cab;">${escapeHtml(title)}</p>`;

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
      <p style="margin:0 0 4px;font-size:14px;line-height:1.5;">Le confirmamos que hemos registrado el siguiente pago asociado a su leasing.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-collapse:collapse;font-size:14px;">
        ${renderRows(identificacion)}
      </table>
      ${sectionTitle("Detalle del pago")}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
        ${renderRows(pagoRows)}
      </table>
      ${sectionTitle("Resumen del leasing")}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          ${renderResumenBox("Monto del leasing", formatLeasingMonto(data.montoTotal), "#0f2747", "#f5f8fc")}
          ${renderResumenBox("Pagado a la fecha", formatLeasingMonto(data.totalPagado), "#15803d", "#f0fdf4")}
          ${renderResumenBox("Saldo pendiente", formatLeasingMonto(data.saldoLeasing), "#0b5cab", "#eef3f9")}
        </tr>
      </table>
      <p style="margin:8px 0 0;font-size:13px;color:#173b68;">Cuotas pagadas: <strong>${data.cuotasPagadas} de ${data.cantidadCuotas}</strong></p>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#173b68;">Si tiene consultas sobre este pago, comuníquese con el Departamento de Flota.</p>
      <p style="margin:12px 0 0;font-size:12px;color:#5b6f8a;">Este es un correo automático, por favor no responder.</p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    testMode ? `CORREO DE PRUEBA. En producción se enviaría a: ${destinatarioReal || "(sin correo)"}` : "",
    `Estimado(a) ${data.razonSocial}:`,
    "",
    "Le confirmamos que hemos registrado el siguiente pago asociado a su leasing.",
    "",
    ...identificacion.map(([label, value]) => `${label}: ${value}`),
    "",
    "DETALLE DEL PAGO",
    ...pagoRows.map(([label, value]) => `${label}: ${value}`),
    "",
    "RESUMEN DEL LEASING",
    ...resumenRows.map(([label, value]) => `${label}: ${value}`),
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

  const [pagado, cuotasPagadas] = await Promise.all([
    prisma.leasingCuota.aggregate({
      where: { leasingId: pago.leasingId, estado: { not: "ANULADA" } },
      _sum: { montoPagado: true },
    }),
    prisma.leasingCuota.count({ where: { leasingId: pago.leasingId, estado: "PAGADA" } }),
  ]);
  const montoTotal = toPesos(pago.leasing.montoTotal);
  const totalPagado = toPesos(pagado._sum.montoPagado);

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
    banco: pago.banco ? formatLeasingBanco(pago.banco) : "",
    procesadoPor: pago.createdByEmail,
    saldoCuota: Math.max(0, toPesos(pago.cuota.montoOriginal) - toPesos(pago.cuota.montoPagado)),
    montoTotal,
    totalPagado,
    saldoLeasing: Math.max(0, montoTotal - totalPagado),
    cuotasPagadas,
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
  const copia = getCopyRecipients(smtp.auth.user, to, data.procesadoPor);

  try {
    const info = await Promise.race([
      transporter.sendMail({
        from: smtp.from,
        to,
        ...(copia.length ? { bcc: copia } : {}),
        subject,
        html,
        text,
      }),
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
      valoresNuevos: { notificacionId, destinatario: to, copia, modoPrueba: testMode },
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
