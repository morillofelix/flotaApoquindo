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
  mapPagoLineItemsToComprobantePdfItems,
  parsePagoAmountInput,
  sendPagoPropietarioEmailsBatched,
  sortPagoLineItemsForComprobante,
  type PagoPropietarioLineItem,
} from "@/lib/pago-propietario";
import {
  importPagoBulkRows,
  type PagoBulkParseResult,
} from "@/lib/pago-propietario-bulk";
import { downloadPagoComprobantePdf } from "@/lib/pago-propietario-pdf";
import {
  displayVehicleNumber,
  type PropietarioConfig,
} from "@/lib/propietarios";
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
  const [bulkSendProgress, setBulkSendProgress] = useState("");
  const [isLoadingBulkFile, setIsLoadingBulkFile] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkAlerts, setBulkAlerts] = useState<string[]>([]);
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

    if (!normalizedSearch || normalizedSearch.length < 2) {
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
    setBulkAlerts([]);
  }

  async function handleBulkFileSelect(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    clearFeedback();
    setBulkFileName(file.name);
    setIsLoadingBulkFile(true);

    try {
      if (!periodIsValid) {
        throw new Error("Define un período de pago válido (desde y hasta) antes de cargar el archivo.");
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/pago-propietario/parse-bulk", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const payload = (await response.json()) as PagoBulkParseResult & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo leer el archivo Excel.");
      }

      const parsed: PagoBulkParseResult = {
        rows: payload.rows ?? [],
        errors: payload.errors ?? [],
      };
      const importResult = importPagoBulkRows(
        parsed.rows,
        propietarios,
        lineItems,
      );
      const allAlerts = [...parsed.errors, ...importResult.errors];

      if (importResult.items.length > 0) {
        setLineItems((current) => [...current, ...importResult.items]);
        setMessage(
          `Carga masiva completada: ${importResult.items.length} propietario${
            importResult.items.length === 1 ? "" : "s"
          } agregado${importResult.items.length === 1 ? "" : "s"} al comprobante.`,
        );
      } else if (!allAlerts.length) {
        throw new Error("No se pudo importar ninguna fila del archivo.");
      } else {
        setError("No se pudo importar ninguna fila válida del archivo.");
      }

      if (allAlerts.length > 0) {
        setBulkAlerts(allAlerts);
      }
    } catch (bulkError) {
      setError(
        bulkError instanceof Error
          ? bulkError.message
          : "No se pudo cargar el archivo Excel.",
      );
    } finally {
      setIsLoadingBulkFile(false);
      event.target.value = "";
    }
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
      setBulkSendProgress("");
    }

    try {
      const results = await sendPagoPropietarioEmailsBatched(
        {
          periodFrom,
          periodTo,
          items: itemsToSend.map((item) => ({
            id: item.id,
            to: item.titularEmail,
            titularName: item.titularName,
            amount: item.amount,
          })),
        },
        {
          onProgress: isBulk
            ? (processedCount, totalCount) => {
                setBulkSendProgress(
                  `Enviando correos ${processedCount} de ${totalCount}...`,
                );
              }
            : undefined,
        },
      );

      applySendResults(results);

      const successCount = results.filter((result) => result.ok).length;
      const failedCount = results.length - successCount;
      const sentAt = new Date();
      const successfulItems = sortPagoLineItemsForComprobante(
        itemsToSend.filter((item) =>
          results.some((result) => result.id === item.id && result.ok),
        ),
      );

      if (successfulItems.length > 0) {
        try {
          await downloadPagoComprobantePdf({
            sentAt,
            periodFrom,
            periodTo,
            items: mapPagoLineItemsToComprobantePdfItems(successfulItems),
          });
        } catch {
          if (successCount > 0) {
            setMessage(
              successCount === 1
                ? "Correo enviado, pero no se pudo descargar el PDF de respaldo."
                : `${successCount} correos enviados, pero no se pudo descargar el PDF de respaldo con el detalle del lote.`,
            );
            return;
          }
        }
      }

      if (successCount && !failedCount) {
        setMessage(
          successCount === 1
            ? "Correo enviado y comprobante PDF descargado."
            : `${successCount} correos enviados y comprobante PDF descargado con el detalle completo del lote.`,
        );
      } else if (successCount && failedCount) {
        setMessage(
          `${successCount} enviados con PDF de respaldo del detalle completo, ${failedCount} con error. Revisa los ítems marcados.`,
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
      setBulkSendProgress("");
    }
  }

  async function downloadSentComprobantePdf() {
    clearFeedback();

    if (!periodIsValid) {
      setError("Define un período de pago válido para descargar el comprobante.");
      return;
    }

    const sentItems = lineItems.filter((item) => item.sent);

    if (!sentItems.length) {
      setError("No hay ítems enviados para incluir en el comprobante.");
      return;
    }

    try {
      await downloadPagoComprobantePdf({
        sentAt: new Date(),
        periodFrom,
        periodTo,
        items: mapPagoLineItemsToComprobantePdfItems(sentItems),
      });
      setMessage(
        `Comprobante PDF descargado con el detalle de ${sentItems.length} envío${
          sentItems.length === 1 ? "" : "s"
        }.`,
      );
    } catch {
      setError("No se pudo generar el comprobante PDF.");
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
          <div className="border-b border-[#c5d8eb] bg-[#f8fbff] px-3 py-3 sm:px-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-[280px]">
                <label className="flex flex-col gap-1">
                  <span className={labelClassName}>Desde</span>
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

                <label className="flex flex-col gap-1">
                  <span className={labelClassName}>Hasta</span>
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
              </div>

              <div
                ref={searchContainerRef}
                className="relative min-w-0 flex-1 flex flex-col gap-1"
              >
                <span className={labelClassName}>Propietario</span>

                {selectedPropietario ? (
                  <div className="flex h-10 items-center gap-2 rounded-2xl border border-[#0b5cab]/25 bg-[#eef5fc] px-3 text-sm text-[#173b68]">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-[#0b5cab]">
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
                      className="shrink-0 text-xs font-semibold text-[#0b5cab] underline-offset-2 hover:underline"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setSearchOpen(true);
                        clearFeedback();
                      }}
                      onFocus={() => {
                        if (search.trim().length >= 2) {
                          setSearchOpen(true);
                        }
                      }}
                      placeholder="Buscar por móvil, nombre o RUT..."
                      className={inputClassName}
                      autoComplete="off"
                      spellCheck={false}
                    />

                    {searchOpen && search.trim().length >= 2 ? (
                      <ul
                        role="listbox"
                        className="absolute top-[calc(100%+4px)] z-30 max-h-48 w-full overflow-y-auto rounded-xl border border-[#9fb8d9] bg-white py-1 shadow-xl shadow-slate-300/35"
                      >
                        {isLoading ? (
                          <li className="px-3 py-2 text-sm text-slate-500">
                            Buscando...
                          </li>
                        ) : loadError ? (
                          <li className="px-3 py-2 text-sm text-red-600">
                            {loadError}
                          </li>
                        ) : filteredPropietarios.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-slate-500">
                            Sin coincidencias
                          </li>
                        ) : (
                          filteredPropietarios.slice(0, 8).map((propietario) => {
                            const alreadyAdded = lineItems.some(
                              (item) =>
                                item.propietarioId ===
                                getPropietarioKey(propietario),
                            );

                            return (
                              <li key={getPropietarioKey(propietario)}>
                                <button
                                  type="button"
                                  role="option"
                                  onClick={() => selectPropietario(propietario)}
                                  disabled={alreadyAdded}
                                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-[#eef5fc] disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  <span className="truncate text-sm font-semibold text-[#0f2747]">
                                    {displayVehicleNumber(
                                      propietario.vehicleNumber,
                                    ) || "—"}{" "}
                                    · {propietario.fullName}
                                  </span>
                                  <span className="truncate text-xs text-slate-500">
                                    {getTitularName(propietario)}
                                    {alreadyAdded ? " · ya agregado" : ""}
                                  </span>
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>

              <label className="flex w-full shrink-0 flex-col gap-1 sm:w-36">
                <span className={labelClassName}>Monto</span>
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
                className={`${primaryButtonClassName} w-full shrink-0 xl:w-auto`}
              >
                Agregar
              </button>

              <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-[#c5d8eb] bg-white px-3 py-2 text-xs text-[#173b68] xl:mb-0.5">
                <span>
                  <strong>{lineItems.length}</strong> ítem
                  {lineItems.length === 1 ? "" : "s"}
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-emerald-700">
                  <strong>{sentCount}</strong> env.
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-amber-700">
                  <strong>{pendingItems.length}</strong> pend.
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-[#c5d8eb] bg-white px-3 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#173b68]">
                    Cargador masivo Excel
                  </p>
                  <p className="text-[11px] leading-5 text-slate-500">
                    Usa la columna con encabezado en blanco para el móvil y
                    &quot;total facturar&quot; para el monto. Los demás datos se
                    toman de propietarios. Al enviar masivo, cada titular recibe
                    su correo y se descarga un PDF con el detalle completo del
                    lote enviado.
                  </p>
                  {bulkFileName ? (
                    <p className="mt-1 text-[11px] font-medium text-[#0b5cab]">
                      Último archivo: {bulkFileName}
                      {isLoadingBulkFile ? " · procesando..." : ""}
                    </p>
                  ) : null}
                </div>

                <label className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60">
                  {isLoadingBulkFile ? "Cargando..." : "Seleccionar Excel"}
                  <input
                    type="file"
                    accept=".csv,.txt,.slk,.xls,.xlsx,text/csv,application/vnd.ms-excel"
                    onChange={handleBulkFileSelect}
                    disabled={isLoadingBulkFile || isSendingBulk}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="px-3 py-4 sm:px-4">
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
                    ? bulkSendProgress || "Enviando..."
                    : `Enviar masivo (${pendingItems.length})`}
                </button>
                <button
                  type="button"
                  onClick={downloadSentComprobantePdf}
                  disabled={!sentCount || isSendingBulk || !periodIsValid}
                  className={secondaryButtonClassName}
                >
                  Descargar PDF enviados ({sentCount})
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

            {bulkAlerts.length > 0 ? (
              <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">
                  Alertas de la carga masiva
                </p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-amber-950">
                  {bulkAlerts.map((alert) => (
                    <li key={alert}>• {alert}</li>
                  ))}
                </ul>
              </div>
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
