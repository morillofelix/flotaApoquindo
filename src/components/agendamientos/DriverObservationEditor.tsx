"use client";

import { adminFetchInit } from "@/lib/admin-fetch";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DriverObservationEditorProps = {
  driverOwnerId: string;
  vehicleNumber: string;
  driverName: string;
  observation: string;
  onSaved: (observation: string) => void;
};

export default function DriverObservationEditor({
  driverOwnerId,
  vehicleNumber,
  driverName,
  observation,
  onSaved,
}: DriverObservationEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(observation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setDraft(observation);
    setError("");
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, observation, busy]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/driver-owners/observation", {
        ...adminFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverOwnerId,
          observation: draft,
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message ?? "No se pudo guardar.");
      }
      const data = (await response.json()) as { observation?: string };
      const saved = data.observation ?? draft.trim();
      onSaved(saved);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo guardar.",
      );
    } finally {
      setBusy(false);
    }
  }

  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0f2747]/55 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6"
            role="dialog"
            onClick={() => {
              if (!busy) setOpen(false);
            }}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-2xl shadow-slate-900/25 sm:rounded-[24px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-[#c5d8eb] bg-[#eef3f9] px-4 py-3.5 sm:px-5 sm:py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800 sm:text-xs">
                  Observación del conductor
                </p>
                <h2
                  id={titleId}
                  className="mt-1.5 font-heading text-lg font-semibold leading-tight text-[#0f2747] sm:mt-2 sm:text-xl"
                >
                  Móvil {vehicleNumber}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{driverName}</p>
              </div>

              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Observación
                  </span>
                  <textarea
                    rows={5}
                    value={draft}
                    disabled={busy}
                    placeholder="Restricciones, alertas operativas, comentarios…"
                    onChange={(event) => setDraft(event.target.value)}
                    className="rounded-2xl border border-[#c5d8eb] bg-[#f8fbff] px-4 py-3 text-sm leading-6 text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 disabled:opacity-60"
                  />
                </label>
                {error ? (
                  <p className="mt-2 text-xs font-medium text-red-700">{error}</p>
                ) : null}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-5 text-sm font-semibold text-[#173b68]"
                  >
                    Cancelar
                  </button>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-amber-700 px-5 text-sm font-semibold text-white shadow-md transition hover:bg-amber-800 disabled:opacity-60"
                  >
                    {busy ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (!observation.trim()) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Ver observación del conductor"
        title="Ver observación del conductor"
        onClick={() => setOpen(true)}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-800 shadow-[0_1px_2px_rgba(15,39,71,0.06)] transition hover:border-amber-400 hover:bg-amber-50"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-[16px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      </button>
      {dialog}
    </>
  );
}
