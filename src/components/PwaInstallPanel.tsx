"use client";

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
    isServiceWorkerReady,
    promptInstall,
  } = usePwaInstall();
  const [isDesktop, setIsDesktop] = useState(false);
  const [installAttempted, setInstallAttempted] = useState(false);

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

  async function handleInstallClick() {
    setInstallAttempted(true);
    const installed = await promptInstall();

    if (!installed && !canNativeInstall) {
      return;
    }
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
        Instalar aplicación
      </p>
      <p className="mt-2 text-sm font-semibold text-[#0f2747]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {canNativeInstall
          ? isDesktop
            ? "Haz clic en instalar para agregar Gestión Flota TNA a tu computador."
            : "Toca instalar para agregar el acceso directo en tu teléfono."
          : isDesktop
            ? "En Chrome o Edge, busca el icono de instalación en la barra de direcciones o abre el menú ⋮ y elige Instalar aplicación."
            : isIOS
              ? "En Safari, usa Compartir → Agregar a inicio."
              : isAndroid
                ? "En Chrome, abre el menú ⋮ → Instalar aplicación."
                : "Usa el menú del navegador para instalar la aplicación."}
      </p>

      {!isServiceWorkerReady ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Preparando instalación… Si el botón no aparece en unos segundos, recarga
          la página.
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        {canNativeInstall ? (
          <button
            type="button"
            onClick={() => {
              void handleInstallClick();
            }}
            className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white transition hover:bg-[#084a8c]"
          >
            {isDesktop ? "Instalar en el computador" : "Instalar acceso directo"}
          </button>
        ) : null}

        {!canNativeInstall ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 w-full items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm font-semibold text-[#173b68] transition hover:bg-[#eef3f9]"
          >
            Recargar página
          </button>
        ) : null}
      </div>

      {installAttempted && !canNativeInstall ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Si no ves la opción de instalar, confirma que usas Chrome o Edge en
          Windows y recarga la página una vez.
        </p>
      ) : null}
    </div>
  );
}
