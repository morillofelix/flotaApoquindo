"use client";

import PasswordVisibilityButton from "@/components/PasswordVisibilityButton";
import { PERMANENT_PASSWORD_REQUIREMENTS_HINT } from "@/lib/password-policy";
import { UI_FIELD_FOCUS, UI_FIELD_SHADOW } from "@/lib/ui-borders";
import Image from "next/image";
import { useState } from "react";

const LOGIN_CARD_SHELL =
  "rounded-[22px] border-2 border-[#7a9fc4] bg-white shadow-lg shadow-slate-400/30 ring-1 ring-[#b7cce4]/60 sm:rounded-[24px]";
const LOGIN_FIELD_CLASS = `border-2 border-[#7a9fc4] bg-white ${UI_FIELD_SHADOW} ${UI_FIELD_FOCUS}`;

export type LoginAccessUser = {
  email: string;
  fullName: string;
};

type ExecutiveAccessLoginScreenProps = {
  storageKey?: string;
  eyebrow: string;
  title: string;
  description: string;
  showCredentialHint?: boolean;
  userLabel?: string;
  userPlaceholder?: string;
  onAuthenticated: () => void;
  onMustChangePassword?: (
    accessUser: LoginAccessUser,
    currentPassword: string,
  ) => void;
};

export default function ExecutiveAccessLoginScreen({
  storageKey,
  eyebrow,
  title,
  description,
  showCredentialHint = false,
  userLabel = "Usuario o correo",
  userPlaceholder = "Usuario ejecutivo o correo",
  onAuthenticated,
  onMustChangePassword,
}: ExecutiveAccessLoginScreenProps) {
  type LoginMode = "login" | "recover";

  const [mode, setMode] = useState<LoginMode>("login");
  const [loginValues, setLoginValues] = useState({ user: "", password: "" });
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

    const user = loginValues.user.trim();
    const password = loginValues.password;

    if (!user || !password) {
      setLoginError("Ingresa usuario o correo y clave.");
      setIsLoggingIn(false);
      return;
    }

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          user,
          password,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        mustChangePassword?: boolean;
        accessUser?: LoginAccessUser;
      };

      if (!response.ok) {
        setLoginError(data.message ?? "Usuario o clave incorrectos.");
        return;
      }

      if (data.mustChangePassword && data.accessUser) {
        onMustChangePassword?.(data.accessUser, password);
        setLoginValues({ user: "", password: "" });
        setIsPasswordVisible(false);
        return;
      }

      if (storageKey) {
        window.sessionStorage.setItem(storageKey, "true");
      }
      setLoginValues({ user: "", password: "" });
      setIsPasswordVisible(false);
      onAuthenticated();
    } catch {
      setLoginError("No se pudo validar el acceso. Intenta nuevamente.");
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, audience: "admin" }),
      });

      const data = (await response.json()) as {
        message?: string;
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.detail
            ? `${data.message ?? "No se pudo enviar la clave temporal."} ${data.detail}`
            : (data.message ?? "No se pudo enviar la clave temporal."),
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0b5cab]">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-heading text-2xl font-semibold leading-tight tracking-tight text-[#0f2747] sm:text-3xl">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>

        {mode === "login" ? (
        <form noValidate onSubmit={handleLogin} className="grid gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[#173b68]">{userLabel}</span>
            <input
              type="text"
              value={loginValues.user}
              onChange={(event) =>
                setLoginValues((currentValues) => ({
                  ...currentValues,
                  user: event.target.value,
                }))
              }
              className={`h-12 rounded-2xl px-4 text-[#0f2747] placeholder:text-slate-400 ${LOGIN_FIELD_CLASS}`}
              placeholder={userPlaceholder}
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
                placeholder="Clave de acceso"
                autoComplete="current-password"
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
              setRecoverEmail(loginValues.user.trim());
            }}
            className="text-sm font-semibold text-[#0b5cab] underline-offset-2 transition hover:text-[#084a8c] hover:underline"
          >
            Recuperar clave
          </button>
        </form>
        ) : (
        <form noValidate onSubmit={handleRecoverPassword} className="grid gap-5">
              <p className="text-sm leading-6 text-slate-600">
                Te enviaremos una clave temporal al correo registrado para
                ingresar a agendamientos y administración. Al ingresar deberás
                crear una clave definitiva.
              </p>
              <p className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-950">
                {PERMANENT_PASSWORD_REQUIREMENTS_HINT}
              </p>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#173b68]">
                  Correo
                </span>
                <input
                  type="email"
                  value={recoverEmail}
                  onChange={(event) => setRecoverEmail(event.target.value)}
                  className={`h-12 rounded-2xl px-4 text-[#0f2747] placeholder:text-slate-400 ${LOGIN_FIELD_CLASS}`}
                  placeholder="correo@empresa.cl"
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

        {showCredentialHint ? (
          <p className="mt-5 rounded-2xl border-2 border-[#9fb8d9] bg-[#f8fbff] px-4 py-3 text-sm leading-6 text-slate-600">
            También puedes ingresar con usuario <strong>ejecutivo</strong> o con
            tu correo si ya tienes acceso asignado.
          </p>
        ) : null}
      </section>
    </main>
  );
}

export const PUBLIC_ACCESS_STORAGE_KEY = "apoquindo-public-auth";
export const ADMIN_ACCESS_STORAGE_KEY = "apoquindo-admin-auth";
