import {
  getDriverInstallUrl,
  getDriverLoginUrl,
} from "@/lib/admin-platform-url";
import { PERMANENT_PASSWORD_EMAIL_LINES } from "@/lib/password-policy";

type TemporaryPasswordEmailContentInput = {
  fullName: string;
  temporaryPassword: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildTemporaryPasswordEmailContent(
  input: TemporaryPasswordEmailContentInput,
) {
  const appUrl = getDriverLoginUrl();
  const installUrl = getDriverInstallUrl();

  const text = [
    `Hola ${input.fullName},`,
    "",
    "Te damos la bienvenida al portal de solicitud de citas de Transportes Apoquindo.",
    "",
    "PASO 1 — Accede e instala la plataforma en tu teléfono:",
    installUrl,
    "",
    "Abre ese enlace desde tu celular para ingresar y crear el acceso directo Agendamiento Apoquindo en tu pantalla de inicio.",
    "",
    "PASO 2 — Usa esta clave temporal para ingresar:",
    input.temporaryPassword,
    "",
    "Ingresa con tu correo y esta clave temporal.",
    "",
    ...PERMANENT_PASSWORD_EMAIL_LINES,
    "",
    `Si prefieres entrar sin instalar: ${appUrl}`,
    "",
    "Si no solicitaste esta clave, ignora este mensaje.",
    "",
    "Transportes Apoquindo",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#102033;line-height:1.55;max-width:560px;">
      <p>Hola <strong>${escapeHtml(input.fullName)}</strong>,</p>
      <p>Te damos la bienvenida al <strong>portal de solicitud de citas</strong> de Transportes Apoquindo.</p>
      <p style="margin:24px 0 12px;font-size:15px;font-weight:700;color:#071c35;">Accede e instala la plataforma en tu teléfono</p>
      <p style="margin:0 0 18px;font-size:14px;color:#607086;">
        Abre el siguiente enlace <strong>desde tu celular</strong> para ingresar y crear el acceso directo con icono en tu pantalla de inicio.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${installUrl}" style="display:inline-block;background:#0b5cab;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px;">
          Accede e instala la plataforma
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#071c35;">Tu clave temporal de ingreso</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:0.18em;color:#071c35;margin:0 0 16px;">${escapeHtml(input.temporaryPassword)}</p>
      <p style="font-size:14px;color:#607086;">
        Ingresa con tu correo y esta clave temporal.
      </p>
      <p style="font-size:14px;color:#607086;margin-top:12px;">
        ${PERMANENT_PASSWORD_EMAIL_LINES.join("<br />")}
      </p>
      <p style="font-size:14px;color:#607086;margin-top:18px;">
        Al agregar a inicio, el acceso directo se llamará <strong>Agendamiento Apoquindo</strong>.
        En iPhone usa Safari → Compartir → Agregar a inicio. En Android, toca instalar acceso directo cuando aparezca en pantalla.
      </p>
      <p style="font-size:14px;color:#607086;">También puedes ingresar desde: <a href="${appUrl}">${appUrl}</a></p>
      <p style="font-size:14px;color:#607086;">Si no solicitaste esta clave, ignora este mensaje.</p>
      <p style="margin-top:24px;font-weight:700;">Transportes Apoquindo</p>
    </div>
  `.trim();

  return { text, html };
}
