const PRODUCTION_APP_URL = "https://flota-apoquindo.vercel.app";

/** Enlace oficial de ingreso administrativo (correos de acceso). */
export const ADMIN_AGENDAMIENTOS_LOGIN_URL =
  "https://flota-apoquindo.vercel.app/agendamientos";

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function isLocalAppUrl(value: string) {
  return /localhost|127\.0\.0\.1/i.test(value);
}

function isPreviewVercelUrl(value: string) {
  return (
    value.includes("-projects.vercel.app") ||
    /flota-apoquindo-[a-z0-9]+-/.test(value)
  );
}

export function getAdminPlatformUrl() {
  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL ?? "");

  if (configured && !isLocalAppUrl(configured) && !isPreviewVercelUrl(configured)) {
    return configured;
  }

  const productionUrl = normalizeBaseUrl(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "",
  );

  if (productionUrl && !isPreviewVercelUrl(productionUrl)) {
    return productionUrl;
  }

  return PRODUCTION_APP_URL;
}

export function getAdminLoginUrl() {
  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL ?? "");

  if (
    configured &&
    !isLocalAppUrl(configured) &&
    !isPreviewVercelUrl(configured) &&
    configured !== PRODUCTION_APP_URL
  ) {
    return `${configured}/agendamientos`;
  }

  return ADMIN_AGENDAMIENTOS_LOGIN_URL;
}
