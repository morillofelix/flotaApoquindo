"use client";

import PasswordVisibilityButton from "@/components/PasswordVisibilityButton";
import { PERMANENT_PASSWORD_REQUIREMENTS_HINT } from "@/lib/password-policy";
import { UI_FIELD_FOCUS, UI_FIELD_SHADOW } from "@/lib/ui-borders";
import Image from "next/image";
import { useState } from "react";

const LOGIN_CARD_SHELL =
  "rounded-[22px] border-2 border-[#7a9fc4] bg-white shadow-lg shadow-slate-400/30 ring-1 ring-[#b7cce4]/60 sm:rounded-[24px]";
const LOGIN_FIELD_CLASS = `border-2 border-[#7a9fc4] bg-white ${UI_FIELD_SHADOW} ${UI_FIELD_FOCUS}`;

export type PublicDriverOwner = {
  vehicleNumber: string;
  fullName: string;
  email: string;
  mobilePhone: string;
  landlinePhone: string;
  phone: string;
  mustChangePassword: boolean;
};

type DriverAccessLoginScreenProps = {
  onAuthenticated: (driverOwner: PublicDriverOwner) => void;
  onMustChangePassword: (
    driverOwner: PublicDriverOwner,
    currentPassword: string,
  ) => void;
};

type LoginMode = "login" | "recover";

export default function DriverAccessLoginScreen({
  onAuthenticated,
  onMustChangePassword,
}: DriverAccessLoginScreenProps) {
  const [mode, setMode] = useState<LoginMode>("login");
  const [loginValues, setLoginValues] = useState({ email: "", password: "" });
  const [recoverEmail, setRecoverEmail] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [recoverMessage, setRecoverMessage] = useState("");
  const [recoverError, setRecoverError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");

    const email = loginValues.email.trim();
    const password = loginValues.password.trim();

    if (!email || !password) {
      setLoginError("Ingresa correo y clave.");
      setIsLoggingIn(false);
      return;
    }

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as {
        message?: string;
        driverOwner?: PublicDriverOwner;
      };

      if (!response.ok || !data.driverOwner) {
        throw new Error(data.message ?? "Correo o clave incorrectos.");
      }

      if (data.driverOwner.mustChangePassword) {
        onMustChangePassword(data.driverOwner, password);
        return;
      }

      onAuthenticated(data.driverOwner);
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : "Correo o clave incorrectos. Revisa los datos e intenta nuevamente.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleRecoverPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecoverMessage("");
    setRecoverError("");

    const email = recoverEmail.trim();

    if (!email) {
      setRecoverError("Ingresa tu correo.");
      return;
    }

    setIsRecoveringPassword(true);

    try {
      const response = await fetch("/api/recover-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, audience: "driver" }),
      });

      const data = (await response.json()) as { message?: string; detail?: string };

      if (!response.ok) {
        throw new Error(
          [data.message, data.detail].filter(Boolean).join(" — ") ||
            "No se pudo enviar la clave temporal.",
        );
      }

      setRecoverMessage(
        data.message ??
          "Si el correo está registrado, recibirás una clave temporal en los próximos minutos.",
      );
    } catch (error) {
      setRecoverError(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la clave temporal.",
      );
    } finally {
      setIsRecoveringPassword(false);
    }
  }

  return (
    <main className="pwa-app-shell flex flex-col items-center justify-center bg-[#eef3f9] px-4 py-6 text-[#0f2747] sm:px-6 sm:py-10 lg:px-10">
      <section
        className={`w-full max-w-md ${LOGIN_CARD_SHELL} p-5 sm:rounded-[28px] sm:p-8`}
      >
        <div className="mb-7 border-b-2 border-[#9fb8d9] pb-6 text-center">
          <div className="mx-auto mb-5 flex w-fit items-center justify-center rounded-2xl border-2 border-[#7a9fc4] bg-white px-5 py-3.5">
            <Image
              src="/logo-apoquindo.png"
              alt="Transportes Apoquindo"
              width={1024}
              height={220}
              priority
              unoptimized
              className="h-14 w-auto max-w-[min(100%,18rem)] object-contain sm:h-[3.75rem]"
            />
          </div>
          <h1 className="font-heading text-2xl font-semibold leading-tight tracking-tight text-[#0f2747] sm:text-3xl">
            Solicitud de cita
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
            Ingresa con tu correo y clave para registrar solicitudes de tu móvil.
          </p>
        </div>

        {mode === "login" ? (
          <form noValidate onSubmit={handleLogin} className="grid gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">Correo</span>
              <input
                type="email"
                value={loginValues.email}
                onChange={(event) =>
                  setLoginValues((currentValues) => ({
                    ...currentValues,
                    email: event.target.value,
                  }))
                }
                className={`h-12 rounded-2xl px-4 text-[#0f2747] placeholder:text-slate-400 ${LOGIN_FIELD_CLASS}`}
                placeholder="correo@ejemplo.com"
                autoComplete="username"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">Clave</span>
              <div className="relative">
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  value={loginValues.password}
                  onChange={(event) =>
                    setLoginValues((currentValues) => ({
                      ...currentValues,
                      password: event.target.value,
                    }))
                  }
                  className={`h-12 w-full rounded-2xl px-4 pr-12 text-[#0f2747] placeholder:text-slate-400 ${LOGIN_FIELD_CLASS}`}
                  placeholder="Clave temporal o definitiva"
                  autoComplete="current-password"
                  inputMode="text"
                />
                <PasswordVisibilityButton
                  visible={isPasswordVisible}
                  onToggle={() =>
                    setIsPasswordVisible((currentValue) => !currentValue)
                  }
                />
              </div>
            </label>

            {loginError ? (
              <div className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {loginError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isLoggingIn ? "Validando..." : "Ingresar"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("recover");
                setLoginError("");
                setRecoverMessage("");
                setRecoverError("");
                setRecoverEmail(loginValues.email);
              }}
              className="text-sm font-semibold text-[#0b5cab] underline-offset-2 transition hover:text-[#084a8c] hover:underline"
            >
              Recuperar clave
            </button>
          </form>
        ) : (
          <form
            noValidate
            onSubmit={handleRecoverPassword}
            className="grid gap-5"
          >
            <p className="text-sm leading-6 text-slate-600">
              Te enviaremos una clave temporal al correo registrado como
              conductor para ingresar al portal de solicitud de citas. Al
              ingresar deberás crear una clave definitiva.
            </p>
            <p className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-950">
              {PERMANENT_PASSWORD_REQUIREMENTS_HINT}
            </p>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">Correo</span>
              <input
                type="email"
                value={recoverEmail}
                onChange={(event) => setRecoverEmail(event.target.value)}
                className={`h-12 rounded-2xl px-4 text-[#0f2747] placeholder:text-slate-400 ${LOGIN_FIELD_CLASS}`}
                placeholder="correo@ejemplo.com"
                autoComplete="username"
              />
            </label>

            {recoverMessage ? (
              <div className="rounded-2xl border-2 border-green-300 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
                {recoverMessage}
              </div>
            ) : null}

            {recoverError ? (
              <div className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {recoverError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isRecoveringPassword}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isRecoveringPassword ? "Enviando..." : "Enviar clave temporal"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("login");
                setRecoverMessage("");
                setRecoverError("");
              }}
              className="text-sm font-semibold text-[#0b5cab] transition hover:text-[#084a8c]"
            >
              Volver al inicio de sesión
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
