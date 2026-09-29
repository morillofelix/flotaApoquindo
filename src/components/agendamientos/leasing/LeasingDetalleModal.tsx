"use client";

import {
  formatLeasingFecha,
  formatLeasingMonto,
  getCuotaEstadoBadgeClass,
  getLeasingEstadoBadgeClass,
  LEASING_CUOTA_ESTADO_LABELS,
  LEASING_ESTADO_LABELS,
  LEASING_MEDIO_PAGO_LABELS,
  LEASING_NOTIFICACION_LABELS,
  type LeasingCuotaDto,
  type LeasingDetalleDto,
  type LeasingPagoDto,
} from "@/lib/leasing";
import { Fragment, useCallback, useEffect, useState } from "react";
import LeasingCobroModal from "./LeasingCobroModal";
import {
  leasingBadgeClass,
  leasingDangerButton,
  leasingFetch,
  leasingJsonInit,
  leasingPrimaryButton,
  leasingSecondaryButton,
  leasingTextareaClass,
} from "./leasing-ui";

type MotivoAccion =
  | { tipo: "suspender" | "anular"; titulo: string }
  | { tipo: "anularPago"; titulo: string; pagoId: string };

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

function CorreoEstado({ pago }: { pago: LeasingPagoDto }) {
  const ultimo = pago.correos[0];

  if (!ultimo) {
    return <span className="text-slate-400">Sin correo</span>;
  }

  const color =
    ultimo.estado === "ENVIADO"
      ? "text-emerald-700"
      : ultimo.estado === "FALLIDO"
        ? "text-red-700"
        : "text-amber-700";

  return (
    <span className={color} title={ultimo.ultimoError || undefined}>
      Correo {LEASING_NOTIFICACION_LABELS[ultimo.estado].toLowerCase()}
      {ultimo.estado === "ENVIADO" ? ` · ${formatDateTime(ultimo.enviadoAt)}` : ""}
      {ultimo.ultimoError ? ` · ${ultimo.ultimoError}` : ""}
    </span>
  );
}

