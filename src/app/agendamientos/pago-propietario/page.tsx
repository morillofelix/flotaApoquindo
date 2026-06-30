"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { loadPropietarios } from "@/lib/agendamientos-admin";
import {
  isDigitOnlySearch,
  matchesTextSearch,
  matchesVehicleNumberSearch,
} from "@/lib/maintainer-search";
import {
  buildComprobanteMessage,
  createPagoLineItem,
  formatPagoAmount,
  formatPagoDate,
  getTitularEmail,
  getTitularName,
  getPropietarioKey,
  isValidEmail,
  parsePagoAmountInput,
  sendPagoPropietarioEmails,
  type PagoPropietarioLineItem,
} from "@/lib/pago-propietario";
import { displayVehicleNumber, type PropietarioConfig } from "@/lib/propietarios";
import { uiListRowClass } from "@/lib/ui-borders";
import { useEffect, useMemo, useState } from "react";

const inputClassName =
  "h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

const labelClassName = "text-xs font-semibold text-[#173b68]";

const primaryButtonClassName =
  "inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px";

const secondaryButtonClassName =
  "inline-flex h-10 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm font-semibold text-[#173b68] shadow-[0_1px_2px_rgba(15,39,71,0.05)] transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px";

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 0 1 .007 1.413l-7.25 7.35a1 1 0 0 1-1.43.007L3.29 9.72a1 1 0 1 1 1.414-1.414l3.59 3.59 6.543-6.65a1 1 0 0 1 1.414-.007Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function PagoPropietarioPage() {
  const [propietarios, setPropietarios] = useState<PropietarioConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPropietario, setSelectedPropietario] =
    useState<PropietarioConfig | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [lineItems, setLineItems] = useState<PagoPropietarioLineItem[]>([]);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSendingBulk, setIsSendingBulk] = useState(false);

  useEffect(() => {
    loadPropietarios()
      .then((loaded) => {
        setPropietarios(loaded.filter((item) => item.isActive));
        setLoadError("");
      })
      .catch(() => setLoadError("No se pudieron cargar los propietarios."))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredPropietarios = useMemo(() => {
    const normalizedSearch = search.trim();
    const normalizedSearchLower = normalizedSearch.toLowerCase();
    const digitOnlySearch = isDigitOnlySearch(normalizedSearch);

    return propietarios.filter((propietario) => {
      if (!normalizedSearch) {
        return true;
      }

      if (digitOnlySearch) {
        return matchesVehicleNumberSearch(
          propietario.vehicleNumber,
          normalizedSearch,
        );
      }

      return (
        matchesTextSearch(propietario.vehicleNumber, normalizedSearchLower) ||
        matchesTextSearch(propietario.fullName, normalizedSearchLower) ||
        matchesTextSearch(propietario.rut, normalizedSearchLower) ||
        matchesTextSearch(getTitularName(propietario), normalizedSearchLower) ||
        matchesTextSearch(getTitularEmail(propietario), normalizedSearchLower)
      );
    });
  }, [propietarios, search]);

  const previewItem = useMemo(() => {
    if (previewItemId) {
      return lineItems.find((item) => item.id === previewItemId) ?? null;
    }

    return lineItems[lineItems.length - 1] ?? null;
  }, [lineItems, previewItemId]);

  const previewMessage = useMemo(() => {
    if (!previewItem || !periodFrom || !periodTo) {
      return "";
    }

    return buildComprobanteMessage({
      titularName: previewItem.titularName,
      amount: previewItem.amount,
      periodFrom,
      periodTo,
    });
  }, [periodFrom, periodTo, previewItem]);

  const pendingItems = lineItems.filter((item) => !item.sent);
  const sentCount = lineItems.filter((item) => item.sent).length;
  const parsedAmount = parsePagoAmountInput(amountInput);
  const periodIsValid =
    periodFrom.length > 0 &&
    periodTo.length > 0 &&
    periodFrom <= periodTo;

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function selectPropietario(propietario: PropietarioConfig) {
    setSelectedPropietario(propietario);
    clearFeedback();
  }

  function addLineItem() {
    clearFeedback();

    if (!selectedPropietario) {
      setError("Selecciona un propietario de la lista.");
      return;
    }

    if (!periodIsValid) {
      setError("Define un período de pago válido (desde y hasta).");
      return;
    }

    if (parsedAmount <= 0) {
      setError("Ingresa un monto mayor a cero.");
      return;
    }

    const titularEmail = getTitularEmail(selectedPropietario);

    if (!isValidEmail(titularEmail)) {
      setError(
        "El propietario seleccionado no tiene un correo de titular válido.",
      );
      return;
    }

    if (
      lineItems.some(
        (item) => item.propietarioId === getPropietarioKey(selectedPropietario),
      )
    ) {
      setError("Ese propietario ya está en el lote.");
      return;
    }

    const newItem = createPagoLineItem(selectedPropietario, parsedAmount);

    setLineItems((current) => [...current, newItem]);
    setPreviewItemId(newItem.id);
    setAmountInput("");
    setSelectedPropietario(null);
    setSearch("");
    setMessage("Propietario agregado al lote.");
  }

  function removeLineItem(itemId: string) {
    setLineItems((current) => current.filter((item) => item.id !== itemId));

    if (previewItemId === itemId) {
      setPreviewItemId(null);
    }
  }

  function applySendResults(
    results: { id: string; ok: boolean; error?: string }[],
  ) {
    setLineItems((current) =>
      current.map((item) => {
        const result = results.find((entry) => entry.id === item.id);

        if (!result) {
          return { ...item, sending: false };
        }

        return {
          ...item,
          sending: false,
          sent: result.ok ? true : item.sent,
          sendError: result.ok ? "" : result.error ?? "No se pudo enviar.",
        };
      }),
    );
  }

  async function sendItems(itemIds: string[]) {
    clearFeedback();

    if (!periodIsValid) {
      setError("Define un período de pago válido antes de enviar.");
      return;
    }

    const itemsToSend = lineItems.filter(
      (item) => itemIds.includes(item.id) && !item.sent,
    );

    if (!itemsToSend.length) {
      setError("No hay correos pendientes para enviar.");
      return;
    }

    const invalidItem = itemsToSend.find(
      (item) => !isValidEmail(item.titularEmail),
    );

    if (invalidItem) {
      setError(
        `El ítem de ${invalidItem.fullName} no tiene correo de titular válido.`,
      );
      return;
    }

    setLineItems((current) =>
      current.map((item) =>
        itemIds.includes(item.id)
          ? { ...item, sending: true, sendError: "" }
          : item,
      ),
    );

    const isBulk = itemIds.length > 1;

    if (isBulk) {
      setIsSendingBulk(true);
    }

    try {
      const results = await sendPagoPropietarioEmails({
        periodFrom,
        periodTo,
        items: itemsToSend.map((item) => ({
          id: item.id,
          to: item.titularEmail,
          titularName: item.titularName,
          amount: item.amount,
        })),
      });

      applySendResults(results);

      const successCount = results.filter((result) => result.ok).length;
      const failedCount = results.length - successCount;

      if (successCount && !failedCount) {
        setMessage(
          successCount === 1
            ? "Correo enviado correctamente."
            : `${successCount} correos enviados correctamente.`,
        );
      } else if (successCount && failedCount) {
        setMessage(
          `${successCount} enviados, ${failedCount} con error. Revisa los ítems marcados.`,
        );
      } else {
        setError("No se pudo enviar ningún correo.");
      }
    } catch (sendError) {
      setLineItems((current) =>
        current.map((item) =>
          itemIds.includes(item.id)
            ? {
                ...item,
                sending: false,
                sendError:
                  sendError instanceof Error
                    ? sendError.message
                    : "No se pudo enviar.",
              }
            : item,
        ),
      );
      setError(
        sendError instanceof Error
          ? sendError.message
          : "No se pudieron enviar los correos.",
      );
    } finally {
      setIsSendingBulk(false);
    }
  }

  function clearBatch() {
    setLineItems([]);
    setPreviewItemId(null);
    setAmountInput("");
    setSelectedPropietario(null);
    clearFeedback();
    setMessage("Lote limpiado.");
  }

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        <MaintainerPageHeader
          title="Pago propietario"
          subtitle="Pagos y comprobantes"
        />

        <div className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25 sm:rounded-[24px]">
          <div className="border-b border-[#c5d8eb] bg-[#f8fbff] px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="flex flex-col gap-1.5">
                <span className={labelClassName}>Período desde</span>
                <input
                  type="date"
                  value={periodFrom}
                  onChange={(event) => {
                    setPeriodFrom(event.target.value);
                    clearFeedback();
                  }}
                  className={inputClassName}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelClassName}>Período hasta</span>
                <input
                  type="date"
                  value={periodTo}
                  onChange={(event) => {
                    setPeriodTo(event.target.value);
                    clearFeedback();
                  }}
                  className={inputClassName}
                />
              </label>

              <div className="flex items-end">
                <div className="rounded-2xl border border-[#c5d8eb] bg-white px-4 py-2 text-sm text-[#173b68]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0b5cab]">
                    Lote actual
                  </p>
                  <p className="font-semibold">
                    {lineItems.length} ítem{lineItems.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {sentCount} enviado{sentCount === 1 ? "" : "s"} ·{" "}
                    {pendingItems.length} pendiente
                    {pendingItems.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="flex min-h-[420px] flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                <label className="flex flex-col gap-1.5">
                  <span className={labelClassName}>Buscar propietario</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Móvil, nombre, RUT o titular"
                    className={inputClassName}
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className={labelClassName}>Monto a pagar</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amountInput}
                    onChange={(event) => setAmountInput(event.target.value)}
                    placeholder="$0"
                    className={inputClassName}
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={addLineItem}
                    className={`${primaryButtonClassName} w-full sm:w-auto`}
                  >
                    Agregar
                  </button>
                </div>
              </div>

              {selectedPropietario ? (
                <div className="rounded-2xl border border-[#0b5cab]/20 bg-[#eef5fc] px-4 py-3 text-sm text-[#173b68]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0b5cab]">
                    Seleccionado
                  </p>
                  <p className="font-semibold">{selectedPropietario.fullName}</p>
                  <p className="text-xs text-slate-600">
                    Móvil{" "}
                    {displayVehicleNumber(selectedPropietario.vehicleNumber) ||
                      "—"}{" "}
                    · Titular {getTitularName(selectedPropietario)}
                  </p>
                  <p className="text-xs text-slate-600">
                    {getTitularEmail(selectedPropietario) || "Sin correo titular"}
                  </p>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#b7cce4] bg-[#f8fbff]">
                <div className="border-b border-[#c5d8eb] px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0b5cab]">
                    Propietarios
                  </p>
                </div>

                <div className="max-h-[320px] overflow-y-auto">
                  {isLoading ? (
                    <p className="px-4 py-6 text-sm text-slate-500">
                      Cargando propietarios...
                    </p>
                  ) : loadError ? (
                    <p className="px-4 py-6 text-sm text-red-600">{loadError}</p>
                  ) : filteredPropietarios.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-500">
                      No hay propietarios que coincidan con la búsqueda.
                    </p>
                  ) : (
                    filteredPropietarios.slice(0, 80).map((propietario) => {
                      const isSelected = Boolean(
                        selectedPropietario &&
                          getPropietarioKey(selectedPropietario) ===
                            getPropietarioKey(propietario),
                      );
                      const alreadyAdded = lineItems.some(
                        (item) =>
                          item.propietarioId === getPropietarioKey(propietario),
                      );

                      return (
                        <button
                          key={propietario.id}
                          type="button"
                          onClick={() => selectPropietario(propietario)}
                          disabled={alreadyAdded}
                          className={`flex w-full flex-col gap-0.5 border-b border-[#d9e5f2] px-4 py-3 text-left last:border-b-0 disabled:cursor-not-allowed disabled:opacity-50 ${uiListRowClass(isSelected)}`}
                        >
                          <span className="text-sm font-semibold text-[#0f2747]">
                            {propietario.fullName}
                          </span>
                          <span className="text-xs text-slate-600">
                            Móvil{" "}
                            {displayVehicleNumber(propietario.vehicleNumber) ||
                              "—"}{" "}
                            · {getTitularName(propietario)}
                          </span>
                          {alreadyAdded ? (
                            <span className="text-[11px] font-semibold text-emerald-700">
                              Ya en el lote
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex min-h-[320px] flex-col rounded-2xl border border-[#b7cce4] bg-[#f8fbff]">
              <div className="border-b border-[#c5d8eb] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0b5cab]">
                  Vista previa del comprobante
                </p>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-4">
                {periodFrom && periodTo ? (
                  <p className="text-xs text-slate-600">
                    Período: {formatPagoDate(periodFrom)} —{" "}
                    {formatPagoDate(periodTo)}
                  </p>
                ) : (
                  <p className="text-xs text-amber-700">
                    Define el período de pago para generar el mensaje.
                  </p>
                )}

                <div className="flex-1 rounded-2xl border border-[#9fb8d9] bg-white p-4 text-sm leading-6 text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)]">
                  {previewMessage ? (
                    previewMessage
                  ) : previewItem ? (
                    "Completa el período para ver el mensaje."
                  ) : (
                    "Agrega propietarios al lote para previsualizar el comprobante."
                  )}
                </div>

                {previewItem ? (
                  <div className="rounded-2xl border border-[#d9e5f2] bg-white px-3 py-2 text-xs text-slate-600">
                    <p>
                      <strong>Para:</strong> {previewItem.titularEmail}
                    </p>
                    <p>
                      <strong>Monto:</strong>{" "}
                      {formatPagoAmount(previewItem.amount)}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t border-[#c5d8eb] px-4 py-4 sm:px-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-base font-semibold text-[#0f2747]">
                  Lote de pagos
                </h2>
                <p className="text-xs text-slate-500">
                  Envía comprobantes individuales o todos los pendientes.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => sendItems(pendingItems.map((item) => item.id))}
                  disabled={!pendingItems.length || isSendingBulk || !periodIsValid}
                  className={primaryButtonClassName}
                >
                  {isSendingBulk
                    ? "Enviando..."
                    : `Enviar masivo (${pendingItems.length})`}
                </button>
                <button
                  type="button"
                  onClick={clearBatch}
                  disabled={!lineItems.length || isSendingBulk}
                  className={secondaryButtonClassName}
                >
                  Limpiar lote
                </button>
              </div>
            </div>

            {message ? (
              <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                {message}
              </p>
            ) : null}

            {error ? (
              <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-[#b7cce4]">
              {lineItems.length === 0 ? (
                <p className="bg-[#f8fbff] px-4 py-8 text-center text-sm text-slate-500">
                  Aún no hay pagos en el lote. Busca un propietario, ingresa el
                  monto y presiona Agregar.
                </p>
              ) : (
                <div className="divide-y divide-[#d9e5f2]">
                  {lineItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-3 bg-[#f8fbff] px-4 py-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                            item.sent
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-[#c5d8eb] bg-white text-slate-400"
                          }`}
                          title={item.sent ? "Correo enviado" : "Pendiente"}
                        >
                          {item.sent ? (
                            <CheckIcon className="h-4 w-4" />
                          ) : item.sending ? (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#0b5cab] border-t-transparent" />
                          ) : (
                            <span className="text-xs font-semibold">○</span>
                          )}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setPreviewItemId(item.id)}
                        className="min-w-0 text-left"
                      >
                        <p className="truncate text-sm font-semibold text-[#0f2747]">
                          {item.fullName}
                        </p>
                        <p className="text-xs text-slate-600">
                          Móvil {item.vehicleNumber || "—"} · Titular{" "}
                          {item.titularName} · {formatPagoAmount(item.amount)}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {item.titularEmail}
                        </p>
                        {item.sendError ? (
                          <p className="mt-1 text-xs text-red-600">
                            {item.sendError}
                          </p>
                        ) : null}
                      </button>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => sendItems([item.id])}
                          disabled={item.sent || item.sending || !periodIsValid}
                          className={secondaryButtonClassName}
                        >
                          {item.sending ? "Enviando..." : "Enviar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLineItem(item.id)}
                          disabled={item.sending || isSendingBulk}
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
