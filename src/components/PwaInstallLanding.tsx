"use client";

import { usePwaInstall } from "@/lib/usePwaInstall";
import { isDesktopDevice } from "@/lib/pwa-utils";
import Image from "next/image";
import { useMemo } from "react";

type PwaInstallLandingProps = {
  onContinueInBrowser: () => void;
};

export default function PwaInstallLanding({
  onContinueInBrowser,
}: PwaInstallLandingProps) {
  const { canPromptInstall, isInstalled, isIos, isAndroid, promptInstall } =
    usePwaInstall();
  const isDesktop = useMemo(() => isDesktopDevice(), []);

  async function handleInstall() {
    const accepted = await promptInstall();

    if (accepted) {
      onContinueInBrowser();
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eef3f9] px-4 py-8">
      <section className="w-full max-w-md rounded-[24px] border-2 border-[#7a9fc4] bg-white p-6 shadow-lg shadow-slate-400/30 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <Image
            src="/pwa-192.png"
            alt=""
            width={48}
            height={48}
            className="rounded-xl"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0b5cab]">
              Transportes Apoquindo
            </p>
            <h1 className="text-xl font-extrabold text-[#071c35]">
              Instalar Agendamiento Apoquindo
            </h1>
          </div>
        </div>

        <p className="mb-5 text-sm leading-6 text-[#3d5268]">
          Ábrelo en el teléfono e instala la app en la pantalla de inicio. Así
          la usas como aplicación, no solo como página web.
        </p>

        {isInstalled ? (
          <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            La app ya está instalada en este dispositivo.
          </p>
        ) : null}

        {isDesktop && !isInstalled ? (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Abre este mismo enlace desde el celular (Chrome o Safari) para
            instalarla. Desde el computador no se instala en el teléfono.
          </p>
        ) : null}

        {canPromptInstall && !isInstalled ? (
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="mb-4 w-full rounded-full bg-[#0b5cab] px-5 py-3.5 text-sm font-bold text-white"
          >
            Instalar acceso directo
          </button>
        ) : null}

        {isIos && !isInstalled ? (
          <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-[#3d5268]">
            <li>En Safari, toca el botón Compartir.</li>
            <li>Elige Agregar a inicio.</li>
            <li>Confirma el nombre Agendamiento Apoquindo.</li>
          </ol>
        ) : null}

        {isAndroid && !canPromptInstall && !isInstalled ? (
          <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-[#3d5268]">
            <li>En Chrome, toca el menú ⋮.</li>
            <li>Elige Instalar aplicación o Agregar a pantalla de inicio.</li>
            <li>Confirma la instalación.</li>
          </ol>
        ) : null}

        <button
          type="button"
          onClick={onContinueInBrowser}
          className="w-full rounded-full border-2 border-[#7a9fc4] bg-white px-5 py-3 text-sm font-bold text-[#071c35]"
        >
          Abrir en la web (sin instalar)
        </button>
      </section>
    </main>
  );
}