export default function LeasingDetalleModal({
  leasingId,
  canCobrar,
  canAdministrar,
  onClose,
  onChanged,
}: {
  leasingId: string;
  canCobrar: boolean;
  canAdministrar: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detalle, setDetalle] = useState<LeasingDetalleDto | null>(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [cobroCuota, setCobroCuota] = useState<LeasingCuotaDto | null>(null);
  const [motivoAccion, setMotivoAccion] = useState<MotivoAccion | null>(null);
  const [motivo, setMotivo] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDetalle(await leasingFetch<LeasingDetalleDto>(`/api/leasing/${leasingId}`));
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudo cargar el leasing.");
    }
  }, [leasingId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function ejecutar(action: () => Promise<unknown>, okMessage: string) {
    setIsWorking(true);
    setActionError("");
    setMessage("");

    try {
      const result = await action();
      setMessage(typeof result === "string" && result ? result : okMessage);
      await cargar();
      onChanged();
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo completar la acción.");
      return false;
    } finally {
      setIsWorking(false);
    }
  }

  function cambiarEstado(accion: "confirmar" | "reactivar" | "suspender" | "anular", motivoTexto = "") {
    const mensajes = {
      confirmar: "Leasing activado.",
      reactivar: "Leasing reactivado.",
      suspender: "Leasing suspendido.",
      anular: "Leasing anulado.",
    };

    return ejecutar(
      () =>
        leasingFetch(`/api/leasing/${leasingId}`, leasingJsonInit("PATCH", { accion, motivo: motivoTexto })),
      mensajes[accion],
    );
  }

  async function confirmarMotivo() {
    if (!motivoAccion) {
      return;
    }

    const texto = motivo.trim();

    if (texto.length < 5) {
      setActionError("Indica un motivo de al menos 5 caracteres.");
      return;
    }

    const ok =
      motivoAccion.tipo === "anularPago"
        ? await ejecutar(
            () =>
              leasingFetch(
                `/api/leasing/pagos/${motivoAccion.pagoId}/anular`,
                leasingJsonInit("POST", { motivo: texto }),
              ),
            "Pago anulado. La cuota y el saldo se recalcularon.",
          )
        : await cambiarEstado(motivoAccion.tipo, texto);

    if (ok) {
      setMotivoAccion(null);
      setMotivo("");
    }
  }

  function reenviarCorreo(pagoId: string) {
    return ejecutar(async () => {
      const data = await leasingFetch<{ message: string }>(
        `/api/leasing/pagos/${pagoId}/reenviar-correo`,
        { method: "POST" },
      );
      return data.message;
    }, "Correo reenviado.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leasing-detalle-title"
        className="w-full max-w-6xl overflow-hidden rounded-[24px] border border-[#b7cce4] bg-white shadow-2xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#c5d8eb] bg-[#d7e7f8] px-5 py-4">
          <div>
            <h2 id="leasing-detalle-title" className="font-heading text-lg font-semibold text-[#0f2747]">
              {detalle ? `${detalle.codigo} · Móvil ${detalle.movil}` : "Leasing"}
            </h2>
            {detalle ? (
              <p className="mt-1 text-xs text-slate-600">
                {detalle.razonSocial} · {detalle.rut}
                {!detalle.vinculado ? " · (propietario desvinculado, se muestran datos guardados)" : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {detalle?.estado === "BORRADOR" && canCobrar ? (
              <button type="button" disabled={isWorking} onClick={() => void cambiarEstado("confirmar")} className={leasingPrimaryButton}>
                Confirmar y activar
              </button>
            ) : null}
            {detalle?.estado === "ACTIVO" && canAdministrar ? (
              <button
                type="button"
                disabled={isWorking}
                onClick={() => setMotivoAccion({ tipo: "suspender", titulo: "Suspender leasing" })}
                className={leasingSecondaryButton}
              >
                Suspender
              </button>
            ) : null}
            {detalle?.estado === "SUSPENDIDO" && canAdministrar ? (
              <button type="button" disabled={isWorking} onClick={() => void cambiarEstado("reactivar")} className={leasingSecondaryButton}>
                Reactivar
              </button>
            ) : null}
            {detalle && ["BORRADOR", "ACTIVO", "SUSPENDIDO"].includes(detalle.estado) && canAdministrar ? (
              <button
                type="button"
                disabled={isWorking}
                onClick={() => setMotivoAccion({ tipo: "anular", titulo: "Anular leasing" })}
                className={leasingDangerButton}
              >
                Anular
              </button>
            ) : null}
            <button type="button" onClick={onClose} className={leasingSecondaryButton}>
              Cerrar
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {loadError ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
          ) : null}
          {message ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
          ) : null}
          {actionError && !motivoAccion ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
          ) : null}

          {!detalle && !loadError ? <p className="text-sm text-slate-500">Cargando...</p> : null}

          {detalle ? (
            <>
              <dl className="grid gap-3 rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-4 text-xs sm:grid-cols-4 lg:grid-cols-8">
                <div><dt className="text-slate-500">Estado</dt><dd><span className={`${leasingBadgeClass} ${getLeasingEstadoBadgeClass(detalle.estadoVisible)}`}>{LEASING_ESTADO_LABELS[detalle.estadoVisible]}</span></dd></div>
                <div><dt className="text-slate-500">Monto total</dt><dd className="font-semibold text-[#0f2747]">{formatLeasingMonto(detalle.montoTotal)}</dd></div>
                <div><dt className="text-slate-500">Pagado</dt><dd className="font-semibold text-emerald-700">{formatLeasingMonto(detalle.totalPagado)}</dd></div>
                <div><dt className="text-slate-500">Saldo</dt><dd className="font-semibold text-[#0b5cab]">{formatLeasingMonto(detalle.saldo)}</dd></div>
                <div><dt className="text-slate-500">Cuotas</dt><dd className="font-semibold text-[#0f2747]">{detalle.cuotasPagadas} de {detalle.cantidadCuotas} pagadas</dd></div>
                <div><dt className="text-slate-500">Inicio</dt><dd className="text-[#0f2747]">{formatLeasingFecha(detalle.fechaInicio)}</dd></div>
                <div><dt className="text-slate-500">Día de corte</dt><dd className="text-[#0f2747]">{detalle.diaCorte}</dd></div>
                <div><dt className="text-slate-500">Correo propietario</dt><dd className="break-all text-[#0f2747]">{detalle.propietarioEmail || "Sin correo"}</dd></div>
              </dl>
              {detalle.observaciones || detalle.motivoEstado ? (
                <div className="space-y-1 text-xs text-slate-600">
                  {detalle.observaciones ? <p><strong>Observaciones:</strong> {detalle.observaciones}</p> : null}
                  {detalle.motivoEstado ? <p><strong>Motivo del estado:</strong> {detalle.motivoEstado}</p> : null}
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-2xl border border-[#b7cce4]">
                <table className="w-full min-w-[820px] text-xs">
                  <thead className="bg-[#d7e7f8] text-[10px] uppercase tracking-[0.12em] text-[#0f2747]">
                    <tr>
                      <th className="px-3 py-2 text-left">Cuota</th>
                      <th className="px-3 py-2 text-left">Vencimiento</th>
                      <th className="px-3 py-2 text-right">Monto</th>
                      <th className="px-3 py-2 text-right">Pagado</th>
                      <th className="px-3 py-2 text-right">Saldo</th>
                      <th className="px-3 py-2 text-left">Estado</th>
                      <th className="px-3 py-2 text-left">Último pago</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c5d8eb]">
                    {detalle.cuotas.map((cuota) => (
                      <Fragment key={cuota.id}>
                        <tr className="text-[#0f2747]">
                          <td className="px-3 py-2 font-semibold">{cuota.numeroCuota} de {detalle.cantidadCuotas}</td>
                          <td className="px-3 py-2">{formatLeasingFecha(cuota.fechaVencimiento)}</td>
                          <td className="px-3 py-2 text-right">{formatLeasingMonto(cuota.montoOriginal)}</td>
                          <td className="px-3 py-2 text-right">{formatLeasingMonto(cuota.montoPagado)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatLeasingMonto(cuota.saldo)}</td>
                          <td className="px-3 py-2">
                            <span className={`${leasingBadgeClass} ${getCuotaEstadoBadgeClass(cuota.estadoVisible)}`}>
                              {LEASING_CUOTA_ESTADO_LABELS[cuota.estadoVisible]}
                            </span>
                          </td>
                          <td className="px-3 py-2">{formatLeasingFecha(cuota.fechaUltimoPago)}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1.5">
                              {cuota.pagos.length ? (
                                <button
                                  type="button"
                                  onClick={() => setExpandida((current) => (current === cuota.id ? null : cuota.id))}
                                  className="rounded-xl border border-[#9fb8d9] px-2.5 py-1 font-semibold text-[#173b68] hover:bg-[#f8fbff]"
                                >
                                  {expandida === cuota.id ? "Ocultar pagos" : `Pagos (${cuota.pagos.length})`}
                                </button>
                              ) : null}
                              {canCobrar && detalle.estado === "ACTIVO" && cuota.saldo > 0 && cuota.estado !== "ANULADA" ? (
                                <button
                                  type="button"
                                  onClick={() => setCobroCuota(cuota)}
                                  className="rounded-xl bg-[#0b5cab] px-2.5 py-1 font-semibold text-white hover:bg-[#084a8c]"
                                >
                                  Cobrar
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {expandida === cuota.id ? (
                          <tr>
                            <td colSpan={8} className="bg-[#f8fbff] px-3 py-3">
                              <div className="space-y-2">
                                {cuota.pagos.map((pago) => (
                                  <div
                                    key={pago.id}
                                    className={`rounded-xl border px-3 py-2 ${pago.estado === "ANULADO" ? "border-slate-200 bg-slate-50 text-slate-500" : "border-[#c5d8eb] bg-white text-[#0f2747]"}`}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p>
                                        <strong>{formatLeasingMonto(pago.monto)}</strong> · {formatLeasingFecha(pago.fechaPago)} · {LEASING_MEDIO_PAGO_LABELS[pago.medioPago]}
                                        {pago.numeroOperacion ? ` · Op. ${pago.numeroOperacion}` : ""}
                                        {pago.banco ? ` · ${pago.banco}` : ""}
                                        {pago.estado === "ANULADO" ? " · ANULADO" : ""}
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {pago.comprobante ? (
                                          <>
                                            <a
                                              href={`/api/leasing/pagos/${pago.id}/comprobante`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="rounded-xl border border-[#9fb8d9] px-2.5 py-1 font-semibold text-[#173b68] hover:bg-[#f8fbff]"
                                            >
                                              Ver comprobante
                                            </a>
                                            <a
                                              href={`/api/leasing/pagos/${pago.id}/comprobante?download=1`}
                                              className="rounded-xl border border-[#9fb8d9] px-2.5 py-1 font-semibold text-[#173b68] hover:bg-[#f8fbff]"
                                            >
                                              Descargar
                                            </a>
                                          </>
                                        ) : null}
                                        {pago.estado === "ACTIVO" && canCobrar ? (
                                          <button
                                            type="button"
                                            disabled={isWorking}
                                            onClick={() => void reenviarCorreo(pago.id)}
                                            className="rounded-xl border border-[#9fb8d9] px-2.5 py-1 font-semibold text-[#173b68] hover:bg-[#f8fbff] disabled:opacity-60"
                                          >
                                            Reenviar correo
                                          </button>
                                        ) : null}
                                        {pago.estado === "ACTIVO" && canAdministrar ? (
                                          <button
                                            type="button"
                                            disabled={isWorking}
                                            onClick={() =>
                                              setMotivoAccion({ tipo: "anularPago", titulo: "Anular pago", pagoId: pago.id })
                                            }
                                            className="rounded-xl border border-red-200 px-2.5 py-1 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                                          >
                                            Anular pago
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                    <p className="mt-1 text-[11px] text-slate-500">
                                      Registrado por {pago.createdByEmail || "—"} el {formatDateTime(pago.createdAt)}
                                      {pago.observaciones ? ` · ${pago.observaciones}` : ""}
                                    </p>
                                    {pago.estado === "ANULADO" ? (
                                      <p className="mt-1 text-[11px]">
                                        Anulado por {pago.anuladoByEmail} el {formatDateTime(pago.anuladoAt)} · Motivo: {pago.motivoAnulacion}
                                      </p>
                                    ) : (
                                      <p className="mt-1 text-[11px]">
                                        <CorreoEstado pago={pago} />
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {cobroCuota && detalle ? (
        <LeasingCobroModal
          leasingId={detalle.id}
          codigo={detalle.codigo}
          cantidadCuotas={detalle.cantidadCuotas}
          cuota={cobroCuota}
          onClose={() => setCobroCuota(null)}
          onSaved={(savedMessage) => {
            setCobroCuota(null);
            setExpandida(cobroCuota.id);
            setMessage(savedMessage);
            void cargar();
            onChanged();
          }}
        />
      ) : null}

      {motivoAccion ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-[24px] border border-[#b7cce4] bg-white shadow-2xl">
            <div className="border-b border-[#c5d8eb] bg-[#d7e7f8] px-5 py-4">
              <h3 className="font-heading text-lg font-semibold text-[#0f2747]">{motivoAccion.titulo}</h3>
              <p className="mt-1 text-xs text-slate-600">
                {motivoAccion.tipo === "anularPago"
                  ? "El pago no se elimina: queda anulado en el historial y la cuota se recalcula."
                  : "Esta acción queda registrada en la auditoría."}
              </p>
            </div>
            <div className="space-y-3 p-5">
              <textarea
                rows={3}
                autoFocus
                maxLength={500}
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Motivo (obligatorio)"
                className={leasingTextareaClass}
              />
              {actionError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#c5d8eb] px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setMotivoAccion(null);
                  setMotivo("");
                  setActionError("");
                }}
                className={leasingSecondaryButton}
              >
                Cancelar
              </button>
              <button type="button" disabled={isWorking} onClick={() => void confirmarMotivo()} className={leasingDangerButton}>
                {isWorking ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
