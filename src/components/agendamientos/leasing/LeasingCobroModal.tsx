"use client";

import {
  formatLeasingBytes,
  formatLeasingFecha,
  formatLeasingMonto,
  LEASING_MEDIO_PAGO_LABELS,
  LEASING_MEDIOS_PAGO,
  parseLeasingMontoInput,
  type LeasingCuotaDto,
  type LeasingMedioPago,
} from "@/lib/leasing";
import { prepararComprobanteLeasing } from "@/lib/leasing-comprobante-client";
import { getSantiagoDateString } from "@/lib/propietario-status";
import { useState } from "react";
import {
  formatMontoInput,
  leasingFetch,
  leasingInputClass,
  leasingLabelClass,
  leasingPrimaryButton,
  leasingSecondaryButton,
  leasingTextareaClass,
  newIdempotencyKey,
} from "./leasing-ui";

type CobroResponse = {
  pagoId: string;
  duplicado: boolean;
  correo: { ok: boolean; message: string };
};

export default function LeasingCobroModal({
  leasingId,
  codigo,
  cantidadCuotas,
  cuota,
  onClose,
  onSaved,
}: {
  leasingId: string;
  codigo: string;
  cantidadCuotas: number;
  cuota: LeasingCuotaDto;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const today = getSantiagoDateString();
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [fechaPago, setFechaPago] = useState(today);
  const [monto, setMonto] = useState(formatMontoInput(String(cuota.saldo)));
  const [medioPago, setMedioPago] = useState<LeasingMedioPago>("TRANSFERENCIA");
  const [numeroOperacion, setNumeroOperacion] = useState("");
  const [banco, setBanco] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [archivo, setArchivo] = useState<{ file: File; convertido: boolean } | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const montoNumero = parseLeasingMontoInput(monto);
  const saldoRestante = cuota.saldo - montoNumero;

  async function onFileChange(file: File | undefined) {
    setError("");
    setArchivo(null);
    setIsConfirming(false);

    if (!file) {
      return;
    }

    setIsPreparing(true);

    try {
      setArchivo(await prepararComprobanteLeasing(file));
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "No se pudo preparar el comprobante.");
    } finally {
      setIsPreparing(false);
    }
  }

  function validar() {
    if (!fechaPago || fechaPago > today) {
      return "Ingresa una fecha de pago válida (no futura).";
    }

    if (montoNumero <= 0) {
      return "Ingresa el monto pagado.";
    }

    if (montoNumero > cuota.saldo) {
      return `El monto no puede superar el saldo de la cuota (${formatLeasingMonto(cuota.saldo)}).`;
    }

    if (!archivo) {
      return "Adjunta el comprobante de depósito o transferencia.";
    }

    return "";
  }

  async function registrar() {
    const validationError = validar();

    if (validationError || !archivo) {
      setError(validationError);
      setIsConfirming(false);
      return;
    }

    setError("");
    setIsSaving(true);

    const form = new FormData();
    form.set("cuotaId", cuota.id);
    form.set("fechaPago", fechaPago);
    form.set("monto", String(montoNumero));
    form.set("medioPago", medioPago);
    form.set("numeroOperacion", numeroOperacion);
    form.set("banco", banco);
    form.set("observaciones", observaciones);
    form.set("idempotencyKey", idempotencyKey);
    form.set("comprobante", archivo.file, archivo.file.name);

    try {
      const data = await leasingFetch<CobroResponse>(`/api/leasing/${leasingId}/pagos`, {
        method: "POST",
        body: form,
      });
      const base = data.duplicado ? "Este pago ya estaba registrado." : "Pago registrado.";
      const correo = data.correo.message ? ` ${data.correo.message}` : "";
      onSaved(`${base}${correo}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo registrar el pago.");
      setIsConfirming(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/45 p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leasing-cobro-title"
        className="w-full max-w-xl overflow-hidden rounded-[24px] border border-[#b7cce4] bg-white shadow-2xl"
      >
        <div className="border-b border-[#c5d8eb] bg-[#d7e7f8] px-5 py-4">
          <h2 id="leasing-cobro-title" className="font-heading text-lg font-semibold text-[#0f2747]">
            Registrar cobro
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {codigo} · Cuota {cuota.numeroCuota} de {cantidadCuotas} · Vence {formatLeasingFecha(cuota.fechaVencimiento)}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <dl className="grid grid-cols-3 gap-2 rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-3 text-xs">
            <div><dt className="text-slate-500">Monto cuota</dt><dd className="font-semibold text-[#0f2747]">{formatLeasingMonto(cuota.montoOriginal)}</dd></div>
            <div><dt className="text-slate-500">Pagado</dt><dd className="font-semibold text-[#0f2747]">{formatLeasingMonto(cuota.montoPagado)}</dd></div>
            <div><dt className="text-slate-500">Saldo</dt><dd className="font-semibold text-[#0b5cab]">{formatLeasingMonto(cuota.saldo)}</dd></div>
          </dl>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={leasingLabelClass}>Fecha efectiva del pago</span>
              <input
                type="date"
                max={today}
                value={fechaPago}
                onChange={(event) => setFechaPago(event.target.value)}
                className={leasingInputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={leasingLabelClass}>Monto pagado</span>
              <input
                inputMode="numeric"
                value={monto}
                onChange={(event) => {
                  setMonto(formatMontoInput(event.target.value));
                  setIsConfirming(false);
                }}
                className={leasingInputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={leasingLabelClass}>Medio de pago</span>
              <select
                value={medioPago}
                onChange={(event) => setMedioPago(event.target.value as LeasingMedioPago)}
                className={leasingInputClass}
              >
                {LEASING_MEDIOS_PAGO.map((medio) => (
                  <option key={medio} value={medio}>
                    {LEASING_MEDIO_PAGO_LABELS[medio]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={leasingLabelClass}>N° de operación</span>
              <input
                value={numeroOperacion}
                maxLength={80}
                onChange={(event) => setNumeroOperacion(event.target.value)}
                className={leasingInputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={leasingLabelClass}>Banco</span>
              <input
                value={banco}
                maxLength={80}
                onChange={(event) => setBanco(event.target.value)}
                className={leasingInputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={leasingLabelClass}>Observaciones</span>
              <textarea
                rows={2}
                maxLength={1000}
                value={observaciones}
                onChange={(event) => setObservaciones(event.target.value)}
                className={leasingTextareaClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={leasingLabelClass}>Comprobante (obligatorio: PDF, JPG o PNG)</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => void onFileChange(event.target.files?.[0])}
                className="text-xs text-[#0f2747] file:mr-3 file:rounded-xl file:border file:border-[#9fb8d9] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#173b68]"
              />
              {isPreparing ? <span className="text-xs text-slate-500">Preparando comprobante...</span> : null}
              {archivo ? (
                <span className="text-xs text-emerald-700">
                  {archivo.file.name} · {formatLeasingBytes(archivo.file.size)}
                  {archivo.convertido ? " · imagen convertida a PDF liviano" : ""}
                </span>
              ) : null}
            </label>
          </div>

          {montoNumero > 0 && saldoRestante > 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Pago parcial: la cuota quedará con saldo de {formatLeasingMonto(saldoRestante)}.
            </p>
          ) : null}

          {isConfirming ? (
            <p className="rounded-xl border border-[#b7cce4] bg-[#eef3f9] px-3 py-2 text-xs text-[#0f2747]">
              Vas a registrar un pago de <strong>{formatLeasingMonto(montoNumero)}</strong> en la cuota {cuota.numeroCuota}. Se enviará la confirmación por correo. ¿Confirmas?
            </p>
          ) : null}

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[#c5d8eb] px-5 py-4">
          <button type="button" onClick={onClose} disabled={isSaving} className={leasingSecondaryButton}>
            Cancelar
          </button>
          {isConfirming ? (
            <button
              type="button"
              onClick={() => void registrar()}
              disabled={isSaving}
              className={leasingPrimaryButton}
            >
              {isSaving ? "Registrando..." : "Sí, registrar pago"}
            </button>
          ) : (
            <button
              type="button"
              disabled={isPreparing}
              onClick={() => {
                const validationError = validar();
                setError(validationError);
                setIsConfirming(!validationError);
              }}
              className={leasingPrimaryButton}
            >
              Registrar pago
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
