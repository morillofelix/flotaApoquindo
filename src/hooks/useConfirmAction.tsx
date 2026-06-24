"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConfirmActionOptions = {
  title?: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type ConfirmState = ConfirmActionOptions & {
  open: boolean;
  resolve?: (value: boolean) => void;
};

const initialState: ConfirmState = {
  open: false,
  message: "",
};

function ConfirmActionDialog({
  state,
  onConfirm,
  onCancel,
}: {
  state: ConfirmState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!state.open) {
      return;
    }

    confirmButtonRef.current?.focus();

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

  return (
    <div
      aria-labelledby="confirm-action-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f2747]/55 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      onClick={onCancel}
    >
      <div
        className={`w-full max-w-md overflow-hidden rounded-[24px] border shadow-2xl shadow-slate-900/25 ${
          isDanger
            ? "border-red-200 bg-white"
            : "border-[#b7cce4] bg-white"
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
            Confirmación requerida
          </p>
          <h2
            id="confirm-action-title"
            className={`mt-2 font-heading text-xl font-semibold leading-tight ${
              isDanger ? "text-red-900" : "text-[#0f2747]"
            }`}
          >
            {state.title ?? "¿Estás seguro?"}
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

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-5 text-sm font-semibold text-[#173b68] transition hover:bg-[#f8fbff]"
            >
              {state.cancelLabel ?? "Cancelar"}
            </button>
            <button
              ref={confirmButtonRef}
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

export function useConfirmAction() {
  const [state, setState] = useState<ConfirmState>(initialState);

  const confirm = useCallback((options: ConfirmActionOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({
        open: true,
        title: options.title,
        message: options.message,
        detail: options.detail,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        tone: options.tone ?? "default",
        resolve,
      });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setState((current) => {
      current.resolve?.(value);
      return initialState;
    });
  }, []);

  const dialog = (
    <ConfirmActionDialog
      state={state}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return { confirm, dialog };
}
