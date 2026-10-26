import { DEFAULT_AUTO_REFRESH_MS } from "@/hooks/use-auto-refresh";

export function formatLastUpdatedAt(value: Date | null) {
  if (!value) {
    return "sin actualizar";
  }

  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function formatRefreshTooltip(lastUpdatedAt: Date | null) {
  const intervalSeconds = Math.round(DEFAULT_AUTO_REFRESH_MS / 1000);

  return `Actualizar ahora. Última actualización: ${formatLastUpdatedAt(
    lastUpdatedAt,
  )}. Se actualiza automáticamente cada ${intervalSeconds} segundos.`;
}

export function formatElapsedSince(value: Date, now = new Date()) {
  const seconds = Math.max(0, Math.floor((now.getTime() - value.getTime()) / 1000));
  if (seconds < 60) return "hace un momento";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "hace 1 minuto" : `hace ${minutes} minutos`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

/** Pantallas que no consultan la base solas: solo indican cuándo se cargaron. */
export function formatManualRefreshTooltip(lastUpdatedAt: Date | null, now = new Date()) {
  if (!lastUpdatedAt) return "Actualizar ahora.";
  return `Actualizar ahora. Actualizado ${formatElapsedSince(lastUpdatedAt, now)}.`;
}
