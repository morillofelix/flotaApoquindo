"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import PropietarioHistoryStatusDialog, {
  type HistoryStatusChangeInput,
} from "@/components/agendamientos/PropietarioHistoryStatusDialog";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import { fetchAdminSessionClient } from "@/lib/admin-auth-client";
import {
  PROPIETARIO_HISTORY_MOVEMENT_OPTIONS,
  PROPIETARIO_HISTORY_PAGE_SIZE,
  type PropietarioHistoryEntry,
  type PropietarioHistoryResponse,
} from "@/lib/propietarios-history";
import {
  formatPropietarioStatusLabel,
  getPropietarioStatusBadgeClassName,
  PROPIETARIO_STATUS_OPTIONS,
} from "@/lib/propietario-status";
import { uiFieldClass, uiListRowClass } from "@/lib/ui-borders";
import { useCallback, useEffect, useMemo, useState } from "react";

type DateMode = "day" | "month" | "range";

type HistoryFilters = {
  rut: string;
  name: string;
  vehicleNumber: string;
  dateMode: DateMode;
  day: string;
  month: string;
  dateFrom: string;
  dateTo: string;
  actor: string;
  field: string;
  movement: string;
  status: string;
};

function getSantiagoMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

function emptyFilters(): HistoryFilters {
  return {
    rut: "",
    name: "",
    vehicleNumber: "",
    dateMode: "month",
    day: "",
    month: getSantiagoMonth(),
    dateFrom: "",
    dateTo: "",
    actor: "",
    field: "",
    movement: "",
    status: "",
  };
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

function notificationLabel(value: PropietarioHistoryEntry["notificationStatus"]) {
  if (value === "sent") {
    return "Correo enviado";
  }

  if (value === "failed") {
    return "Correo no confirmado";
  }

  if (value === "pending") {
    return "Correo pendiente";
  }

  return "Correo no requerido";
}

export default function HistorialPage() {
  const { confirm, dialog } = useConfirmAction();
  const [draftFilters, setDraftFilters] = useState<HistoryFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<HistoryFilters>(emptyFilters);
  const [records, setRecords] = useState<PropietarioHistoryEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [actors, setActors] = useState<Array<{ id: string; name: string }>>([]);
  const [fields, setFields] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const [expandedId, setExpandedId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [canChangeStatus, setCanChangeStatus] = useState(false);
  const [statusRecord, setStatusRecord] =
    useState<PropietarioHistoryEntry | null>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PROPIETARIO_HISTORY_PAGE_SIZE),
      });

      for (const key of [
        "rut",
        "name",
        "vehicleNumber",
        "actor",
        "field",
        "movement",
        "status",
      ] as const) {
        const value = appliedFilters[key].trim();
        if (value) {
          params.set(key, value);
        }
      }

      if (appliedFilters.dateMode === "day" && appliedFilters.day) {
        params.set("day", appliedFilters.day);
      } else if (appliedFilters.dateMode === "month" && appliedFilters.month) {
        params.set("month", appliedFilters.month);
      } else if (appliedFilters.dateMode === "range") {
        if (appliedFilters.dateFrom) {
          params.set("dateFrom", appliedFilters.dateFrom);
        }
        if (appliedFilters.dateTo) {
          params.set("dateTo", appliedFilters.dateTo);
        }
      }

      const response = await fetch(`/api/propietarios-history?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json()) as
        | PropietarioHistoryResponse
        | { message?: string };

      if (!response.ok || !("records" in data)) {
        throw new Error(
          "message" in data && data.message
            ? data.message
            : "No se pudo consultar el historial.",
        );
      }

      setRecords(data.records);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
      setActors(data.filterOptions.actors);
      setFields(data.filterOptions.fields);
    } catch (loadError) {
      setRecords([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo consultar el historial.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters, page]);

  const {
    refresh,
    isRefreshing,
    lastUpdatedAt,
  } = useAutoRefresh({
    onRefresh: loadHistory,
    pause: isSavingStatus,
  });

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    fetchAdminSessionClient()
      .then((session) => {
        setCanChangeStatus(
          Boolean(
            session?.isSuperAdmin ||
              (session?.permissions?.historial &&
                session.permissions.propietarios),
          ),
        );
      })
      .catch(() => setCanChangeStatus(false));
  }, []);

  const resultLabel = useMemo(
    () => `${total} ${total === 1 ? "modificación" : "modificaciones"}`,
    [total],
  );

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (
      draftFilters.dateMode === "range" &&
      draftFilters.dateFrom &&
      draftFilters.dateTo &&
      draftFilters.dateFrom > draftFilters.dateTo
    ) {
      setError("La fecha desde no puede ser posterior a la fecha hasta.");
      return;
    }

    setPage(1);
    setAppliedFilters({ ...draftFilters });
  }

  function clearFilters() {
    const cleared = emptyFilters();
    setDraftFilters(cleared);
    setAppliedFilters(cleared);
    setPage(1);
    setError("");
    setMessage("");
  }

  async function saveStatus(input: HistoryStatusChangeInput) {
    if (
      !statusRecord?.propietarioId ||
      !statusRecord.currentStatus ||
      !statusRecord.currentUpdatedAt
    ) {
      return;
    }

    const confirmed = await confirm({
      title: "Confirmar cambio de Estado",
      message: `${formatPropietarioStatusLabel(statusRecord.currentStatus)} → ${formatPropietarioStatusLabel(input.status)}`,
      detail: statusRecord.propietarioName,
      confirmLabel: "Cambiar Estado",
    });

    if (!confirmed) {
      return;
    }

    setIsSavingStatus(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/propietarios-history/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          propietarioId: statusRecord.propietarioId,
          status: input.status,
          expectedUpdatedAt: statusRecord.currentUpdatedAt,
          inactiveReason: input.status === "inactivo" ? input.reason : "",
          activationReason: input.status === "activo" ? input.reason : "",
          desvinculacionReason:
            input.status === "desvinculado" ? input.reason : "",
          desvinculacionDays:
            input.status === "desvinculado" ? input.days : 0,
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        notificationSent?: boolean;
      };

      if (!response.ok) {
        throw new Error(
          data.message ?? "No se pudo actualizar el Estado del propietario.",
        );
      }

      setStatusRecord(null);
      setMessage(
        data.notificationSent
          ? "Estado actualizado y correo enviado correctamente."
          : "Estado actualizado correctamente.",
      );
      await loadHistory();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo actualizar el Estado del propietario.",
      );
    } finally {
      setIsSavingStatus(false);
    }
  }

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        <MaintainerPageHeader
          title="Historial"
          subtitle="Registro de modificaciones realizadas en las fichas de propietarios"
          onRefresh={() => void refresh()}
          isRefreshing={isRefreshing}
          lastUpdatedAt={lastUpdatedAt}
        />

        <form
          onSubmit={applyFilters}
          className="rounded-[24px] border border-[#b7cce4] bg-white p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">RUT</span>
              <input
                value={draftFilters.rut}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    rut: event.target.value,
                  }))
                }
                className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">
                Razón social o nombre
              </span>
              <input
                value={draftFilters.name}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">
                Número de móvil
              </span>
              <input
                inputMode="numeric"
                value={draftFilters.vehicleNumber}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    vehicleNumber: event.target.value,
                  }))
                }
                className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">
                Responsable
              </span>
              <select
                value={draftFilters.actor}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    actor: event.target.value,
                  }))
                }
                className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
              >
                <option value="">Todos</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">
                Campo modificado
              </span>
              <select
                value={draftFilters.field}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    field: event.target.value,
                  }))
                }
                className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
              >
                <option value="">Todos</option>
                {fields.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">
                Tipo de movimiento
              </span>
              <select
                value={draftFilters.movement}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    movement: event.target.value,
                  }))
                }
                className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
              >
                <option value="">Todos</option>
                {PROPIETARIO_HISTORY_MOVEMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">
                Estado resultante
              </span>
              <select
                value={draftFilters.status}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
                className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
              >
                <option value="">Todos</option>
                {PROPIETARIO_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">
                Periodo
              </span>
              <select
                value={draftFilters.dateMode}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    dateMode: event.target.value as DateMode,
                  }))
                }
                className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
              >
                <option value="day">Día específico</option>
                <option value="month">Mes</option>
                <option value="range">Rango personalizado</option>
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {draftFilters.dateMode === "day" ? (
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-[#173b68]">Día</span>
                <input
                  type="date"
                  value={draftFilters.day}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      day: event.target.value,
                    }))
                  }
                  className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
                />
              </label>
            ) : null}
            {draftFilters.dateMode === "month" ? (
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-[#173b68]">Mes</span>
                <input
                  type="month"
                  value={draftFilters.month}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      month: event.target.value,
                    }))
                  }
                  className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
                />
              </label>
            ) : null}
            {draftFilters.dateMode === "range" ? (
              <>
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha desde
                  </span>
                  <input
                    type="date"
                    value={draftFilters.dateFrom}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        dateFrom: event.target.value,
                      }))
                    }
                    className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha hasta
                  </span>
                  <input
                    type="date"
                    value={draftFilters.dateTo}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        dateTo: event.target.value,
                      }))
                    }
                    className={`h-10 rounded-2xl px-3 ${uiFieldClass()}`}
                  />
                </label>
              </>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white transition hover:bg-[#084a8c]"
            >
              Aplicar filtros
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-5 text-sm font-semibold text-[#173b68]"
            >
              Limpiar filtros
            </button>
          </div>
        </form>

        {message ? (
          <p className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 rounded-[24px] border border-[#b7cce4] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold text-[#0f2747]">
              Modificaciones
            </h2>
            <span className="text-sm font-semibold text-slate-600">
              {resultLabel}
            </span>
          </div>

          {isLoading ? (
            <p className="py-10 text-center text-sm text-slate-600">
              Cargando historial...
            </p>
          ) : records.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-600">
              No se encontraron modificaciones para los filtros seleccionados.
            </p>
          ) : (
            <div className="grid gap-3">
              {records.map((record) => {
                const expanded = expandedId === record.id;

                return (
                  <article
                    key={record.id}
                    className={`overflow-hidden rounded-2xl border border-[#c5d8eb] ${uiListRowClass(false)}`}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? "" : record.id)}
                      className="grid w-full gap-2 px-4 py-3 text-left sm:grid-cols-[1fr_1.3fr_0.8fr_1fr_auto] sm:items-center"
                    >
                      <span className="text-sm font-semibold text-[#0f2747]">
                        {formatHistoryDate(record.createdAt)}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-sm text-[#0f2747]">
                          {record.propietarioName}
                        </strong>
                        <span className="text-xs text-slate-600">
                          RUT {record.propietarioRut || "—"} · Móvil{" "}
                          {record.vehicleNumber || "—"}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-[#173b68]">
                        {record.actorName}
                      </span>
                      <span className="text-xs text-slate-600">
                        {record.movementLabel} · {record.changes.length}{" "}
                        {record.changes.length === 1 ? "campo" : "campos"}
                      </span>
                      <span className="text-sm font-bold text-[#0b5cab]">
                        {expanded ? "Ocultar" : "Detalle"}
                      </span>
                    </button>

                    {expanded ? (
                      <div className="border-t border-[#c5d8eb] bg-[#f8fbff] px-4 py-4">
                        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                          {record.newStatus ? (
                            <span
                              className={getPropietarioStatusBadgeClassName(
                                record.newStatus,
                              )}
                            >
                              Estado resultante:{" "}
                              {formatPropietarioStatusLabel(record.newStatus)}
                            </span>
                          ) : null}
                          <span className="text-slate-600">
                            {notificationLabel(record.notificationStatus)}
                          </span>
                        </div>

                        <div className="grid gap-2">
                          {record.changes.map((change, index) => (
                            <div
                              key={`${record.id}-${change.field}-${index}`}
                              className="rounded-2xl border border-[#d7e7f8] bg-white px-4 py-3"
                            >
                              <p className="text-xs font-semibold text-[#173b68]">
                                {change.label}
                              </p>
                              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                                <p className="min-w-0 break-words text-slate-600">
                                  <strong>Anterior:</strong> {change.before}
                                </p>
                                <p className="min-w-0 break-words text-[#0f2747]">
                                  <strong>Nuevo:</strong> {change.after}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {canChangeStatus &&
                        record.propietarioId &&
                        record.currentStatus &&
                        record.currentUpdatedAt ? (
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#c5d8eb] pt-3">
                            <span className="text-sm text-slate-600">
                              Estado actual:{" "}
                              <strong>
                                {formatPropietarioStatusLabel(
                                  record.currentStatus,
                                )}
                              </strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => setStatusRecord(record)}
                              className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c]"
                            >
                              Cambiar Estado
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-slate-600">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="inline-flex h-9 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-xs font-semibold text-[#173b68] disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages || isLoading}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </section>

      <PropietarioHistoryStatusDialog
        open={Boolean(statusRecord?.currentStatus)}
        propietarioName={statusRecord?.propietarioName ?? ""}
        currentStatus={statusRecord?.currentStatus ?? "activo"}
        isSaving={isSavingStatus}
        onClose={() => {
          if (!isSavingStatus) {
            setStatusRecord(null);
          }
        }}
        onSubmit={(input) => void saveStatus(input)}
      />
      {dialog}
    </main>
  );
}
