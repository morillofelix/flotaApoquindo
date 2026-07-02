import { PERMANENT_PASSWORD_EMAIL_LINES } from "@/lib/password-policy";
import { getAdminPlatformUrl } from "@/lib/admin-platform-url";
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
  const loginUrl = getAdminPlatformUrl();

  const subject = "Clave temporal - Transportes Apoquindo";
  const text = [
    `Hola ${input.fullName},`,
    "",
    "Tu clave temporal para ingresar al sistema de Transportes Apoquindo es:",
    "",
    input.temporaryPassword,
    "",
    "Ingresa con tu correo y esta clave temporal en:",
    loginUrl,
    "",
    "Si tu acceso es de administración o agendamientos, usa el enlace de agendamientos dentro de la plataforma.",
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
