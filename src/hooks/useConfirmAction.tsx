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

export type PromptNoteOptions = {
  title?: string;
  message: string;
  detail?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  minLength?: number;
  maxLength?: number;
};

type PromptNoteState = PromptNoteOptions & {
  open: boolean;
  resolve?: (value: { submitted: true; note: string } | null) => void;
};

const initialPromptState: PromptNoteState = {
  open: false,
  message: "",
};

export function useConfirmAction() {
  const [state, setState] = useState<ConfirmState>(initialState);
  const [promptState, setPromptState] = useState<PromptNoteState>(initialPromptState);

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

  const promptNote = useCallback((options: PromptNoteOptions) => {
    return new Promise<{ submitted: true; note: string } | null>((resolve) => {
      setPromptState({
        open: true,
        title: options.title,
        message: options.message,
        detail: options.detail,
        placeholder: options.placeholder,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        minLength: options.minLength,
        maxLength: options.maxLength,
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

  const closePrompt = useCallback((value: { submitted: true; note: string } | null) => {
    setPromptState((current) => {
      current.resolve?.(value);
      return initialPromptState;
    });
  }, []);

  const dialog = (
    <>
      <ConfirmActionDialog
        state={state}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
      <PromptNoteDialog
        state={promptState}
        onConfirm={(note) => closePrompt({ submitted: true, note })}
        onCancel={() => closePrompt(null)}
      />
    </>
  );

  return { confirm, promptNote, dialog };
}

function PromptNoteDialog({
  state,
  onConfirm,
  onCancel,
}: {
  state: PromptNoteState;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState("");
  const maxLength = state.maxLength ?? 400;
  const trimmed = note.trim();

  useEffect(() => {
    if (!state.open) {
      return;
    }

    setNote("");
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [state.open, onCancel]);

  if (!state.open) {
    return null;
  }

  return (
    <div
      aria-labelledby="prompt-note-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0f2747]/55 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6"
      role="dialog"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[22px] border border-red-200 bg-white shadow-2xl shadow-slate-900/25 sm:rounded-[24px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-red-100 bg-red-50 px-4 py-3.5 sm:px-5 sm:py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700 sm:text-xs">
            Motivo del rechazo
          </p>
          <h2
            id="prompt-note-title"
            className="mt-1.5 font-heading text-lg font-semibold leading-tight text-red-900 sm:mt-2 sm:text-xl"
          >
            {state.title ?? "¿Por qué se rechaza?"}
          </h2>
        </div>

        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <p className="text-sm font-medium leading-6 text-[#0f2747]">
            {state.message}
          </p>

          {state.detail ? (
            <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-900 sm:px-4 sm:py-3 sm:text-sm sm:leading-6">
              {state.detail}
            </p>
          ) : null}

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-red-900 sm:text-[11px]">
              Mensaje para el conductor (opcional)
            </span>
            <textarea
              ref={textareaRef}
              value={note}
              onChange={(event) => {
                setNote(event.target.value.slice(0, maxLength));
              }}
              rows={4}
              maxLength={maxLength}
              placeholder={
                state.placeholder ??
                "Ej: La fecha no está disponible. Solicite otro día."
              }
              className="min-h-[6.5rem] w-full resize-none rounded-2xl border border-red-200 bg-white px-3 py-2.5 text-sm leading-6 text-[#0f2747] outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-200"
            />
            <span className="text-[10px] text-slate-500">
              Opcional · {trimmed.length}/{maxLength}
            </span>
          </label>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-5 text-sm font-semibold text-[#173b68] transition hover:bg-[#f8fbff]"
            >
              {state.cancelLabel ?? "Volver"}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(trimmed)}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white shadow-md shadow-red-900/20 transition hover:bg-red-700 active:translate-y-px disabled:opacity-60"
            >
              {state.confirmLabel ?? "Rechazar solicitud"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
