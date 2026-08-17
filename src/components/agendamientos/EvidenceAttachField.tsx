"use client";

import { compressAppointmentEvidenceFile } from "@/lib/appointment-evidence-client";
import { useId, useState } from "react";

type EvidenceAttachFieldProps = {
  required: boolean;
  data: string;
  fileName: string;
  mimeType: string;
  error?: string;
  onChange: (next: { data: string; fileName: string; mimeType: string }) => void;
  onBlur?: () => void;
};

export default function EvidenceAttachField({
  required,
  data,
  mimeType,
  error,
  onChange,
  onBlur,
}: EvidenceAttachFieldProps) {
  const cameraInputId = useId();
  const galleryInputId = useId();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState("");
  const previewSrc = data
    ? `data:${mimeType || "image/jpeg"};base64,${data}`
    : "";
  const visibleError = error || processError;

  async function handleFile(file: File | undefined) {
    setProcessError("");

    if (!file) {
      return;
    }

    setIsProcessing(true);

    try {
      const compressed = await compressAppointmentEvidenceFile(file);
      onChange(compressed);
    } catch (caught) {
      onChange({ data: "", fileName: "", mimeType: "" });
      setProcessError(
        caught instanceof Error && caught.message
          ? caught.message
          : "No se pudo adjuntar la foto.",
      );
    } finally {
      setIsProcessing(false);
      onBlur?.();
    }
  }

  function resetInput(input: HTMLInputElement | null) {
    if (input) {
      input.value = "";
    }
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#9fb8d9] bg-[#f8fbff] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold text-[#173b68]">
          Adjuntar evidencia
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
            required
              ? "bg-amber-100 text-amber-800"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {required ? "Obligatorio" : "Opcional"}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">
        Toma la foto ahora o elige una de la galería.
      </p>

      {previewSrc ? (
        <div className="mt-2.5 flex min-w-0 items-center gap-3 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Evidencia adjunta"
            src={previewSrc}
            className="size-14 shrink-0 rounded-2xl border border-[#b7cce4] object-cover sm:size-16"
          />
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="truncate text-xs font-semibold text-[#0f2747]">
              Foto lista
            </p>
            <button
              type="button"
              onClick={() => {
                setProcessError("");
                onChange({ data: "", fileName: "", mimeType: "" });
                onBlur?.();
              }}
              className="mt-1 text-[11px] font-semibold text-[#0b5cab] underline-offset-2 hover:underline"
            >
              Quitar foto
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 grid min-w-0 grid-cols-2 gap-2">
          <label
            htmlFor={cameraInputId}
            className="flex h-11 min-w-0 cursor-pointer items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-2 text-center text-[13px] font-semibold leading-4 text-[#173b68] shadow-[0_1px_2px_rgba(15,39,71,0.05)] sm:text-sm"
          >
            {isProcessing ? "Preparando..." : "Tomar foto"}
          </label>
          <label
            htmlFor={galleryInputId}
            className="flex h-11 min-w-0 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-[#9fb8d9] bg-white px-2 text-center text-[13px] font-semibold leading-4 text-[#173b68] sm:text-sm"
          >
            Galería
          </label>
        </div>
      )}

      <input
        id={cameraInputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={isProcessing}
        onChange={(event) => {
          const file = event.target.files?.[0];
          resetInput(event.currentTarget);
          void handleFile(file);
        }}
      />
      <input
        id={galleryInputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={isProcessing}
        onChange={(event) => {
          const file = event.target.files?.[0];
          resetInput(event.currentTarget);
          void handleFile(file);
        }}
      />

      {visibleError ? (
        <p className="mt-2 break-words text-sm text-red-600">{visibleError}</p>
      ) : null}
    </div>
  );
}
