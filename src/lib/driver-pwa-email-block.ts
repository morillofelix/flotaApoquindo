import {
  getDriverInstallUrl,
  getDriverLoginUrl,
} from "@/lib/admin-platform-url";

const BUTTON_STYLE =
  "display:inline-block;background:#0b5cab;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px;margin:0 8px 10px 0;";

const SECONDARY_BUTTON_STYLE =
  "display:inline-block;background:#ffffff;color:#0b5cab;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px;border:2px solid #0b5cab;margin:0 8px 10px 0;";

export function getDriverPwaEmailBlock() {
  const installUrl = getDriverInstallUrl();
  const webUrl = getDriverLoginUrl();

  const html = `
    <div style="margin:28px 0 8px;padding:18px 16px;border:1px solid #d8e2ef;border-radius:16px;background:#f8fbff;">
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#071c35;">Accede al sistema</p>
      <p style="margin:0 0 16px;font-size:14px;color:#3d5268;">
        Puedes <strong>descargar el sistema</strong> en tu teléfono (instalar la app) o <strong>entrar en la web</strong>.
      </p>
      <p style="margin:0;">
        <a href="${installUrl}" style="${BUTTON_STYLE}">Descargar sistema</a>
        <a href="${webUrl}" style="${SECONDARY_BUTTON_STYLE}">Entrar en la web</a>
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#607086;">
        <strong>iPhone:</strong> abre Descargar sistema en Safari → Compartir → Agregar a inicio.<br />
        <strong>Android:</strong> abre Descargar sistema en Chrome → Instalar aplicación.
      </p>
    </div>
  `.trim();

  const text = [
    "Accede al sistema:",
    "Descargar / instalar en el teléfono:",
    installUrl,
    "Entrar en la web:",
    webUrl,
    "iPhone: Safari → Compartir → Agregar a inicio.",
    "Android: Chrome → Instalar aplicación.",
  ].join("\n");

  return { html, text, installUrl, webUrl };
}
