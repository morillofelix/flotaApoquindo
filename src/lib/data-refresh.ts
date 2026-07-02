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
