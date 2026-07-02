import { PERMANENT_PASSWORD_EMAIL_LINES } from "@/lib/password-policy";
import { getDriverLoginUrl } from "@/lib/admin-platform-url";
import {
  createNotificaTransporter,
  getNotificaSmtpConfig,
  isNotificaSmtpConfigured,
} from "@/lib/notifica-smtp";

type TemporaryPasswordEmailInput = {
  to: string;
  fullName: string;
  temporaryPassword: string;
};

export function isTemporaryPasswordMailConfigured() {
  return isNotificaSmtpConfigured();
}

export async function sendTemporaryPasswordEmail(
  input: TemporaryPasswordEmailInput,
) {
  const smtp = getNotificaSmtpConfig();

  if (!smtp) {
    throw new Error("Correo de notificaciones no configurado en el servidor.");
  }

  const transporter = createNotificaTransporter();
  const loginUrl = getDriverLoginUrl();

  const subject = "Clave temporal - Solicitud de citas";
  const text = [
    `Hola ${input.fullName},`,
    "",
    "Tu clave temporal para ingresar al portal de solicitud de citas es:",
    "",
    input.temporaryPassword,
    "",
    "Ingresa con tu correo y esta clave temporal en:",
    loginUrl,
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
