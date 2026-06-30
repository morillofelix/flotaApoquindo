"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ObservationPromptOptions = {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  minLength?: number;
  tone?: "default" | "danger";
};

type PromptState = ObservationPromptOptions & {
  open: boolean;
  value: string;
  error: string;
  resolve?: (value: string | null) => void;
};

const initialState: PromptState = {
  open: false,
  title: "",
  message: "",
  value: "",
  error: "",
};

function ObservationPromptDialog({
  state,
  onConfirm,
  onCancel,
  onChange,
}: {
  state: PromptState;
  onConfirm: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!state.open) {
      return;
    }

    inputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.open, onCancel]);

  if (!state.open) {
    return null;
  }

  const isDanger = state.tone === "danger";
  const minLength = state.minLength ?? 5;

  return (
    <div
      aria-labelledby="observation-prompt-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f2747]/55 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      onClick={onCancel}
    >
      <div
        className={`w-full max-w-md overflow-hidden rounded-[24px] border shadow-2xl shadow-slate-900/25 ${
          isDanger ? "border-red-200 bg-white" : "border-[#b7cce4] bg-white"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`border-b px-5 py-4 ${
            isDanger
              ? "border-red-100 bg-red-50"
              : "border-[#c5d8eb] bg-[#eef3f9]"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-[0.16em] ${
              isDanger ? "text-red-700" : "text-[#0b5cab]"
            }`}
          >
            Observación requerida
          </p>
          <h2
            id="observation-prompt-title"
            className={`mt-2 font-heading text-xl font-semibold leading-tight ${
              isDanger ? "text-red-900" : "text-[#0f2747]"
            }`}
          >
            {state.title}
          </h2>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm font-medium leading-6 text-[#0f2747]">
            {state.message}
          </p>

          {state.detail ? (
            <p
              className={`mt-3 rounded-2xl px-4 py-3 text-sm leading-6 ${
                isDanger
                  ? "border border-red-100 bg-red-50 text-red-900"
                  : "border border-[#c5d8eb] bg-[#f8fbff] text-slate-700"
              }`}
            >
              {state.detail}
            </p>
          ) : null}

          <label className="mt-4 flex flex-col gap-2">
            <span className="text-sm font-semibold text-[#173b68]">
              Motivo <span className="text-red-600">*</span>
            </span>
            <textarea
              ref={inputRef}
              value={state.value}
              onChange={(event) => onChange(event.target.value)}
              rows={4}
              placeholder={
                state.placeholder ??
                "Indica el motivo de esta acción (obligatorio)."
              }
              className="rounded-2xl border border-[#9fb8d9] bg-white px-3 py-2 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
            />
          </label>

          {state.error ? (
            <p className="mt-2 text-sm font-medium text-red-600">{state.error}</p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Mínimo {minLength} caracteres.
            </p>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-5 text-sm font-semibold text-[#173b68] transition hover:bg-[#f8fbff]"
            >
              {state.cancelLabel ?? "Cancelar"}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold text-white shadow-md transition active:translate-y-px ${
                isDanger
                  ? "bg-red-600 hover:bg-red-700 shadow-red-900/20"
                  : "bg-[#0b5cab] hover:bg-[#084a8c] shadow-blue-900/15"
              }`}
            >
              {state.confirmLabel ?? "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useObservationPrompt() {
  const [state, setState] = useState<PromptState>(initialState);

  const promptObservation = useCallback((options: ObservationPromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setState({
        open: true,
        title: options.title,
        message: options.message,
        detail: options.detail,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        placeholder: options.placeholder,
        minLength: options.minLength ?? 5,
        tone: options.tone ?? "default",
        value: "",
        error: "",
        resolve,
      });
    });
  }, []);

  const close = useCallback((value: string | null) => {
    setState((current) => {
      current.resolve?.(value);
      return initialState;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((current) => {
      const minLength = current.minLength ?? 5;
      const trimmed = current.value.trim();

      if (trimmed.length < minLength) {
        return {
          ...current,
          error: `Ingresa un motivo de al menos ${minLength} caracteres.`,
        };
      }

      current.resolve?.(trimmed);
      return initialState;
    });
  }, []);

  const dialog = (
    <ObservationPromptDialog
      state={state}
      onConfirm={handleConfirm}
      onCancel={() => close(null)}
      onChange={(value) =>
        setState((current) => ({
          ...current,
          value,
          error: "",
        }))
      }
    />
  );

  return { promptObservation, dialog };
}
