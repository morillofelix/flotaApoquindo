import nodemailer from "nodemailer";

/** Casilla cPanel para citas, claves temporales y notificaciones de agendamientos. */
const CITAS_SMTP_DEFAULTS = {
  host: "mail.transporteapoquindo.cl",
  port: 465,
  user: "cita@transporteapoquindo.cl",
  from: "cita@transporteapoquindo.cl",
} as const;

const SMTP_TIMEOUT_MS = 12_000;

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function getNotificaSmtpConfig() {
  const citasPassword = readEnv("CITAS_SMTP_PASSWORD") || readEnv("NOTIFICA_SMTP_PASSWORD");
  const legacyPassword = readEnv("SMTP_PASSWORD") || readEnv("SMTP_PASS");
  const legacyUser = readEnv("SMTP_USER");

  if (citasPassword) {
    const host =
      readEnv("CITAS_SMTP_HOST") ||
      readEnv("NOTIFICA_SMTP_HOST") ||
      CITAS_SMTP_DEFAULTS.host;
    const port = Number(
      readEnv("CITAS_SMTP_PORT") ||
        readEnv("NOTIFICA_SMTP_PORT") ||
        String(CITAS_SMTP_DEFAULTS.port),
    );
    const user =
      readEnv("CITAS_SMTP_USER") ||
      readEnv("NOTIFICA_SMTP_USER") ||
      CITAS_SMTP_DEFAULTS.user;
    const from =
      readEnv("CITAS_EMAIL_FROM") ||
      readEnv("NOTIFICA_EMAIL_FROM") ||
      readEnv("EMAIL_FROM") ||
      CITAS_SMTP_DEFAULTS.from;

    if (!host || !user || !from) {
      return null;
    }

    return {
      host,
      port,
      secure: port === 465,
      auth: { user, pass: citasPassword },
      from,
      source: "citas" as const,
    };
  }

  if (legacyPassword && legacyUser) {
    const host = readEnv("SMTP_HOST") || CITAS_SMTP_DEFAULTS.host;
    const port = Number(readEnv("SMTP_PORT") || String(CITAS_SMTP_DEFAULTS.port));
    const from = readEnv("EMAIL_FROM") || legacyUser;

    if (!host || !from) {
      return null;
    }

    return {
      host,
      port,
      secure: port === 465,
      auth: { user: legacyUser, pass: legacyPassword },
      from,
      source: "legacy" as const,
    };
  }

  return null;
}

export function isNotificaSmtpConfigured() {
  return getNotificaSmtpConfig() !== null;
}

export function getNotificaSmtpPublicErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("535") || /invalid login/i.test(message)) {
    return "No se pudo autenticar el correo de citas. Revise CITAS_SMTP_USER y CITAS_SMTP_PASSWORD en Vercel.";
  }

  if (/timeout|timed out|ETIMEDOUT|ECONNECTION/i.test(message)) {
    return "No se pudo conectar al servidor de correo. Intente nuevamente en unos minutos.";
  }

  return "No se pudo enviar el correo.";
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
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
}
