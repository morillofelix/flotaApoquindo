"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { adminFetchInit } from "@/lib/admin-fetch";
import {
  loadDriverGroups,
  loadMonthlySchedule,
  loadOperationalStatuses,
} from "@/lib/agendamientos-admin";
import type { DriverGroupConfig } from "@/lib/driver-groups";
import type { HolidayConfig } from "@/lib/holidays";
import type { OperationalStatusConfig } from "@/lib/operational-status";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type StatusBrief = Pick<
  OperationalStatusConfig,
  "id" | "code" | "name" | "color"
> &
  Partial<
    Pick<OperationalStatusConfig, "blocksAssignments" | "indicatesAvailability">
  >;
type ScheduleDay = {
  id: string;
  date: string;
  driverOwnerId: string;
  vehicleNumber: string;
  driver: {
    id: string;
    vehicleNumber: string;
    fullName: string;
    group: { id: string; code: string; name: string } | null;
  };
  baseStatus: StatusBrief | null;
  effectiveStatus: StatusBrief | null;
  observation: string;
  changeOrigin: string;
  isManualOverride: boolean;
  version: number;
  eventsCount: number;
  shift?: { code?: string; name?: string } | null;
};
type SchedulePayload = {
  schedule: null | {
    id: string;
    year: number;
    month: number;
    status: string;
    generatedAt: string | null;
    updatedAt: string;
  };
  days: ScheduleDay[];
  summary: {
    totalDays: number;
    drivers: number;
    manualOverrides: number;
    byStatus: Record<string, number>;
  };
};
type Row = {
  id: string;
  vehicle: string;
  driverName: string;
  groupId: string;
  groupName: string;
  shift: string;
  observation: string;
  byDate: Map<string, ScheduleDay>;
};
type EditForm = { day: ScheduleDay; statusCode: string; observation: string };
type GenerateMode = "all" | "group" | "vehicle" | "range";
type GenerateForm = {
  mode: GenerateMode;
  groupId: string;
  vehicleNumber: string;
  vehicleFrom: string;
  vehicleTo: string;
};
type GeneratePreview = {
  driversCount: number;
  daysPerDriver: number;
  estimatedCells: number;
  vehicleNumbers?: string[];
  sample: Array<{ vehicleNumber: string; fullName: string; groupName: string }>;
};
type GenerateProgressState = {
  phase: "preparing" | "batch" | "done" | "error";
  processed: number;
  total: number;
  percent: number;
  message: string;
  batchIndex?: number;
  batchCount?: number;
};

const months = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat("es-CL", { month: "long" }).format(
    new Date(2026, index, 1),
  ),
);
const controlClass =
  "h-9 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-xs text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";
const buttonClass =
  "inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] disabled:cursor-not-allowed disabled:bg-slate-300";
const today = new Date();
const emptyGenerateForm = (): GenerateForm => ({
  mode: "range",
  groupId: "",
  vehicleNumber: "",
  vehicleFrom: "001",
  vehicleTo: "050",
});

