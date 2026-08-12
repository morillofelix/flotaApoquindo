import { PWA_BRAND } from "@/lib/pwa-brand";

export type DesktopShortcutTarget = "driver" | "admin";

function getShortcutUrl(target: DesktopShortcutTarget) {
  if (typeof window === "undefined") {
    return "";
  }

  const origin = window.location.origin;

  return target === "admin"
    ? `${origin}/agendamientos`
    : `${origin}/`;
}

function getShortcutIconUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.origin}/favicon-32.png`;
}

/** Genera un acceso directo .url de Windows (no depende de políticas PWA). */
export function downloadDesktopShortcut(target: DesktopShortcutTarget = "driver") {
  const url = getShortcutUrl(target);
  const iconUrl = getShortcutIconUrl();
  const fileName = `${PWA_BRAND.shortName}.url`;

  const content = [
    "[InternetShortcut]",
    `URL=${url}`,
    `IconFile=${iconUrl}`,
    "IconIndex=0",
    "",
  ].join("\r\n");

  const blob = new Blob([content], { type: "application/internet-shortcut" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
