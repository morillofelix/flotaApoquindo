import { SITE_CONFIG } from "@/lib/constants";

export function getAdminPlatformUrl() {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? SITE_CONFIG.url).trim();

  if (configured && configured !== "http://localhost:3000") {
    return configured.replace(/\/$/, "");
  }

  const vercelUrl = (process.env.VERCEL_URL ?? "").trim();

  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, "")}`;
  }

  return "https://flota-apoquindo.vercel.app";
}

export function getAdminLoginUrl() {
  return `${getAdminPlatformUrl()}/agendamientos`;
}