export default function PlanificacionMensualPage() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<SchedulePayload | null>(null);
  const [statuses, setStatuses] = useState<OperationalStatusConfig[]>([]);
  const [holidays, setHolidays] = useState<HolidayConfig[]>([]);
  const [driverGroups, setDriverGroups] = useState<DriverGroupConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [filters, setFilters] = useState({
    vehicle: "",
    driver: "",
    group: "",
    status: "",
    blocked: false,
  });
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState<GenerateForm>(emptyGenerateForm);
  const [preview, setPreview] = useState<GeneratePreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generateProgress, setGenerateProgress] =
    useState<GenerateProgressState | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [schedule, statusList, holidayResponse, groups] = await Promise.all([
        loadMonthlySchedule(year, month),
        loadOperationalStatuses(),
        fetch(`/api/holidays?year=${year}`, { cache: "no-store" }).then(
          async (response) => {
            if (!response.ok) throw new Error("No se pudieron cargar los feriados.");
            return (await response.json()) as { holidays?: HolidayConfig[] };
          },
        ),
        loadDriverGroups(),
      ]);
      setData(schedule as SchedulePayload);
      setStatuses(statusList);
      setHolidays(holidayResponse.holidays ?? []);
      setDriverGroups(groups);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo cargar la planificación.",
      );
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (editDirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [editDirty]);

  const calendarDays = useMemo(
    () =>
      Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
        const day = index + 1;
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const parsed = new Date(`${date}T12:00:00`);
        return {
          day,
          date,
          weekday: new Intl.DateTimeFormat("es-CL", { weekday: "short" })
            .format(parsed)
            .replace(".", ""),
          weekend: [0, 6].includes(parsed.getDay()),
        };
      }),
    [month, year],
  );
  const holidayMap = useMemo(
    () =>
      new Map(
        holidays.filter((item) => item.isActive).map((item) => [item.date, item]),
      ),
    [holidays],
  );
  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const day of data?.days ?? []) {
      const current = map.get(day.driverOwnerId) ?? {
        id: day.driverOwnerId,
        vehicle: day.vehicleNumber || day.driver.vehicleNumber,
        driverName: day.driver.fullName,
        groupId: day.driver.group?.id ?? "",
        groupName: day.driver.group?.name ?? "Sin grupo",
        shift: day.shift?.name || day.shift?.code || "—",
        observation: day.observation || "",
        byDate: new Map<string, ScheduleDay>(),
      };
      current.byDate.set(day.date, day);
      if (!current.observation && day.observation) {
        current.observation = day.observation;
      }
      if (current.shift === "—" && day.shift) {
        current.shift = day.shift.name || day.shift.code || "—";
      }
      map.set(day.driverOwnerId, current);
    }
    return [...map.values()].sort((a, b) =>
      a.vehicle.localeCompare(b.vehicle, "es", { numeric: true }),
    );
  }, [data]);
  const filterGroups = useMemo(
    () => [
      ...new Map(
        rows
          .filter((row) => row.groupId)
          .map((row) => [row.groupId, row.groupName]),
      ).entries(),
    ],
    [rows],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (
          filters.vehicle &&
          !row.vehicle.toLowerCase().includes(filters.vehicle.toLowerCase())
        ) {
          return false;
        }
        if (
          filters.driver &&
          !row.driverName.toLowerCase().includes(filters.driver.toLowerCase())
        ) {
          return false;
        }
        if (filters.group && row.groupId !== filters.group) return false;
        const days = [...row.byDate.values()];
        if (
          filters.status &&
          !days.some((day) => day.effectiveStatus?.code === filters.status)
        ) {
          return false;
        }
        if (
          filters.blocked &&
          !days.some((day) => day.effectiveStatus?.code === "BLOQUEADO")
        ) {
          return false;
        }
        return true;
      }),
    [filters, rows],
  );

  const refreshPreview = useCallback(
    async (form: GenerateForm) => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const params = new URLSearchParams({
          year: String(year),
          month: String(month),
          preview: "1",
          mode: form.mode,
        });
        if (form.mode === "group" && form.groupId) {
          params.set("groupId", form.groupId);
        }
        if (form.mode === "vehicle" && form.vehicleNumber) {
          params.set("vehicleNumber", form.vehicleNumber);
        }
        if (form.mode === "range") {
          params.set("vehicleFrom", form.vehicleFrom);
          params.set("vehicleTo", form.vehicleTo);
        }
        const response = await fetch(`/api/monthly-schedules?${params}`, {
          ...adminFetchInit,
          cache: "no-store",
        });
        const body = (await response.json()) as {
          message?: string;
          preview?: GeneratePreview;
        };
        if (!response.ok) {
          throw new Error(body.message || "No se pudo calcular el alcance.");
        }
        setPreview(body.preview ?? null);
      } catch (caught) {
        setPreview(null);
        setPreviewError(
          caught instanceof Error
            ? caught.message
            : "No se pudo calcular el alcance.",
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [month, year],
  );

  useEffect(() => {
    if (!generateOpen) return;
    const timer = window.setTimeout(() => {
      void refreshPreview(generateForm);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [generateForm, generateOpen, refreshPreview]);

  function changePeriod(nextYear: number, nextMonth: number) {
    if (
      editDirty &&
      !window.confirm(
        "Hay cambios pendientes en la edición abierta. ¿Deseas descartarlos y cambiar de mes?",
      )
    ) {
      return;
    }
    setEdit(null);
    setEditDirty(false);
    setMessage("");
    setYear(nextYear);
    setMonth(nextMonth);
  }

  function moveMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    changePeriod(date.getFullYear(), date.getMonth() + 1);
  }

  function openGenerate() {
    setGenerateForm(emptyGenerateForm());
    setPreview(null);
    setPreviewError("");
    setGenerateProgress(null);
    setGenerateOpen(true);
  }

  async function runGenerate() {
    if (!preview?.driversCount) {
      setPreviewError("No hay conductores en el alcance seleccionado.");
      return;
    }
    if (
      generateForm.mode === "all" &&
      preview.driversCount > 200 &&
      !window.confirm(
        `Vas a generar ${preview.driversCount} conductores (~${preview.estimatedCells} celdas). Verás el avance lote a lote. ¿Continuar?`,
      )
    ) {
      return;
    }

    const vehicles = preview.vehicleNumbers?.filter(Boolean) ?? [];
    if (!vehicles.length) {
      setPreviewError(
        "No se pudo obtener la lista de móviles. Cambia el alcance o vuelve a abrir el modal.",
      );
      return;
    }

    const chunkSize = 40;
    const batchCount = Math.ceil(vehicles.length / chunkSize);

    setBusy(true);
    setError("");
    setMessage("");
    setGenerateProgress({
      phase: "preparing",
      processed: 0,
      total: vehicles.length,
      percent: 0,
      message: `Preparando ${vehicles.length} conductores en ${batchCount} lotes…`,
      batchIndex: 0,
      batchCount,
    });

    const totals = {
      driversTargeted: 0,
      created: 0,
      updated: 0,
      preservedManualOverrides: 0,
      days: 0,
    };

    try {
      for (let offset = 0; offset < vehicles.length; offset += chunkSize) {
        const chunk = vehicles.slice(offset, offset + chunkSize);
        const batchIndex = Math.floor(offset / chunkSize) + 1;

        setGenerateProgress({
          phase: "batch",
          processed: offset,
          total: vehicles.length,
          percent: Math.round((offset / vehicles.length) * 100),
          message: `Procesando lote ${batchIndex}/${batchCount} (${chunk[0]}…${chunk[chunk.length - 1]})`,
          batchIndex,
          batchCount,
        });

        const response = await fetch("/api/monthly-schedules", {
          ...adminFetchInit,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate",
            year,
            month,
            preserveManualOverrides: true,
            mode: "vehicles",
            vehicleNumbers: chunk,
          }),
        });
        const body = (await response.json()) as {
          message?: string;
          summary?: {
            driversTargeted?: number;
            created?: number;
            updated?: number;
            preservedManualOverrides?: number;
            days?: number;
          };
        };
        if (!response.ok) {
          throw new Error(
            body.message ||
              `Error en lote ${batchIndex}/${batchCount}. Se generaron ${totals.driversTargeted} conductores antes del fallo.`,
          );
        }

        totals.driversTargeted += body.summary?.driversTargeted ?? chunk.length;
        totals.created += body.summary?.created ?? 0;
        totals.updated += body.summary?.updated ?? 0;
        totals.preservedManualOverrides +=
          body.summary?.preservedManualOverrides ?? 0;
        totals.days += body.summary?.days ?? 0;

        const processed = Math.min(offset + chunk.length, vehicles.length);
        setGenerateProgress({
          phase: "batch",
          processed,
          total: vehicles.length,
          percent: Math.round((processed / vehicles.length) * 100),
          message: `Lote ${batchIndex}/${batchCount} listo · ${processed} de ${vehicles.length}`,
          batchIndex,
          batchCount,
        });
      }

      setGenerateProgress({
        phase: "done",
        processed: vehicles.length,
        total: vehicles.length,
        percent: 100,
        message: "Generación completada",
        batchIndex: batchCount,
        batchCount,
      });

      await new Promise((resolve) => window.setTimeout(resolve, 700));
      setGenerateOpen(false);
      setGenerateProgress(null);
      await reload();
      setMessage(
        `Completado: ${totals.driversTargeted} conductores · ${totals.days} días · creados ${totals.created} · actualizados ${totals.updated} · manuales conservados ${totals.preservedManualOverrides}.`,
      );
    } catch (caught) {
      const text =
        caught instanceof Error
          ? caught.message
          : "No se pudo generar la planificación.";
      setGenerateProgress((current) =>
        current
          ? { ...current, phase: "error", message: text }
          : {
              phase: "error",
              processed: 0,
              total: vehicles.length,
              percent: 0,
              message: text,
            },
      );
      setError(text);
    } finally {
      setBusy(false);
    }
  }

  async function saveDay() {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/monthly-schedules/day", {
        ...adminFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: edit.day.id,
          statusCode: edit.statusCode,
          observation: edit.observation,
          expectedVersion: edit.day.version,
          isManualOverride: true,
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message || "No se pudo guardar el día.");
      }
      setEdit(null);
      setEditDirty(false);
      await reload();
      setMessage("Día actualizado correctamente.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo guardar el día.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const sheetRows = filteredRows.map((row) => {
      const base: Record<string, string> = {
        Móvil: row.vehicle,
        Conductor: row.driverName,
        Grupo: row.groupName,
        Turno: row.shift,
        Observación: row.observation,
      };
      for (const column of calendarDays) {
        base[`${column.day} ${column.weekday}`] =
          row.byDate.get(column.date)?.effectiveStatus?.code ?? "";
      }
      return base;
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(sheetRows),
      "Planificación",
    );
    XLSX.writeFile(
      workbook,
      `planificacion-${year}-${String(month).padStart(2, "0")}.xlsx`,
    );
  }

  const lastUpdatedAt = data?.schedule?.updatedAt
    ? new Date(data.schedule.updatedAt)
    : null;
  const isToday = (date: string) =>
    date ===
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));

  return (
    <main className="w-full px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-[1900px]">
        <MaintainerPageHeader
          title="Planificación mensual"
          subtitle="Flota"
          onRefresh={() => void reload()}
          isRefreshing={loading}
          lastUpdatedAt={lastUpdatedAt}
        />
        <section className="mb-4 rounded-[22px] border border-[#b7cce4] bg-[#f8fbff] p-4 shadow-lg shadow-slate-300/20">
          <div className="flex flex-wrap items-end gap-2">
            <Label text="Mes">
              <select
                value={month}
                onChange={(e) => changePeriod(year, Number(e.target.value))}
                className={controlClass}
              >
                {months.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Año">
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => changePeriod(Number(e.target.value), month)}
                className={`${controlClass} w-24`}
              />
            </Label>
            <button type="button" onClick={() => moveMonth(-1)} className={buttonClass}>
              ← Anterior
            </button>
            <button
              type="button"
              onClick={() =>
                changePeriod(today.getFullYear(), today.getMonth() + 1)
              }
              className={buttonClass}
            >
              Mes actual
            </button>
            <button type="button" onClick={() => moveMonth(1)} className={buttonClass}>
              Siguiente →
            </button>
            <div className="ml-auto flex flex-wrap gap-2">
              <Link href="/agendamientos/turnos" className={buttonClass}>
                Administrar turnos
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={openGenerate}
                className={buttonClass}
              >
                Generar / Regenerar
              </button>
              <button
                type="button"
                disabled={!filteredRows.length}
                onClick={() => void exportExcel()}
                className="inline-flex h-9 items-center rounded-2xl border border-emerald-500 bg-white px-4 text-xs font-semibold text-emerald-700 disabled:border-slate-300 disabled:text-slate-400"
              >
                Exportar Excel
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Periodo activo: <strong className="capitalize">{monthLabel}</strong>.
            Genera por grupo o por rango de móviles para controlar el alcance.
            La generación anterior se cortó ~a 7 por timeout; ahora puedes
            generar por lotes.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1fr_1fr_auto_auto]">
            <Label text="Móvil">
              <input
                value={filters.vehicle}
                onChange={(e) =>
                  setFilters({ ...filters, vehicle: e.target.value })
                }
                className={controlClass}
              />
            </Label>
            <Label text="Conductor">
              <input
                value={filters.driver}
                onChange={(e) =>
                  setFilters({ ...filters, driver: e.target.value })
                }
                className={controlClass}
              />
            </Label>
            <Label text="Grupo">
              <select
                value={filters.group}
                onChange={(e) =>
                  setFilters({ ...filters, group: e.target.value })
                }
                className={controlClass}
              >
                <option value="">Todos</option>
                {filterGroups.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Estado">
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className={controlClass}
              >
                <option value="">Todos</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.code}>
                    {status.name}
                  </option>
                ))}
              </select>
            </Label>
            <label className="flex h-9 items-center gap-2 self-end rounded-2xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68]">
              <input
                type="checkbox"
                checked={filters.blocked}
                onChange={(e) =>
                  setFilters({ ...filters, blocked: e.target.checked })
                }
                className="accent-[#0b5cab]"
              />
              Bloqueado
            </label>
            <button
              type="button"
              onClick={() =>
                setFilters({
                  vehicle: "",
                  driver: "",
                  group: "",
                  status: "",
                  blocked: false,
                })
              }
              className={`${buttonClass} self-end`}
            >
              Limpiar filtros
            </button>
          </div>
        </section>

        {message ? (
          <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {!loading && !data?.schedule ? (
          <section className="rounded-[22px] border border-[#b7cce4] bg-white p-12 text-center shadow-lg shadow-slate-300/20">
            <h2 className="font-heading text-xl font-semibold text-[#0f2747]">
              Este mes aún no tiene planificación
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Elige un alcance (grupo o rango de móviles) y genera el mes.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={openGenerate}
              className={`${buttonClass} mt-5`}
            >
              Generar mes
            </button>
          </section>
        ) : null}

        {data?.schedule ? (
          <section className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25">
            <div className="max-h-[68dvh] overflow-auto">
              <table className="border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-30 bg-[#d7e7f8] text-[#0f2747]">
                  <tr>
                    <StickyHead left={0} width={76}>
                      Móvil
                    </StickyHead>
                    <StickyHead left={76} width={180}>
                      Conductor
                    </StickyHead>
                    <StickyHead left={256} width={120}>
                      Grupo
                    </StickyHead>
                    <StickyHead left={376} width={110}>
                      Turno
                    </StickyHead>
                    <StickyHead left={486} width={160}>
                      Observación
                    </StickyHead>
                    {calendarDays.map((column) => (
                      <th
                        key={column.date}
                        title={holidayMap.get(column.date)?.name}
                        className={`min-w-[48px] border-b border-r border-[#b7cce4] px-1 py-2 text-center ${
                          holidayMap.has(column.date)
                            ? "bg-rose-200"
                            : isToday(column.date)
                              ? "bg-amber-200"
                              : column.weekend
                                ? "bg-slate-200"
                                : "bg-[#d7e7f8]"
                        }`}
                      >
                        <span className="block text-sm">{column.day}</span>
                        <span className="text-[9px] uppercase">
                          {column.weekday}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-[#eef5ff]">
                      <StickyCell left={0} width={76}>
                        <strong>{row.vehicle}</strong>
                      </StickyCell>
                      <StickyCell left={76} width={180}>
                        {row.driverName}
                      </StickyCell>
                      <StickyCell left={256} width={120}>
                        {row.groupName}
                      </StickyCell>
                      <StickyCell left={376} width={110}>
                        {row.shift}
                      </StickyCell>
                      <StickyCell left={486} width={160}>
                        <span
                          className="block max-w-[145px] truncate"
                          title={row.observation}
                        >
                          {row.observation || "—"}
                        </span>
                      </StickyCell>
                      {calendarDays.map((column) => {
                        const day = row.byDate.get(column.date);
                        const status = day?.effectiveStatus;
                        return (
                          <td
                            key={column.date}
                            className={`h-10 min-w-[48px] border-b border-r border-[#d7e7f8] p-1 text-center ${
                              column.weekend ? "bg-slate-50" : ""
                            }`}
                          >
                            {day ? (
                              <button
                                type="button"
                                title={`${status?.name ?? "Sin estado"}${
                                  day.observation ? ` · ${day.observation}` : ""
                                }`}
                                onClick={() => {
                                  setEdit({
                                    day,
                                    statusCode: status?.code ?? "",
                                    observation: day.observation,
                                  });
                                  setEditDirty(false);
                                }}
                                className="relative h-8 w-9 rounded-lg text-[10px] font-bold"
                                style={{
                                  color: status?.color,
                                  backgroundColor: `${status?.color ?? "#64748b"}20`,
                                  border: `1px solid ${status?.color ?? "#94a3b8"}55`,
                                }}
                              >
                                {status?.code
                                  ? status.code.length <= 4
                                    ? status.code
                                    : status.code.slice(0, 1)
                                  : "—"}
                                <span className="absolute -right-1 -top-1 flex gap-0.5">
                                  {day.eventsCount > 0 ? (
                                    <i className="h-2 w-2 rounded-full bg-violet-500" />
                                  ) : null}
                                  {day.observation ? (
                                    <i className="h-2 w-2 rounded-full bg-amber-500" />
                                  ) : null}
                                  {day.isManualOverride ? (
                                    <i className="h-2 w-2 rounded-full bg-[#0b5cab]" />
                                  ) : null}
                                </span>
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredRows.length ? (
                <p className="p-10 text-center text-sm text-slate-500">
                  No hay filas que coincidan con los filtros.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-[#b7cce4] bg-[#eef3f9] px-4 py-3 text-xs text-[#173b68]">
              <strong>{data.summary.drivers} conductores en matriz</strong>
              <span>·</span>
              <span>{data.summary.totalDays} días planificados</span>
              <span>·</span>
              <span>{data.summary.manualOverrides} ajustes manuales</span>
              {Object.entries(data.summary.byStatus).map(([code, total]) => (
                <span
                  key={code}
                  className="rounded-full border border-[#b7cce4] bg-white px-2 py-1"
                >
                  {code}: <strong>{total}</strong>
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {generateOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f2747]/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-[22px] border border-[#b7cce4] bg-[#f8fbff] p-5 shadow-2xl">
            <h2 className="font-heading text-lg font-semibold text-[#0f2747]">
              Generar planificación
            </h2>
            <p className="mt-1 text-sm capitalize text-slate-600">
              Periodo: {monthLabel}
            </p>
            <div className="mt-4 grid gap-3">
              <Label text="Alcance">
                <select
                  value={generateForm.mode}
                  disabled={busy}
                  onChange={(e) =>
                    setGenerateForm({
                      ...generateForm,
                      mode: e.target.value as GenerateMode,
                    })
                  }
                  className={controlClass}
                >
                  <option value="range">Rango de móviles</option>
                  <option value="group">Por grupo principal</option>
                  <option value="vehicle">Un móvil</option>
                  <option value="all">Toda la flota activa</option>
                </select>
              </Label>
              {generateForm.mode === "group" ? (
                <Label text="Grupo">
                  <select
                    value={generateForm.groupId}
                    disabled={busy}
                    onChange={(e) =>
                      setGenerateForm({
                        ...generateForm,
                        groupId: e.target.value,
                      })
                    }
                    className={controlClass}
                  >
                    <option value="">Selecciona</option>
                    {driverGroups
                      .filter((group) => group.isActive)
                      .map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                  </select>
                </Label>
              ) : null}
              {generateForm.mode === "vehicle" ? (
                <Label text="Número de móvil">
                  <input
                    value={generateForm.vehicleNumber}
                    disabled={busy}
                    onChange={(e) =>
                      setGenerateForm({
                        ...generateForm,
                        vehicleNumber: e.target.value,
                      })
                    }
                    placeholder="Ej: 025"
                    className={controlClass}
                  />
                </Label>
              ) : null}
              {generateForm.mode === "range" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Label text="Desde">
                    <input
                      value={generateForm.vehicleFrom}
                      disabled={busy}
                      onChange={(e) =>
                        setGenerateForm({
                          ...generateForm,
                          vehicleFrom: e.target.value,
                        })
                      }
                      placeholder="001"
                      className={controlClass}
                    />
                  </Label>
                  <Label text="Hasta">
                    <input
                      value={generateForm.vehicleTo}
                      disabled={busy}
                      onChange={(e) =>
                        setGenerateForm({
                          ...generateForm,
                          vehicleTo: e.target.value,
                        })
                      }
                      placeholder="050"
                      className={controlClass}
                    />
                  </Label>
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-[#b7cce4] bg-white p-3 text-xs text-[#173b68]">
              {previewLoading ? (
                <p>Calculando alcance…</p>
              ) : previewError ? (
                <p className="text-red-700">{previewError}</p>
              ) : preview ? (
                <>
                  <p>
                    Se generarán{" "}
                    <strong>{preview.driversCount} conductores</strong> ×{" "}
                    <strong>{preview.daysPerDriver} días</strong> ={" "}
                    <strong>{preview.estimatedCells}</strong> celdas.
                  </p>
                  {preview.sample.length ? (
                    <ul className="mt-2 space-y-1 text-slate-600">
                      {preview.sample.map((item) => (
                        <li key={item.vehicleNumber}>
                          {item.vehicleNumber} · {item.fullName} ·{" "}
                          {item.groupName}
                        </li>
                      ))}
                      {preview.driversCount > preview.sample.length ? (
                        <li>
                          … y {preview.driversCount - preview.sample.length} más
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                  <p className="mt-2 text-slate-500">
                    Se conservan modificaciones manuales ya guardadas. Puedes
                    generar toda la flota; el avance se muestra abajo.
                  </p>
                </>
              ) : (
                <p>Define el alcance para ver cuántos se generarán.</p>
              )}
            </div>

            {generateProgress ? (
              <div
                className={`mt-4 rounded-2xl border p-3 ${
                  generateProgress.phase === "done"
                    ? "border-emerald-300 bg-emerald-50"
                    : generateProgress.phase === "error"
                      ? "border-red-300 bg-red-50"
                      : "border-[#b7cce4] bg-white"
                }`}
                aria-live="polite"
              >
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-[#0f2747]">
                  <span>
                    {generateProgress.phase === "done"
                      ? "Completado"
                      : generateProgress.phase === "error"
                        ? "Error en la generación"
                        : "Generando…"}
                  </span>
                  <span>{generateProgress.percent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[#d7e4f4]">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                      generateProgress.phase === "done"
                        ? "bg-emerald-600"
                        : generateProgress.phase === "error"
                          ? "bg-red-500"
                          : "bg-[#0b5cab]"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(0, generateProgress.percent))}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {generateProgress.message}
                </p>
                {generateProgress.total > 0 ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {generateProgress.processed} / {generateProgress.total}{" "}
                    conductores
                    {generateProgress.batchIndex && generateProgress.batchCount
                      ? ` · lote ${generateProgress.batchIndex}/${generateProgress.batchCount}`
                      : ""}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (busy) return;
                  setGenerateOpen(false);
                  setGenerateProgress(null);
                }}
                className={buttonClass}
              >
                {generateProgress?.phase === "error" ? "Cerrar" : "Cancelar"}
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  previewLoading ||
                  !preview?.driversCount ||
                  generateProgress?.phase === "done"
                }
                onClick={() => void runGenerate()}
                className={buttonClass}
              >
                {busy
                  ? "Generando…"
                  : generateProgress?.phase === "error"
                    ? "Reintentar"
                    : "Confirmar generación"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f2747]/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-[22px] border border-[#b7cce4] bg-[#f8fbff] p-5 shadow-2xl">
            <h2 className="font-heading text-lg font-semibold text-[#0f2747]">
              Editar día
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {new Intl.DateTimeFormat("es-CL", { dateStyle: "full" }).format(
                new Date(`${edit.day.date}T12:00:00`),
              )}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-[#b7cce4] bg-white p-3 text-xs">
              <div>
                <dt className="font-semibold text-[#173b68]">Móvil</dt>
                <dd>{edit.day.vehicleNumber}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#173b68]">Conductor</dt>
                <dd>{edit.day.driver.fullName}</dd>
              </div>
            </dl>
            <div className="mt-4 grid gap-3">
              <Label text="Estado">
                <select
                  value={edit.statusCode}
                  onChange={(e) => {
                    setEdit({ ...edit, statusCode: e.target.value });
                    setEditDirty(true);
                  }}
                  className={controlClass}
                >
                  {statuses
                    .filter((status) => status.isActive)
                    .map((status) => (
                      <option key={status.id} value={status.code}>
                        {status.code} · {status.name}
                      </option>
                    ))}
                </select>
              </Label>
              <Label text="Observación">
                <textarea
                  rows={4}
                  value={edit.observation}
                  onChange={(e) => {
                    setEdit({ ...edit, observation: e.target.value });
                    setEditDirty(true);
                  }}
                  className="rounded-2xl border border-[#9fb8d9] bg-white p-3 text-sm outline-none focus:border-[#0b5cab]"
                />
              </Label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEdit(null);
                  setEditDirty(false);
                }}
                className={buttonClass}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || !edit.statusCode}
                onClick={() => void saveDay()}
                className={buttonClass}
              >
                {busy ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Label({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold text-[#173b68]">{text}</span>
      {children}
    </label>
  );
}
function StickyHead({
  left,
  width,
  children,
}: {
  left: number;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <th
      className="sticky z-40 border-b border-r border-[#b7cce4] bg-[#d7e7f8] px-2 py-2 text-left text-[10px] uppercase tracking-wide"
      style={{ left, minWidth: width, width }}
    >
      {children}
    </th>
  );
}
function StickyCell({
  left,
  width,
  children,
}: {
  left: number;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <td
      className="sticky z-20 border-b border-r border-[#d7e7f8] bg-white px-2 py-2 text-[#0f2747]"
      style={{ left, minWidth: width, width }}
    >
      {children}
    </td>
  );
}
