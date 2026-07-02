import { PERMANENT_PASSWORD_EMAIL_LINES } from "@/lib/password-policy";
import { getAdminLoginUrl } from "@/lib/admin-platform-url";
import {
  createNotificaTransporter,
  getNotificaSmtpConfig,
  isNotificaSmtpConfigured,
} from "@/lib/notifica-smtp";

type AccessTemporaryPasswordEmailInput = {
  to: string;
  email: string;
  fullName: string;
  temporaryPassword: string;
  isNewUser?: boolean;
};

export function isAccessUserMailConfigured() {
  return isNotificaSmtpConfigured();
}

export async function sendAccessUserTemporaryPasswordEmail(
  input: AccessTemporaryPasswordEmailInput,
) {
  const smtp = getNotificaSmtpConfig();

  if (!smtp) {
    throw new Error("Correo de notificaciones no configurado en el servidor.");
  }

  const transporter = createNotificaTransporter();

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
