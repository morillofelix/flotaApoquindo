"use client";

import { adminFetchInit } from "@/lib/admin-fetch";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type EvidencePeekButtonProps = {
  appointmentId: string;
  fileName?: string;
};

export default function EvidencePeekButton({
  appointmentId,
  fileName,
}: EvidencePeekButtonProps) {
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError("");

    void fetch(`/api/appointments/${appointmentId}/evidence`, {
      ...adminFetchInit,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("No se pudo abrir la evidencia.");
        }

        const blob = await response.blob();
        if (cancelled) {
          return;
        }

        setImageUrl((currentUrl) => {
          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
          }

          return URL.createObjectURL(blob);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("No se pudo abrir la evidencia.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appointmentId, open]);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0f2747]/55 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6"
            role="dialog"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-lg overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-2xl shadow-slate-900/25 sm:rounded-[24px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-[#c5d8eb] bg-[#eef3f9] px-4 py-3.5 sm:px-5 sm:py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-800 sm:text-xs">
                  Solicitud
                </p>
                <h2
                  id={titleId}
                  className="mt-1.5 font-heading text-lg font-semibold leading-tight text-[#0f2747] sm:mt-2 sm:text-xl"
                >
                  Evidencia adjunta
                </h2>
                {fileName ? (
                  <p className="mt-1 truncate text-xs text-slate-500">{fileName}</p>
                ) : null}
              </div>

              <div className="px-4 py-4 sm:px-5 sm:py-5">
                {isLoading ? (
                  <p className="rounded-2xl border border-[#c5d8eb] bg-[#f8fbff] px-4 py-8 text-center text-sm font-medium text-[#173b68]">
                    Cargando evidencia...
                  </p>
                ) : loadError ? (
                  <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                    {loadError}
                  </p>
                ) : imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="Evidencia de la solicitud"
                    src={imageUrl}
                    className="max-h-[70vh] w-full rounded-2xl border border-[#c5d8eb] object-contain bg-[#f8fbff]"
                  />
                ) : null}

                <div className="mt-5 flex justify-end">
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-teal-700 px-5 text-sm font-semibold text-white shadow-md shadow-teal-900/15 transition hover:bg-teal-800 active:translate-y-px"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        aria-label="Ver evidencia adjunta"
        title="Ver evidencia adjunta"
        onClick={() => setOpen(true)}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-2xl border border-teal-200 bg-white text-teal-800 shadow-[0_1px_2px_rgba(15,39,71,0.06)] transition hover:border-teal-400 hover:bg-teal-50"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="6.25" />
          <path d="m20 20-3.35-3.35" />
        </svg>
      </button>
      {dialog}
    </>
  );
}
