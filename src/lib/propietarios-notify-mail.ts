import nodemailer from "nodemailer";
import {
  formatPropietarioChangesForEmail,
  formatSantiagoTimestamp,
  type PropietarioChangeRecord,
} from "@/lib/propietarios-changes";

const DEFAULT_NOTIFY_RECIPIENTS = [
  "fmorillo@transportesapoquindo.cl",
  "maneva@transportesapoquindo.cl",
  "administracion@transportesapoquindo.cl",
];

function getSmtpConfig() {
  const host = (
    process.env.NOTIFICA_SMTP_HOST ??
    process.env.SMTP_HOST ??
    ""
  ).trim();
  const port = Number(
    (process.env.NOTIFICA_SMTP_PORT ?? process.env.SMTP_PORT ?? "587").trim(),
  );
  const user = (
    process.env.NOTIFICA_SMTP_USER ??
    process.env.SMTP_USER ??
    ""
  ).trim();
  const pass = (
    process.env.NOTIFICA_SMTP_PASSWORD ??
    process.env.SMTP_PASSWORD ??
    process.env.SMTP_PASS ??
    ""
  ).trim();
  const from = (
    process.env.NOTIFICA_EMAIL_FROM ??
    process.env.EMAIL_FROM ??
    user
  ).trim();

  if (!host || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from,
  };
}

export function getPropietariosNotifyRecipients() {
  const configured = (process.env.PROPIETARIOS_NOTIFY_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_NOTIFY_RECIPIENTS;
}

export function isPropietariosNotifyMailConfigured() {
  return getSmtpConfig() !== null;
}

async function sendPropietariosNotification(subject: string, lines: string[]) {
  const smtp = getSmtpConfig();

  if (!smtp) {
    throw new Error("Correo SMTP no configurado en el servidor.");
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });

  const text = [...lines, "", "Transportes Apoquindo", "Sistema de gestión de flota"].join(
    "\n",
  );

  const recipients = getPropietariosNotifyRecipients();

  await Promise.all(
    recipients.map((recipient) =>
      transporter.sendMail({
        from: smtp.from,
        to: recipient,
        bcc: smtp.auth.user,
        subject,
        text,
      }),
    ),
  );
}

type PropietarioUpdateNotificationInput = {
  actor: string;
  fullName: string;
  rut: string;
  vehicleNumber: string;
  changes: PropietarioChangeRecord[];
  inactiveReason?: string;
};

function buildInactiveReasonEmailLines(inactiveReason?: string) {
  const reason = inactiveReason?.trim();

  if (!reason) {
    return [];
  }

  return ["", "Motivo de inactivación:", reason];
}

export async function sendPropietarioUpdateNotification(
  input: PropietarioUpdateNotificationInput,
) {
  if (!input.changes.length && !input.inactiveReason?.trim()) {
    return;
  }

  const timestamp = formatSantiagoTimestamp();
  const changeLines = formatPropietarioChangesForEmail(input.changes);
  const motivoLines = buildInactiveReasonEmailLines(input.inactiveReason);

  await sendPropietariosNotification(
    input.inactiveReason?.trim()
      ? "Inactivación / actualización de propietario - Transportes Apoquindo"
      : "Actualización de propietario - Transportes Apoquindo",
    [
      "Estimados,",
      "",
      input.inactiveReason?.trim()
        ? "Se informa que se inactivó o actualizó un registro en el módulo de Propietarios."
        : "Se informa que se actualizó un registro en el módulo de Propietarios.",
      "",
      `Fecha y hora: ${timestamp}`,
      `Usuario que realizó el cambio: ${input.actor}`,
      `Propietario: ${input.fullName || "(sin nombre)"}`,
      `RUT: ${input.rut || "(sin RUT)"}`,
      `Móvil: ${input.vehicleNumber || "(sin móvil)"}`,
      ...motivoLines,
      ...(changeLines.length
        ? ["", "Detalle de modificaciones:", "", ...changeLines]
        : []),
      "",
      "Este mensaje fue generado automáticamente por el sistema.",
    ],
  );
}

type PropietarioBulkNotificationInput = {
  actor: string;
  importedCount: number;
  warningCount: number;
  sampleNames: string[];
};

export async function sendPropietarioBulkImportNotification(
  input: PropietarioBulkNotificationInput,
) {
  const timestamp = formatSantiagoTimestamp();
  const sampleLines =
    input.sampleNames.length > 0
      ? [
          "",
          "Ejemplos de propietarios importados:",
          ...input.sampleNames.map((name, index) => `${index + 1}. ${name}`),
        ]
      : [];

  await sendPropietariosNotification(
    "Carga masiva de propietarios - Transportes Apoquindo",
    [
      "Estimados,",
      "",
      "Se informa que se actualizó la base de propietarios mediante carga masiva.",
      "",
      `Fecha y hora: ${timestamp}`,
      `Usuario que realizó la carga: ${input.actor}`,
      `Registros importados: ${input.importedCount}`,
      `Advertencias de validación: ${input.warningCount}`,
      "",
      "La operación reemplazó la base completa de propietarios con los datos del archivo cargado.",
      ...sampleLines,
      "",
      "Este mensaje fue generado automáticamente por el sistema.",
    ],
  );
}

export async function notifyPropietarioUpdateSafely(
  input: PropietarioUpdateNotificationInput,
) {
  if (!isPropietariosNotifyMailConfigured()) {
    console.warn("Propietario update notification skipped: SMTP no configurado.");
    return false;
  }

  if (!input.changes.length && !input.inactiveReason?.trim()) {
    return false;
  }

  try {
    await sendPropietarioUpdateNotification(input);
    return true;
  } catch (error) {
    console.error("Propietario update notification failed:", error);
    return false;
  }
}

export async function notifyPropietarioBulkImportSafely(
  input: PropietarioBulkNotificationInput,
) {
  if (!isPropietariosNotifyMailConfigured()) {
    console.warn("Propietario bulk notification skipped: SMTP no configurado.");
    return false;
  }

  try {
    await sendPropietarioBulkImportNotification(input);
    return true;
  } catch (error) {
    console.error("Propietario bulk notification failed:", error);
    return false;
  }
}

type PropietarioDeleteNotificationInput = {
  actor: string;
  fullName: string;
  rut: string;
  vehicleNumber: string;
  reason: string;
};

export async function sendPropietarioDeleteNotification(
  input: PropietarioDeleteNotificationInput,
) {
  const timestamp = formatSantiagoTimestamp();

  await sendPropietariosNotification(
    "Eliminación de propietario - Transportes Apoquindo",
    [
      "Estimados,",
      "",
      "Se informa que se eliminó un registro del módulo de Propietarios.",
      "",
      `Fecha y hora: ${timestamp}`,
      `Usuario que realizó la acción: ${input.actor}`,
      `Propietario: ${input.fullName || "(sin nombre)"}`,
      `RUT: ${input.rut || "(sin RUT)"}`,
      `Móvil: ${input.vehicleNumber || "(sin móvil)"}`,
      "",
      "Motivo de eliminación:",
      input.reason,
      "",
      "Este mensaje fue generado automáticamente por el sistema.",
    ],
  );
}

export async function notifyPropietarioDeleteSafely(
  input: PropietarioDeleteNotificationInput,
) {
  if (!isPropietariosNotifyMailConfigured()) {
    console.warn("Propietario delete notification skipped: SMTP no configurado.");
    return false;
  }

  try {
    await sendPropietarioDeleteNotification(input);
    return true;
  } catch (error) {
    console.error("Propietario delete notification failed:", error);
    return false;
  }
}
