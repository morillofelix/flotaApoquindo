"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { loadPropietarios } from "@/lib/agendamientos-admin";
import {
  isDigitOnlySearch,
  matchesTextSearch,
  matchesVehicleNumberSearch,
} from "@/lib/maintainer-search";
import {
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
import { useEffect, useMemo, useRef, useState } from "react";

const inputClassName =
  "h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

const labelClassName = "text-xs font-semibold text-[#173b68]";

const primaryButtonClassName =
  "inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px";

const secondaryButtonClassName =
  "inline-flex h-10 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm font-semibold text-[#173b68] shadow-[0_1px_2px_rgba(15,39,71,0.05)] transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px";

const tableHeadClassName =
  "border-b border-[#9fb8d9] bg-[#d7e7f8] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#173b68]";

const tableCellClassName =
  "border-b border-[#d9e5f2] px-3 py-2.5 text-sm text-[#0f2747] align-middle";

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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPropietarios()
      .then((loaded) => {
        setPropietarios(loaded.filter((item) => item.isActive));
        setLoadError("");
      })
      .catch(() => setLoadError("No se pudieron cargar los propietarios."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const filteredPropietarios = useMemo(() => {
    const normalizedSearch = search.trim();
    const normalizedSearchLower = normalizedSearch.toLowerCase();
    const digitOnlySearch = isDigitOnlySearch(normalizedSearch);

    if (!normalizedSearch) {
      return [];
    }

    return propietarios.filter((propietario) => {
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

  const pendingItems = lineItems.filter((item) => !item.sent);
  const sentCount = lineItems.filter((item) => item.sent).length;
  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const parsedAmount = parsePagoAmountInput(amountInput);
  const periodIsValid =
    periodFrom.length > 0 && periodTo.length > 0 && periodFrom <= periodTo;

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function selectPropietario(propietario: PropietarioConfig) {
    setSelectedPropietario(propietario);
    setSearch("");
    setSearchOpen(false);
    clearFeedback();
  }

  function clearSelectedPropietario() {
    setSelectedPropietario(null);
    setSearch("");
    setSearchOpen(false);
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
    setAmountInput("");
    setSelectedPropietario(null);
    setSearch("");
    setMessage("Propietario agregado al comprobante.");
  }

  function removeLineItem(itemId: string) {
    setLineItems((current) => current.filter((item) => item.id !== itemId));
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
    setAmountInput("");
    setSelectedPropietario(null);
    clearFeedback();
    setMessage("Comprobante limpiado.");
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

          <div className="border-b border-[#c5d8eb] p-4 sm:px-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_auto] lg:items-end">
              <div ref={searchContainerRef} className="relative flex flex-col gap-1.5">
                <span className={labelClassName}>Buscar propietario</span>

                {selectedPropietario ? (
                  <div className="flex h-10 items-center gap-2 rounded-2xl border border-[#0b5cab]/25 bg-[#eef5fc] px-3 text-sm text-[#173b68]">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-[#0b5cab]">
                        Móvil{" "}
                        {displayVehicleNumber(
                          selectedPropietario.vehicleNumber,
                        ) || "—"}
                      </span>
                      <span className="text-slate-500"> · </span>
                      <span className="font-medium">
                        {selectedPropietario.fullName}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={clearSelectedPropietario}
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-[#0b5cab] transition hover:bg-white/80"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setSearchOpen(true);
                        clearFeedback();
                      }}
                      onFocus={() => {
                        if (search.trim()) {
                          setSearchOpen(true);
                        }
                      }}
                      placeholder="Escribe móvil, nombre, RUT o titular..."
                      className={inputClassName}
                      autoComplete="off"
                    />

                    {searchOpen && search.trim() ? (
                      <div className="absolute top-[calc(100%+4px)] z-20 max-h-56 w-full overflow-y-auto rounded-2xl border border-[#9fb8d9] bg-white shadow-lg shadow-slate-300/30">
                        {isLoading ? (
                          <p className="px-4 py-3 text-sm text-slate-500">
                            Cargando...
                          </p>
                        ) : loadError ? (
                          <p className="px-4 py-3 text-sm text-red-600">
                            {loadError}
                          </p>
                        ) : filteredPropietarios.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-slate-500">
                            Sin resultados para &quot;{search.trim()}&quot;
                          </p>
                        ) : (
                          filteredPropietarios.slice(0, 12).map((propietario) => {
                            const alreadyAdded = lineItems.some(
                              (item) =>
                                item.propietarioId ===
                                getPropietarioKey(propietario),
                            );

                            return (
                              <button
                                key={getPropietarioKey(propietario)}
                                type="button"
                                onClick={() => selectPropietario(propietario)}
                                disabled={alreadyAdded}
                                className={`flex w-full flex-col gap-0.5 border-b border-[#e8eef5] px-3 py-2.5 text-left last:border-b-0 disabled:cursor-not-allowed disabled:opacity-50 ${uiListRowClass(false)}`}
                              >
                                <span className="truncate text-sm font-semibold text-[#0f2747]">
                                  {propietario.fullName}
                                </span>
                                <span className="text-xs text-slate-600">
                                  Móvil{" "}
                                  {displayVehicleNumber(
                                    propietario.vehicleNumber,
                                  ) || "—"}{" "}
                                  · {getTitularName(propietario)}
                                </span>
                                {alreadyAdded ? (
                                  <span className="text-[11px] font-semibold text-emerald-700">
                                    Ya en el comprobante
                                  </span>
                                ) : null}
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

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

              <button
                type="button"
                onClick={addLineItem}
                className={`${primaryButtonClassName} w-full lg:w-auto`}
              >
                Agregar
              </button>
            </div>

            {!selectedPropietario && !search.trim() ? (
              <p className="mt-2 text-xs text-slate-500">
                Escribe en el buscador para ver propietarios y seleccionar uno.
              </p>
            ) : null}
          </div>

          <div className="px-4 py-4 sm:px-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-base font-semibold text-[#0f2747]">
                  Vista previa del comprobante
                </h2>
                <p className="text-xs text-slate-500">
                  {periodIsValid
                    ? `Período ${formatPagoDate(periodFrom)} al ${formatPagoDate(periodTo)}`
                    : "Define el período de pago para completar el comprobante."}
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
                  Limpiar
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

            <div className="overflow-x-auto rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)]">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr>
                    <th className={`${tableHeadClassName} w-12 text-center`}>
                      Envío
                    </th>
                    <th className={tableHeadClassName}>Móvil</th>
                    <th className={tableHeadClassName}>Propietario</th>
                    <th className={tableHeadClassName}>Titular</th>
                    <th className={tableHeadClassName}>Correo titular</th>
                    <th className={`${tableHeadClassName} text-right`}>
                      Monto
                    </th>
                    <th className={`${tableHeadClassName} text-right`}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="bg-[#f8fbff] px-4 py-10 text-center text-sm text-slate-500"
                      >
                        Agrega propietarios arriba para ver el detalle del
                        comprobante en esta tabla.
                      </td>
                    </tr>
                  ) : (
                    lineItems.map((item, index) => (
                      <tr
                        key={item.id}
                        className={index % 2 === 0 ? "bg-white" : "bg-[#f8fbff]"}
                      >
                        <td className={`${tableCellClassName} text-center`}>
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                              item.sent
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-[#c5d8eb] bg-white text-slate-400"
                            }`}
                            title={item.sent ? "Correo enviado" : "Pendiente"}
                          >
                            {item.sent ? (
                              <CheckIcon className="h-3.5 w-3.5" />
                            ) : item.sending ? (
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#0b5cab] border-t-transparent" />
                            ) : (
                              <span className="text-[10px] font-semibold">○</span>
                            )}
                          </span>
                        </td>
                        <td className={`${tableCellClassName} font-semibold`}>
                          {item.vehicleNumber || "—"}
                        </td>
                        <td className={tableCellClassName}>{item.fullName}</td>
                        <td className={tableCellClassName}>
                          {item.titularName}
                        </td>
                        <td className={`${tableCellClassName} text-xs text-slate-600`}>
                          {item.titularEmail}
                          {item.sendError ? (
                            <p className="mt-1 text-xs text-red-600">
                              {item.sendError}
                            </p>
                          ) : null}
                        </td>
                        <td
                          className={`${tableCellClassName} text-right font-semibold tabular-nums`}
                        >
                          {formatPagoAmount(item.amount)}
                        </td>
                        <td className={tableCellClassName}>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => sendItems([item.id])}
                              disabled={
                                item.sent || item.sending || !periodIsValid
                              }
                              className="inline-flex h-8 items-center justify-center rounded-xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68] transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {item.sending ? "..." : "Enviar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeLineItem(item.id)}
                              disabled={item.sending || isSendingBulk}
                              className="inline-flex h-8 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Quitar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {lineItems.length > 0 ? (
                  <tfoot>
                    <tr className="bg-[#d7e7f8]">
                      <td
                        colSpan={5}
                        className="border-t border-[#9fb8d9] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-[#173b68]"
                      >
                        Total del comprobante
                      </td>
                      <td className="border-t border-[#9fb8d9] px-3 py-2.5 text-right text-sm font-bold tabular-nums text-[#0f2747]">
                        {formatPagoAmount(totalAmount)}
                      </td>
                      <td className="border-t border-[#9fb8d9] px-3 py-2.5" />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
