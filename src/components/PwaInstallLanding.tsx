"use client";

import PwaInstallPanel from "@/components/PwaInstallPanel";
import { isDesktopDevice } from "@/lib/pwa-utils";
import { usePwaInstall } from "@/lib/usePwaInstall";
import Image from "next/image";
import { useEffect, useState } from "react";

const LOGIN_CARD_SHELL =
  "rounded-[22px] border-2 border-[#7a9fc4] bg-white shadow-lg shadow-slate-400/30 ring-1 ring-[#b7cce4]/60 sm:rounded-[24px]";

type PwaInstallVariant = "driver" | "admin";

type PwaInstallLandingProps = {
  onContinueInBrowser: () => void;
  variant?: PwaInstallVariant;
};

function getDeviceLabel(isDesktop: boolean) {
  return isDesktop ? "computador" : "teléfono";
}

export default function PwaInstallLanding({
  onContinueInBrowser,
  variant = "driver",
}: PwaInstallLandingProps) {
  const { isInstalled } = usePwaInstall();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(isDesktopDevice());
  }, []);

  const deviceLabel = getDeviceLabel(isDesktop);
  const isAdmin = variant === "admin";

  const heading = isInstalled
    ? "Acceso directo creado"
    : `Instala la plataforma en tu ${deviceLabel}`;

  const description = (() => {
    if (isInstalled) {
      return isDesktop
        ? "Abre Gestión Flota TNA desde el icono en tu escritorio, menú inicio o barra de aplicaciones."
        : "Abre la plataforma desde el icono Gestión Flota TNA en tu pantalla de inicio. Allí ingresa con tu correo y la clave de acceso del email (4 primeros dígitos de tu RUT).";
    }

    if (isAdmin) {
      return isDesktop
        ? "Instala Gestión Flota TNA como aplicación en tu computador para abrir agendamientos directamente desde el escritorio."
        : "Instala Gestión Flota TNA en tu teléfono para acceder a agendamientos como una aplicación.";
    }

    return isDesktop
      ? "Instala Gestión Flota TNA como aplicación en tu computador para solicitar citas desde el escritorio o el menú inicio."
      : "Antes de ingresar, crea el acceso directo Gestión Flota TNA en tu pantalla de inicio. Después podrás entrar con tu correo y la clave de acceso que recibiste.";
  })();

  return (
    <main className="pwa-app-shell flex flex-col items-center justify-center bg-[#eef3f9] px-4 py-6 text-[#0f2747] sm:px-6 sm:py-10 lg:px-10">
      <section
        className={`w-full max-w-md ${LOGIN_CARD_SHELL} p-5 sm:rounded-[28px] sm:p-8`}
      >
        <div className="mb-7 border-b-2 border-[#9fb8d9] pb-6 text-center">
          <div className="mx-auto mb-5 flex w-fit items-center justify-center rounded-2xl border-2 border-[#7a9fc4] bg-white px-5 py-3.5">
            <Image
              src="/logo-gestion-flota-tna.png"
              alt="Gestión Flota TNA - Transportes Apoquindo"
              width={1024}
              height={1024}
              priority
              unoptimized
              className="h-24 w-auto max-w-[min(100%,14rem)] object-contain sm:h-28"
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b5cab]">
            {isInstalled ? "Paso 1 completado" : "Paso 1 de 2"}
          </p>
          <h1 className="mt-3 font-heading text-2xl font-semibold leading-tight tracking-tight text-[#0f2747] sm:text-3xl">
            {heading}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>

        {!isInstalled ? (
          <div className="mb-6">
            <PwaInstallPanel variant={variant} />
          </div>
        ) : (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {isDesktop
              ? "Si no ves el icono, revisa tu escritorio, menú inicio o la lista de aplicaciones instaladas."
              : "Si no ves el icono, revisa tu pantalla de inicio o la carpeta de apps instaladas."}
          </div>
        )}

        <button
          type="button"
          onClick={onContinueInBrowser}
          className="inline-flex h-11 w-full items-center justify-center rounded-2xl border-2 border-[#9fb8d9] bg-white px-4 text-sm font-semibold text-[#173b68] transition hover:bg-[#eef3f9]"
        >
          Ingresar desde el navegador
        </button>
      </section>
    </main>
  );
}
