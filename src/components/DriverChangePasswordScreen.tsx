"use client";

import type { PublicDriverOwner } from "@/components/DriverAccessLoginScreen";
import PasswordVisibilityButton from "@/components/PasswordVisibilityButton";
import {
  PERMANENT_PASSWORD_REQUIREMENTS_HINT,
  validatePermanentPassword,
} from "@/lib/password-policy";
import { UI_CARD_SHELL, uiFieldClass } from "@/lib/ui-borders";
import { useState } from "react";

type DriverChangePasswordScreenProps = {
  driverOwner: PublicDriverOwner;
  currentPassword: string;
  onCompleted: (driverOwner: PublicDriverOwner) => void;
  onCancel: () => void;
};

export default function DriverChangePasswordScreen({
  driverOwner,
  currentPassword,
  onCompleted,
  onCancel,
}: DriverChangePasswordScreenProps) {
  const [values, setValues] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const newPassword = values.newPassword.trim();
    const confirmPassword = values.confirmPassword.trim();

    if (!newPassword || !confirmPassword) {
      setError("Completa la clave nueva y su confirmación.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("La clave nueva y su confirmación no coinciden.");
      return;
    }

    const validationMessage = validatePermanentPassword(newPassword);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth?action=change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: driverOwner.email,
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        driverOwner?: PublicDriverOwner;
      };

      if (!response.ok || !data.driverOwner) {
        throw new Error(data.message ?? "No se pudo actualizar la clave.");
      }

      setMessage(data.message ?? "Clave actualizada correctamente.");
      onCompleted(data.driverOwner);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo actualizar la clave.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#eef3f9] px-4 py-6 text-[#0f2747] sm:px-6 sm:py-10 lg:px-10">
      <section
        className={`w-full max-w-md ${UI_CARD_SHELL} p-5 sm:rounded-[28px] sm:p-8`}
      >
        <div className="mb-7 border-b border-[#c5d8eb] pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0b5cab]">
            Seguridad
          </p>
          <h1 className="mt-3 font-heading text-3xl font-semibold leading-tight tracking-tight text-[#0f2747]">
            Define tu clave
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Ingresaste con una clave temporal. Antes de continuar, crea tu clave
            definitiva.
          </p>
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-950">
            {PERMANENT_PASSWORD_REQUIREMENTS_HINT}
          </p>
        </div>

        <form noValidate onSubmit={handleSubmit} className="grid gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[#173b68]">
              Clave nueva
            </span>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                value={values.newPassword}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    newPassword: event.target.value,
                  }))
                }
                className={`h-12 w-full rounded-2xl px-4 pr-12 text-[#0f2747] ${uiFieldClass()}`}
                autoComplete="new-password"
              />
              <PasswordVisibilityButton
                visible={showNewPassword}
                onToggle={() => setShowNewPassword((current) => !current)}
              />
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[#173b68]">
              Confirmar clave
            </span>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={values.confirmPassword}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
                  }))
                }
                className={`h-12 w-full rounded-2xl px-4 pr-12 text-[#0f2747] ${uiFieldClass()}`}
                autoComplete="new-password"
              />
              <PasswordVisibilityButton
                visible={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((current) => !current)}
              />
            </div>
          </label>

          {message ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? "Guardando..." : "Guardar clave"}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-semibold text-[#0b5cab] transition hover:text-[#084a8c]"
          >
            Volver al inicio de sesión
          </button>
        </form>
      </section>
    </main>
  );
}
