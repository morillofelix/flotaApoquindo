"use client";

import { UI_CARD_SHELL, uiFieldClass } from "@/lib/ui-borders";
import { useState } from "react";

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
    const password = loginValues.password;

    if (!email || !password) {
      setLoginError("Ingresa correo y clave.");
      setIsLoggingIn(false);
      return;
    }

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const response = await fetch("/api/auth?action=recover-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#eef3f9] px-4 py-6 text-[#0f2747] sm:px-6 sm:py-10 lg:px-10">
      <section
        className={`w-full max-w-md ${UI_CARD_SHELL} p-5 sm:rounded-[28px] sm:p-8`}
      >
        <div className="mb-7 border-b border-[#c5d8eb] pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0b5cab]">
            Acceso conductor
          </p>
          <h1 className="mt-3 font-heading text-3xl font-semibold leading-tight tracking-tight text-[#0f2747]">
            Solicitud de cita
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
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
                className={`h-12 rounded-2xl px-4 text-[#0f2747] placeholder:text-slate-400 ${uiFieldClass()}`}
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
                  className={`h-12 w-full rounded-2xl px-4 pr-12 text-[#0f2747] placeholder:text-slate-400 ${uiFieldClass()}`}
                  placeholder="Clave de acceso"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() =>
                    setIsPasswordVisible((currentValue) => !currentValue)
                  }
                  aria-label={
                    isPasswordVisible ? "Ocultar clave" : "Mostrar clave"
                  }
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#f8fbff] hover:text-[#0b5cab]"
                >
                  {isPasswordVisible ? "Ocultar" : "Ver"}
                </button>
              </div>
            </label>

            {loginError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
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
              className="text-sm font-semibold text-[#0b5cab] transition hover:text-[#084a8c]"
            >
              ¿Olvidaste tu clave?
            </button>
          </form>
        ) : (
          <form
            noValidate
            onSubmit={handleRecoverPassword}
            className="grid gap-5"
          >
            <p className="text-sm leading-6 text-slate-600">
              Te enviaremos una clave temporal al correo registrado. Al ingresar
              deberás crear una clave definitiva.
            </p>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">Correo</span>
              <input
                type="email"
                value={recoverEmail}
                onChange={(event) => setRecoverEmail(event.target.value)}
                className={`h-12 rounded-2xl px-4 text-[#0f2747] placeholder:text-slate-400 ${uiFieldClass()}`}
                placeholder="correo@ejemplo.com"
                autoComplete="username"
              />
            </label>

            {recoverMessage ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
                {recoverMessage}
              </div>
            ) : null}

            {recoverError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
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
