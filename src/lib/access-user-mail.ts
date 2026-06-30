import { PERMANENT_PASSWORD_EMAIL_LINES } from "@/lib/password-policy";

type AccessTemporaryPasswordEmailInput = {
  to: string;
  fullName: string;
  temporaryPassword: string;
};

function getNotificaSmtpConfig() {
  const host = (
    process.env.NOTIFICA_SMTP_HOST ??
    process.env.SMTP_HOST ??
    ""
  ).trim();
  const port = Number(
    (process.env.NOTIFICA_SMTP_PORT ?? process.env.SMTP_PORT ?? "465").trim(),
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

export function isAccessUserMailConfigured() {
  return getNotificaSmtpConfig() !== null;
}

export async function sendAccessUserTemporaryPasswordEmail(
  input: AccessTemporaryPasswordEmailInput,
) {
  const smtp = getNotificaSmtpConfig();

  if (!smtp) {
    throw new Error("Correo de notificaciones no configurado en el servidor.");
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });

  const subject = "Clave temporal - Administración Apoquindo";
  const text = [
    `Hola ${input.fullName || "usuario"},`,
    "",
    "Tu clave temporal para ingresar a la administración de citas es:",
    "",
    input.temporaryPassword,
    "",
    "Ingresa con tu correo y esta clave temporal.",
    "",
    ...PERMANENT_PASSWORD_EMAIL_LINES,
    "",
    "Si no solicitaste esta clave, ignora este mensaje.",
    "",
    "Transportes Apoquindo",
  ].join("\n");

  await transporter.sendMail({
    from: smtp.from,
    to: input.to,
    bcc: smtp.auth.user,
    subject,
    text,
  });
}
