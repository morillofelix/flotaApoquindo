import { getDriverLoginUrl } from "@/lib/admin-platform-url";

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

  const text = [
    `Hola ${input.fullName},`,
    "",
    "Te damos la bienvenida al portal de solicitud de citas de Transportes Apoquindo.",
    "",
    "Ingresa al portal con este enlace:",
    appUrl,
    "",
    "Tu clave de acceso:",
    input.temporaryPassword,
    "",
    "Ingresa con tu correo y esta clave. Corresponde a los 4 primeros dígitos de tu RUT y será tu clave definitiva.",
    "",
    "Si no solicitaste esta clave, ignora este mensaje.",
    "",
    "Transportes Apoquindo",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#102033;line-height:1.55;max-width:560px;">
      <p>Hola <strong>${escapeHtml(input.fullName)}</strong>,</p>
      <p>Te damos la bienvenida al <strong>portal de solicitud de citas</strong> de Transportes Apoquindo.</p>
      <p style="margin:24px 0 12px;font-size:15px;font-weight:700;color:#071c35;">Accede al portal</p>
      <p style="margin:0 0 24px;">
        <a href="${appUrl}" style="display:inline-block;background:#0b5cab;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px;">
          Abrir portal de citas
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#071c35;">Tu clave de acceso</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:0.18em;color:#071c35;margin:0 0 16px;">${escapeHtml(input.temporaryPassword)}</p>
      <p style="font-size:14px;color:#607086;">
        Ingresa con tu correo y esta clave. Corresponde a los 4 primeros dígitos de tu RUT y será tu clave definitiva.
      </p>
      <p style="font-size:14px;color:#607086;margin-top:18px;">También puedes ingresar desde: <a href="${appUrl}">${appUrl}</a></p>
      <p style="font-size:14px;color:#607086;">Si no solicitaste esta clave, ignora este mensaje.</p>
      <p style="margin-top:24px;font-weight:700;">Transportes Apoquindo</p>
    </div>
  `.trim();

  return { text, html };
}
