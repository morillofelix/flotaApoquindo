import nodemailer from "nodemailer";

export function getNotificaSmtpConfig() {
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

export function isNotificaSmtpConfigured() {
  return getNotificaSmtpConfig() !== null;
}

export function createNotificaTransporter() {
  const smtp = getNotificaSmtpConfig();

  if (!smtp) {
    throw new Error("Correo de notificaciones no configurado en el servidor.");
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });
}
