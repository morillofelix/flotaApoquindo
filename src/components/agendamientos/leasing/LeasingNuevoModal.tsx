"use client";

import {
  formatLeasingFecha,
  formatLeasingMonto,
  LEASING_MAX_CUOTAS,
  parseLeasingMontoInput,
  type LeasingCuotaPreview,
  type LeasingPropietarioResultado,
} from "@/lib/leasing";
import { getSantiagoDateString } from "@/lib/propietario-status";
import { useEffect, useMemo, useState } from "react";
import {
  formatMontoInput,
  leasingFetch,
  leasingInputClass,
  leasingJsonInit,
  leasingLabelClass,
  leasingPrimaryButton,
  leasingSecondaryButton,
  leasingTextareaClass,
} from "./leasing-ui";

type FormState = {
  monto: string;
  fechaInicio: string;
  cantidadCuotas: string;
  diaCorte: string;
  observaciones: string;
};

function initialForm(): FormState {
  return {
    monto: "",
    fechaInicio: getSantiagoDateString(),
    cantidadCuotas: "12",
    diaCorte: "5",
    observaciones: "",
  };
}

export default function LeasingNuevoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string, codigo: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<LeasingPropietarioResultado[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [seleccionado, setSeleccionado] = useState<LeasingPropietarioResultado | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [preview, setPreview] = useState<LeasingCuotaPreview[] | null>(null);
  const [error, setError] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const text = query.trim();

    if (!text) {
      setResultados([]);
      setSearchError("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      leasingFetch<{ resultados: LeasingPropietarioResultado[] }>(
        `/api/leasing/buscar-propietarios?q=${encodeURIComponent(text)}`,
        { signal: controller.signal },
      )
        .then((data) => {
          setResultados(data.resultados);
          setSearchError(data.resultados.length ? "" : "Sin resultados para esa búsqueda.");
        })
        .catch((fetchError: unknown) => {
          if (!controller.signal.aborted) {
            setSearchError(
              fetchError instanceof Error ? fetchError.message : "No se pudo buscar.",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        });
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const payload = useMemo(
    () => ({
      montoTotal: parseLeasingMontoInput(form.monto),
      fechaInicio: form.fechaInicio,
      cantidadCuotas: Number(form.cantidadCuotas),
      diaCorte: Number(form.diaCorte),
    }),
    [form.cantidadCuotas, form.diaCorte, form.fechaInicio, form.monto],
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));

    if (!("observaciones" in patch)) {
      setPreview(null);
    }
  }

  async function calcular() {
    setError("");
    setIsCalculating(true);

    try {
      const data = await leasingFetch<{ cuotas: LeasingCuotaPreview[] }>(
        "/api/leasing/simular",
        leasingJsonInit("POST", payload),
      );
      setPreview(data.cuotas);
    } catch (calcError) {
      setPreview(null);
      setError(calcError instanceof Error ? calcError.message : "No se pudo calcular.");
    } finally {
      setIsCalculating(false);
    }
  }

  async function guardar(confirmar: boolean) {
    if (!seleccionado || !preview) {
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const data = await leasingFetch<{ id: string; numero: number }>(
        "/api/leasing",
        leasingJsonInit("POST", {
          ...payload,
          propietarioId: seleccionado.id,
          observaciones: form.observaciones,
          confirmar,
        }),
      );
      onCreated(data.id, `LSG-${String(data.numero).padStart(6, "0")}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo crear el leasing.");
    } finally {
      setIsSaving(false);
    }
  }

  const totalPreview = preview?.reduce((sum, cuota) => sum + cuota.montoOriginal, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leasing-nuevo-title"
        className="w-full max-w-4xl overflow-hidden rounded-[24px] border border-[#b7cce4] bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#c5d8eb] bg-[#d7e7f8] px-5 py-4">
          <div>
            <h2 id="leasing-nuevo-title" className="font-heading text-lg font-semibold text-[#0f2747]">
              Nuevo leasing
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Busca el propietario por móvil, razón social o RUT. Sus datos solo se consultan; no se modifican.
            </p>
          </div>
          <button type="button" onClick={onClose} className={leasingSecondaryButton}>
            Cerrar
          </button>
        </div>

        <div className="space-y-5 p-5">
          {!seleccionado ? (
            <section className="space-y-3">
              <label className="flex flex-col gap-1.5">
                <span className={leasingLabelClass}>Buscar propietario</span>
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ej. 125, Transportes Pérez o 77.713.814-6"
                  className={leasingInputClass}
                />
              </label>
              {isSearching ? <p className="text-xs text-slate-500">Buscando...</p> : null}
              {searchError ? <p className="text-xs text-slate-500">{searchError}</p> : null}
              {resultados.length ? (
                <div className="max-h-[45dvh] divide-y divide-[#c5d8eb] overflow-auto rounded-2xl border border-[#b7cce4]">
                  {resultados.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!item.elegible}
                      onClick={() => setSeleccionado(item)}
                      className="grid w-full grid-cols-[70px_1fr_130px] items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="font-semibold text-[#0b5cab]">Móvil {item.movil || "—"}</span>
                      <span>
                        <strong className="block text-[#0f2747]">{item.razonSocial}</strong>
                        <span className="text-slate-500">
                          {item.elegible
                            ? item.leasingsVigentes
                              ? `Tiene ${item.leasingsVigentes} leasing vigente(s)`
                              : item.nombre || item.email
                            : item.motivoNoElegible}
                        </span>
                      </span>
                      <span className="text-right text-slate-600">{item.rut || "Sin RUT"}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b5cab]">
                  Propietario seleccionado (solo lectura)
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSeleccionado(null);
                    setPreview(null);
                  }}
                  className="text-xs font-semibold text-[#0b5cab] hover:underline"
                >
                  Cambiar
                </button>
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <div><dt className="text-slate-500">Móvil</dt><dd className="font-semibold text-[#0f2747]">{seleccionado.movil}</dd></div>
                <div><dt className="text-slate-500">Razón social</dt><dd className="font-semibold text-[#0f2747]">{seleccionado.razonSocial}</dd></div>
                <div><dt className="text-slate-500">RUT</dt><dd className="font-semibold text-[#0f2747]">{seleccionado.rut}</dd></div>
                <div><dt className="text-slate-500">Nombre</dt><dd className="text-[#0f2747]">{seleccionado.nombre || "—"}</dd></div>
                <div><dt className="text-slate-500">Correo</dt><dd className="text-[#0f2747]">{seleccionado.email || "Sin correo"}</dd></div>
                <div><dt className="text-slate-500">Estado</dt><dd className="capitalize text-[#0f2747]">{seleccionado.status}</dd></div>
              </dl>
              {seleccionado.leasingsVigentes ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Este propietario ya tiene {seleccionado.leasingsVigentes} leasing vigente(s). Verifica antes de crear otro.
                </p>
              ) : null}
            </section>
          )}

          {seleccionado ? (
            <section className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-5">
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className={leasingLabelClass}>Monto total del leasing</span>
                  <input
                    inputMode="numeric"
                    value={form.monto}
                    onChange={(event) => updateForm({ monto: formatMontoInput(event.target.value) })}
                    placeholder="$ 0"
                    className={leasingInputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={leasingLabelClass}>Fecha de inicio</span>
                  <input
                    type="date"
                    value={form.fechaInicio}
                    onChange={(event) => updateForm({ fechaInicio: event.target.value })}
                    className={leasingInputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={leasingLabelClass}>Cantidad de cuotas</span>
                  <input
                    type="number"
                    min={1}
                    max={LEASING_MAX_CUOTAS}
                    value={form.cantidadCuotas}
                    onChange={(event) => updateForm({ cantidadCuotas: event.target.value })}
                    className={leasingInputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={leasingLabelClass}>Día de corte</span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.diaCorte}
                    onChange={(event) => updateForm({ diaCorte: event.target.value })}
                    className={leasingInputClass}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-5">
                <label className="flex flex-col gap-1.5">
                  <span className={leasingLabelClass}>Periodicidad</span>
                  <input value="Mensual" disabled className={leasingInputClass} />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-4">
                  <span className={leasingLabelClass}>Observaciones</span>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={form.observaciones}
                    onChange={(event) => updateForm({ observaciones: event.target.value })}
                    className={leasingTextareaClass}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-500">
                La primera cuota vence el día de corte del mes siguiente a la fecha de inicio. Si el mes no tiene ese día, se usa el último día del mes. La diferencia por redondeo se suma a la última cuota.
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void calcular()}
                  disabled={isCalculating}
                  className={leasingSecondaryButton}
                >
                  {isCalculating ? "Calculando..." : "Calcular cuotas"}
                </button>
              </div>

              {preview ? (
                <div className="overflow-hidden rounded-2xl border border-[#b7cce4]">
                  <div className="grid grid-cols-3 bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0f2747]">
                    <span>Cuota</span>
                    <span>Vencimiento</span>
                    <span className="text-right">Monto</span>
                  </div>
                  <div className="max-h-[35dvh] divide-y divide-[#c5d8eb] overflow-auto">
                    {preview.map((cuota) => (
                      <div key={cuota.numeroCuota} className="grid grid-cols-3 px-3 py-1.5 text-xs text-[#0f2747]">
                        <span>{cuota.numeroCuota} de {preview.length}</span>
                        <span>{formatLeasingFecha(cuota.fechaVencimiento)}</span>
                        <span className="text-right font-semibold">{formatLeasingMonto(cuota.montoOriginal)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 border-t border-[#b7cce4] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#0f2747]">
                    <span>Total</span>
                    <span />
                    <span className="text-right">{formatLeasingMonto(totalPreview)}</span>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[#c5d8eb] px-5 py-4">
          <button type="button" onClick={onClose} className={leasingSecondaryButton}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!seleccionado || !preview || isSaving}
            onClick={() => void guardar(false)}
            className={leasingSecondaryButton}
          >
            Guardar borrador
          </button>
          <button
            type="button"
            disabled={!seleccionado || !preview || isSaving}
            onClick={() => void guardar(true)}
            className={leasingPrimaryButton}
          >
            {isSaving ? "Guardando..." : "Crear y activar"}
          </button>
        </div>
      </div>
    </div>
  );
}
