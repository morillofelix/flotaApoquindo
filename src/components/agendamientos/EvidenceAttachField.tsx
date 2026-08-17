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
  fileName,
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
    <div className="rounded-2xl border border-[#9fb8d9] bg-[#f8fbff] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#173b68]">Adjuntar evidencia</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
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
        <div className="mt-2.5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Evidencia adjunta"
            src={previewSrc}
            className="size-16 shrink-0 rounded-2xl border border-[#b7cce4] object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#0f2747]">
              {fileName || "evidencia.jpg"}
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
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <label
            htmlFor={cameraInputId}
            className="flex h-11 cursor-pointer items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-2 text-center text-sm font-semibold text-[#173b68] shadow-[0_1px_2px_rgba(15,39,71,0.05)]"
          >
            {isProcessing ? "Preparando..." : "Tomar foto"}
          </label>
          <label
            htmlFor={galleryInputId}
            className="flex h-11 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-[#9fb8d9] bg-white px-2 text-center text-sm font-semibold text-[#173b68]"
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
        <p className="mt-2 text-sm text-red-600">{visibleError}</p>
      ) : null}
    </div>
  );
}
