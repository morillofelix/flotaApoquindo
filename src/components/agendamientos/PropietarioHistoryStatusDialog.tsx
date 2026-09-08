"use client";

import {
  formatPropietarioStatusLabel,
  getPropietarioStatusSolidSelectClassName,
  PROPIETARIO_STATUS_OPTIONS,
  type PropietarioStatus,
} from "@/lib/propietario-status";
import { uiFieldClass } from "@/lib/ui-borders";
import { useEffect, useState } from "react";

export type HistoryStatusChangeInput = {
  status: PropietarioStatus;
  reason: string;
  days: number;
};

export default function PropietarioHistoryStatusDialog({
  open,
  propietarioName,
  currentStatus,
  isSaving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  propietarioName: string;
  currentStatus: PropietarioStatus;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: HistoryStatusChangeInput) => void;
}) {
  const [status, setStatus] = useState<PropietarioStatus>(currentStatus);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setStatus(currentStatus);
    setReason("");
    setDays(1);
    setError("");
  }, [currentStatus, open]);

  if (!open) {
    return null;
  }

  const requiresReason =
    status === "activo" ||
    status === "inactivo" ||
    status === "desvinculado";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status === currentStatus) {
      setError("Selecciona un Estado diferente al actual.");
      return;
    }

    if (requiresReason && reason.trim().length < 5) {
      setError("Ingresa un motivo de al menos 5 caracteres.");
      return;
    }

    if (status === "desvinculado" && days < 1) {
      setError("La duración debe ser de al menos 1 día.");
      return;
    }

    onSubmit({ status, reason: reason.trim(), days });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-status-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f2747]/55 px-3 py-6 backdrop-blur-[2px]"
      onClick={isSaving ? undefined : onClose}
    >
      <form
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-[24px] border border-[#b7cce4] bg-white"
      >
        <div className="border-b border-[#c5d8eb] bg-[#eef3f9] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0b5cab]">
            Cambio controlado
          </p>
          <h2
            id="history-status-title"
            className="mt-1 font-heading text-xl font-semibold text-[#0f2747]"
          >
            Cambiar Estado del propietario
          </h2>
          <p className="mt-1 text-sm text-slate-600">{propietarioName}</p>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <div className="rounded-2xl border border-[#c5d8eb] bg-[#f8fbff] px-4 py-3 text-sm text-[#173b68]">
            Estado actual:{" "}
            <strong>{formatPropietarioStatusLabel(currentStatus)}</strong>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[#173b68]">
              Nuevo Estado
            </span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as PropietarioStatus);
                setError("");
              }}
              className={`h-11 rounded-2xl px-4 ${getPropietarioStatusSolidSelectClassName(status)}`}
            >
              {PROPIETARIO_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {requiresReason ? (
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-[#173b68]">
                Motivo
              </span>
              <textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError("");
                }}
                rows={4}
                className={`rounded-2xl px-4 py-3 ${uiFieldClass()}`}
                placeholder="Describe el motivo del cambio"
              />
            </label>
          ) : null}

          {status === "desvinculado" ? (
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-[#173b68]">
                Duración en días
              </span>
              <input
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(event) => {
                  setDays(Number.parseInt(event.target.value, 10) || 0);
                  setError("");
                }}
                className={`h-11 rounded-2xl px-4 ${uiFieldClass()}`}
              />
            </label>
          ) : null}

          {error ? (
            <p className="text-sm font-semibold text-red-600">{error}</p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-5 text-sm font-semibold text-[#173b68] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white transition hover:bg-[#084a8c] disabled:bg-slate-300"
            >
              {isSaving ? "Guardando..." : "Continuar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
