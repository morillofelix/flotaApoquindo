import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/** Casilla cPanel para citas, claves temporales y notificaciones de agendamientos. */
const CITAS_SMTP_DEFAULTS = {
  host: "mail.transporteapoquindo.cl",
  port: 465,
  user: "cita@transporteapoquindo.cl",
  from: "cita@transporteapoquindo.cl",
} as const;

const SMTP_TIMEOUT_MS = 12_000;

let cachedTransporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null =
  null;

export function getNotificaSmtpConfig() {
  const host = (
    process.env.CITAS_SMTP_HOST ??
    process.env.NOTIFICA_SMTP_HOST ??
    CITAS_SMTP_DEFAULTS.host
  ).trim();
  const port = Number(
    (
      process.env.CITAS_SMTP_PORT ??
      process.env.NOTIFICA_SMTP_PORT ??
      String(CITAS_SMTP_DEFAULTS.port)
    ).trim(),
  );
  const user = (
    process.env.CITAS_SMTP_USER ??
    process.env.NOTIFICA_SMTP_USER ??
    CITAS_SMTP_DEFAULTS.user
  ).trim();
  const pass = (
    process.env.CITAS_SMTP_PASSWORD ??
    process.env.NOTIFICA_SMTP_PASSWORD ??
    process.env.SMTP_PASSWORD ??
    process.env.SMTP_PASS ??
    ""
  ).trim();
  const from = (
    process.env.CITAS_EMAIL_FROM ??
    process.env.NOTIFICA_EMAIL_FROM ??
    process.env.EMAIL_FROM ??
    CITAS_SMTP_DEFAULTS.from
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

export function isNotificaSmtpConfigured() {
  return getNotificaSmtpConfig() !== null;
}

export function createNotificaTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const smtp = getNotificaSmtpConfig();

  if (!smtp) {
    throw new Error("Correo de notificaciones no configurado en el servidor.");
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
    pool: true,
    maxConnections: 2,
    maxMessages: 20,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  cachedTransporter = transporter;
  return transporter;
}
