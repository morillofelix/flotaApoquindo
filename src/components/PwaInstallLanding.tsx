"use client";

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
  const { canNativeInstall, isIOS, isAndroid, isInstalled, promptInstall } =
    usePwaInstall();
  const [isDesktop, setIsDesktop] = useState(false);
  const [installAttempted, setInstallAttempted] = useState(false);

  useEffect(() => {
    setIsDesktop(isDesktopDevice());
  }, []);

  async function handleInstallClick() {
    setInstallAttempted(true);
    await promptInstall();
  }

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

  const installHint = (() => {
    if (canNativeInstall) {
      return isDesktop
        ? "Haz clic en el botón para instalar la aplicación en tu computador."
        : "Toca el botón para instalar el icono en tu teléfono.";
    }

    if (isIOS) {
      return isDesktop
        ? "En Safari, usa Compartir y luego Agregar al Dock."
        : "En Safari, usa Compartir y luego Agregar a inicio.";
    }

    if (isAndroid) {
      return "En Chrome, abre el menú ⋮ y elige Instalar aplicación o Agregar a pantalla de inicio.";
    }

    if (isDesktop) {
      return "En Chrome o Edge, abre el menú del navegador (⋮) y elige Instalar aplicación o Instalar Gestión Flota TNA.";
    }

    return "Sigue los pasos de tu navegador para agregar el acceso directo.";
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
          <div className="mb-6 rounded-2xl border-2 border-[#9fb8d9] bg-[#f8fbff] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#173b68]">
              {isDesktop ? "Instalar aplicación" : "Acceso directo"}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{installHint}</p>

            <div className="mt-4">
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
              ) : isIOS ? (
                <p className="text-sm leading-7 text-slate-600">
                  1. Toca <strong>Compartir</strong> {isDesktop ? "en Safari" : "abajo en Safari"}
                  <br />
                  2. Elige{" "}
                  <strong>{isDesktop ? "Agregar al Dock" : "Agregar a inicio"}</strong>
                  <br />
                  3. Confirma con <strong>{isDesktop ? "Agregar" : "Agregar"}</strong>
                </p>
              ) : isAndroid ? (
                <p className="text-sm leading-7 text-slate-600">
                  1. Toca el menú <strong>⋮</strong> arriba a la derecha en Chrome
                  <br />
                  2. Elige <strong>Instalar aplicación</strong> o{" "}
                  <strong>Agregar a pantalla de inicio</strong>
                  <br />
                  3. Confirma la instalación
                </p>
              ) : (
                <p className="text-sm leading-7 text-slate-600">
                  {isDesktop ? (
                    <>
                      1. Busca el icono de instalación en la barra de direcciones
                      <br />
                      2. O abre el menú <strong>⋮</strong> y elige{" "}
                      <strong>Instalar aplicación</strong>
                      <br />
                      3. Confirma la instalación
                    </>
                  ) : (
                    <>
                      Usa el menú del navegador y elige{" "}
                      <strong>Instalar aplicación</strong> o{" "}
                      <strong>Agregar a pantalla de inicio</strong>.
                    </>
                  )}
                </p>
              )}
            </div>

            {installAttempted && !canNativeInstall && !isInstalled ? (
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Si no aparece el botón de instalación, recarga la página o usa el
                menú del navegador como se indica arriba.
              </p>
            ) : null}
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
