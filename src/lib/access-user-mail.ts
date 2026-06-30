import { PERMANENT_PASSWORD_EMAIL_LINES } from "@/lib/password-policy";
import { getAdminLoginUrl } from "@/lib/admin-platform-url";

type AccessTemporaryPasswordEmailInput = {
  to: string;
  email: string;
  fullName: string;
  temporaryPassword: string;
  isNewUser?: boolean;
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

  const loginUrl = getAdminLoginUrl();
  const greeting = input.fullName ? `Estimado/a ${input.fullName},` : "Estimado/a,";
  const intro = input.isNewUser
    ? "Se ha creado su acceso a la plataforma de administración de Transportes Apoquindo."
    : "Se ha generado una nueva clave temporal para su acceso a la plataforma de administración de Transportes Apoquindo.";

  const subject = input.isNewUser
    ? "Acceso a la plataforma - Transportes Apoquindo"
    : "Clave temporal de acceso - Transportes Apoquindo";

  const text = [
    greeting,
    "",
    intro,
    "",
    "Sus credenciales de ingreso son:",
    `Correo: ${input.email}`,
    `Clave temporal: ${input.temporaryPassword}`,
    "",
    "Para ingresar a la plataforma, utilice el siguiente enlace:",
    loginUrl,
    "",
    "Pasos a seguir:",
    "1. Ingrese con su correo y la clave temporal indicada arriba.",
    "2. El sistema le solicitará definir una clave definitiva antes de continuar.",
    "3. A partir de ese momento, su acceso permanente será siempre con su correo y la clave que usted defina.",
    "",
    "Recuerde: este correo electrónico será su usuario de acceso a la plataforma.",
    "",
    ...PERMANENT_PASSWORD_EMAIL_LINES,
    "",
    "Si no esperaba este mensaje, por favor contacte al administrador del sistema.",
    "",
    "Atentamente,",
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
