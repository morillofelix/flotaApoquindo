"use client";

import { UI_CARD_SHELL, uiFieldClass } from "@/lib/ui-borders";
import { useState } from "react";

type ExecutiveAccessLoginScreenProps = {
  storageKey: string;
  eyebrow: string;
  title: string;
  description: string;
  showCredentialHint?: boolean;
  onAuthenticated: () => void;
};

export default function ExecutiveAccessLoginScreen({
  storageKey,
  eyebrow,
  title,
  description,
  showCredentialHint = false,
  onAuthenticated,
}: ExecutiveAccessLoginScreenProps) {
  const [loginValues, setLoginValues] = useState({ user: "", password: "" });
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: loginValues.user.trim(),
          password: loginValues.password,
        }),
      });

      if (response.ok) {
        window.sessionStorage.setItem(storageKey, "true");
        setLoginValues({ user: "", password: "" });
        setIsPasswordVisible(false);
        onAuthenticated();
        return;
      }

      setLoginError("Usuario o clave incorrectos.");
    } catch {
      setLoginError("No se pudo validar el acceso. Intenta nuevamente.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#eef3f9] px-4 py-6 text-[#0f2747] sm:px-6 sm:py-10 lg:px-10">
      <section
        className={`w-full max-w-md ${UI_CARD_SHELL} p-5 sm:rounded-[28px] sm:p-8`}
      >
        <div className="mb-7 border-b border-[#c5d8eb] pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0b5cab]">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-heading text-3xl font-semibold leading-tight tracking-tight text-[#0f2747]">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        </div>

        <form noValidate onSubmit={handleLogin} className="grid gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[#173b68]">Usuario</span>
            <input
              type="text"
              value={loginValues.user}
              onChange={(event) =>
                setLoginValues((currentValues) => ({
                  ...currentValues,
                  user: event.target.value,
                }))
              }
              className={`h-12 rounded-2xl px-4 text-[#0f2747] placeholder:text-slate-400 ${uiFieldClass()}`}
              placeholder="Usuario ejecutivo"
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
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#f8fbff] hover:text-[#0b5cab] focus:outline-none focus:ring-2 focus:ring-[#0b5cab]/15"
              >
                {isPasswordVisible ? (
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="m3 3 18 18" />
                    <path d="M10.7 5.1A10.8 10.8 0 0 1 12 5c6 0 9 7 9 7a13.2 13.2 0 0 1-2.1 3.2" />
                    <path d="M6.6 6.6C4.1 8.3 3 12 3 12s3 7 9 7a9.7 9.7 0 0 0 4.1-.9" />
                    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                    <path d="M14.1 9.9A3 3 0 0 0 9.9 14.1" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
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
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLoggingIn ? "Validando..." : "Ingresar"}
          </button>
        </form>

        {showCredentialHint ? (
          <p className="mt-5 rounded-2xl bg-[#f8fbff] px-4 py-3 text-xs leading-5 text-slate-500">
            Acceso temporal: usuario <strong>ejecutivo</strong>, clave{" "}
            <strong>Apoquindo2026</strong>.
          </p>
        ) : null}
      </section>
    </main>
  );
}

export const PUBLIC_ACCESS_STORAGE_KEY = "apoquindo-public-auth";
export const ADMIN_ACCESS_STORAGE_KEY = "apoquindo-admin-auth";
