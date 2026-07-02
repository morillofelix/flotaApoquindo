import {
  createNotificaTransporter,
  getNotificaSmtpConfig,
  isNotificaSmtpConfigured,
} from "@/lib/notifica-smtp";
import { buildTemporaryPasswordEmailContent } from "@/lib/temporary-password-mail-template";

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
  const subject = "Clave temporal - Solicitud de citas";
  const { text, html } = buildTemporaryPasswordEmailContent(input);

  await transporter.sendMail({
    from: smtp.from,
    to: input.to,
    bcc: smtp.auth.user,
    subject,
    text,
    html,
  });
}
