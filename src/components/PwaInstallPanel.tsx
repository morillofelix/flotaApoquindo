"use client";

import { downloadDesktopShortcut } from "@/lib/desktop-shortcut";
import { usePwaInstall } from "@/lib/usePwaInstall";
import { isDesktopDevice } from "@/lib/pwa-utils";
import { useEffect, useState } from "react";

type PwaInstallPanelProps = {
  variant?: "driver" | "admin";
  compact?: boolean;
};

export default function PwaInstallPanel({
  variant = "driver",
  compact = false,
}: PwaInstallPanelProps) {
  const {
    canNativeInstall,
    isIOS,
    isAndroid,
    isInstalled,
    promptInstall,
  } = usePwaInstall();
  const [isDesktop, setIsDesktop] = useState(false);
  const [shortcutDownloaded, setShortcutDownloaded] = useState(false);

  useEffect(() => {
    setIsDesktop(isDesktopDevice());
  }, []);

  if (isInstalled) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Gestión Flota TNA ya está instalada. Ábrela desde{" "}
        {isDesktop ? "tu escritorio o menú inicio" : "tu pantalla de inicio"}.
      </div>
    );
  }

  const title =
    variant === "admin"
      ? "Instalar agendamientos en tu computador"
      : "Instalar Gestión Flota TNA";

  return (
    <div
      className={`rounded-2xl border-2 border-[#9fb8d9] bg-[#f8fbff] ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#173b68]">
        Acceso en tu PC
      </p>
      <p className="mt-2 text-sm font-semibold text-[#0f2747]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {isDesktop
          ? "La forma más fácil y que funciona en Chrome y Edge (aunque el PC esté administrado) es descargar el acceso directo. La instalación como aplicación solo aparece si el navegador lo permite."
          : isIOS
            ? "En Safari, usa Compartir → Agregar a inicio."
            : isAndroid
              ? "En Chrome, abre el menú ⋮ → Instalar aplicación."
              : "Usa el menú del navegador para instalar la aplicación."}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {isDesktop ? (
          <button
            type="button"
            onClick={() => {
              downloadDesktopShortcut(variant);
              setShortcutDownloaded(true);
            }}
            className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white transition hover:bg-[#084a8c]"
          >
            Descargar acceso directo
          </button>
        ) : null}

        {canNativeInstall ? (
          <button
            type="button"
            onClick={() => {
              void promptInstall();
            }}
            className="inline-flex h-11 w-full items-center justify-center rounded-2xl border-2 border-[#0b5cab] bg-white px-4 text-sm font-semibold text-[#0b5cab] transition hover:bg-[#eef3f9]"
          >
            {isDesktop
              ? "Instalar como aplicación (si el navegador lo permite)"
              : "Instalar acceso directo"}
          </button>
        ) : null}
      </div>

      {shortcutDownloaded ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
          Se descargó <strong>Gestión Flota TNA.url</strong>. Muévelo al
          escritorio y haz doble clic para abrir el sistema.
        </p>
      ) : isDesktop ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          El archivo se guarda en Descargas. Puedes arrastrarlo al escritorio.
        </p>
      ) : null}
    </div>
  );
}
