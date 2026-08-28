"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import MonthlyGenerateWizard, {
  type WizardDriver,
} from "@/components/agendamientos/MonthlyGenerateWizard";
import { adminFetchInit } from "@/lib/admin-fetch";
import {
  loadDriverGroups,
  loadDriverOwners,
  loadMonthlySchedule,
  loadOperationalStatuses,
  loadShiftDefinitions,
} from "@/lib/agendamientos-admin";
import type { DriverGroupConfig } from "@/lib/driver-groups";
import type { HolidayConfig } from "@/lib/holidays";
import type { OperationalStatusConfig } from "@/lib/operational-status";
import type { ShiftDefinitionConfig } from "@/lib/shift-definitions";
import { downloadMonthlyPlanningExcel } from "@/lib/monthly-planning-excel-export";
import Link from "next/link";
import { planningBlockDetailLabel, planningDayTooltip } from "@/lib/planning-day-tooltip";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  shift?: { code?: string; name?: string } | null;
  eventsCount: number;
  startTime?: string;
  endTime?: string;
  appointment?: {
    appointmentReason: string;
    permitType: string;
    observation: string;
    permitStartTime: string;
    permitEndTime: string;
  } | null;
  driverBlock?: {
    id: string;
    startsAt: string;
    endsAt: string | null;
    observation: string;
    isActive: boolean;
    status: string;
    isHourBlock: boolean;
    startTime: string;
    endTime: string;
    startDate: string;
    endDate: string;
  } | null;
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
type EditForm = {
  day: ScheduleDay;
  statusCode: string;
  observation: string;
  blockMode: "days" | "hours";
  blockStartDate: string;
  blockEndDate: string;
  blockStartTime: string;
  blockEndTime: string;
};

function createEditForm(day: ScheduleDay): EditForm {
  const block = day.driverBlock;
  return {
    day,
    statusCode: (day.effectiveStatus?.code ?? "").toUpperCase(),
    observation: block?.observation || day.observation || "",
    blockMode: block?.isHourBlock ? "hours" : "days",
    blockStartDate: block?.startDate || day.date,
    blockEndDate: block?.endDate || block?.startDate || day.date,
    blockStartTime: block?.startTime || "08:00",
    blockEndTime: block?.endTime || "18:00",
  };
}
type GenerateMode = "all" | "group" | "vehicle" | "range" | "shift";
type GenerateForm = {
  mode: GenerateMode;
  groupId: string;
  vehicleNumber: string;
  vehicleFrom: string;
  vehicleTo: string;
  shiftDefinitionId: string;
};
type DeletePreview = {
  driversCount: number;
  driversInScope?: number;
  daysCount: number;
  manualOverrides: number;
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
const dangerButtonClass =
  "inline-flex h-9 items-center justify-center rounded-2xl border border-red-300 bg-white px-4 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
const today = new Date();
const emptyGenerateForm = (): GenerateForm => ({
  mode: "range",
  groupId: "",
  vehicleNumber: "",
  vehicleFrom: "001",
  vehicleTo: "050",
  shiftDefinitionId: "",
});

/** Columnas fijas izquierda de la matriz (compactas). */
const STICKY = {
  mobile: { left: 0, width: 54 },
  driver: { left: 54, width: 132 },
  group: { left: 186, width: 82 },
  shift: { left: 268, width: 76 },
  obs: { left: 344, width: 96 },
} as const;
const STICKY_COUNT = 5;

function appendScopeParams(params: URLSearchParams, form: GenerateForm) {
  params.set("mode", form.mode);
  if (form.mode === "group" && form.groupId) params.set("groupId", form.groupId);
  if (form.mode === "vehicle" && form.vehicleNumber) {
    params.set("vehicleNumber", form.vehicleNumber);
  }
  if (form.mode === "range") {
    params.set("vehicleFrom", form.vehicleFrom);
    params.set("vehicleTo", form.vehicleTo);
  }
  if (form.mode === "shift" && form.shiftDefinitionId) {
    params.set("shiftDefinitionId", form.shiftDefinitionId);
  }
}

export default function PlanificacionMensualPage() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<SchedulePayload | null>(null);
  const [statuses, setStatuses] = useState<OperationalStatusConfig[]>([]);
  const [holidays, setHolidays] = useState<HolidayConfig[]>([]);
  const [driverGroups, setDriverGroups] = useState<DriverGroupConfig[]>([]);
  const [shiftDefinitions, setShiftDefinitions] = useState<
    ShiftDefinitionConfig[]
  >([]);
  const [wizardDrivers, setWizardDrivers] = useState<WizardDriver[]>([]);
  const [groupBy, setGroupBy] = useState<
    "none" | "group" | "shift" | "group_shift"
  >("none");
  const [groupsExpanded, setGroupsExpanded] = useState<Record<string, boolean>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [scheduleRefreshing, setScheduleRefreshing] = useState(false);
  const [wizardDriversLoading, setWizardDriversLoading] = useState(false);
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteForm, setDeleteForm] = useState<GenerateForm>(emptyGenerateForm);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [deletePreviewError, setDeletePreviewError] = useState("");
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [includeManualOnDelete, setIncludeManualOnDelete] = useState(true);
  const [deleteProgress, setDeleteProgress] =
    useState<GenerateProgressState | null>(null);
  const [controlsOpen, setControlsOpen] = useState(true);

  const reloadCatalog = useCallback(async () => {
    const [statusList, holidayResponse, groups, shifts] = await Promise.all([
      loadOperationalStatuses(),
      fetch(`/api/holidays?year=${year}`, { cache: "no-store" }).then(
        async (response) => {
          if (!response.ok)
            throw new Error("No se pudieron cargar los feriados.");
          return (await response.json()) as { holidays?: HolidayConfig[] };
        },
      ),
      loadDriverGroups(),
      loadShiftDefinitions(),
    ]);
    setStatuses(statusList);
    setHolidays(holidayResponse.holidays ?? []);
    setDriverGroups(groups);
    setShiftDefinitions(shifts.filter((shift) => shift.isActive));
  }, [year]);

  const reloadSchedule = useCallback(
    async (silent = false) => {
      if (silent) setScheduleRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const schedule = await loadMonthlySchedule(year, month);
        setData(schedule as SchedulePayload);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "No se pudo cargar la planificación.",
        );
      } finally {
        if (silent) setScheduleRefreshing(false);
        else setLoading(false);
      }
    },
    [month, year],
  );

  const reloadWizardDrivers = useCallback(async () => {
    setWizardDriversLoading(true);
    try {
      const [owners, assignRes] = await Promise.all([
        loadDriverOwners(),
        fetch("/api/driver-shift-assignments?active=true", {
          ...adminFetchInit,
          cache: "no-store",
        }).then(async (response) => {
          if (!response.ok) {
            return {
              assignments: [] as Array<{
                driverOwnerId?: string;
                shiftDefinitionId?: string | null;
                shiftDefinition?: {
                  id: string;
                  code: string;
                  name: string;
                } | null;
              }>,
            };
          }
          return (await response.json()) as {
            assignments?: Array<{
              driverOwnerId?: string;
              shiftDefinitionId?: string | null;
              shiftDefinition?: {
                id: string;
                code: string;
                name: string;
              } | null;
            }>;
          };
        }),
      ]);
      const assignByDriver = new Map(
        (assignRes.assignments ?? []).map((item) => [
          item.driverOwnerId ?? "",
          item,
        ]),
      );
      setWizardDrivers(
        owners.map((owner) => {
          const assign = assignByDriver.get(owner.id ?? "");
          return {
            id: owner.id ?? owner.vehicleNumber,
            vehicleNumber: owner.vehicleNumber,
            fullName: owner.fullName,
            rut: owner.rut ?? "",
            licensePlate: owner.licensePlate ?? "",
            groupId: owner.groupId ?? "",
            groupName: owner.groupName || "Sin grupo",
            isActive: owner.isActive,
            isConductor: owner.isConductor,
            shiftId:
              assign?.shiftDefinition?.id || assign?.shiftDefinitionId || "",
            shiftCode: assign?.shiftDefinition?.code || "",
            shiftName: assign?.shiftDefinition?.name || "",
          };
        }),
      );
    } catch {
      setWizardDrivers([]);
    } finally {
      setWizardDriversLoading(false);
    }
  }, []);

  const reload = useCallback(
    async (options?: { silent?: boolean; full?: boolean }) => {
      const silent = options?.silent === true;
      const full = options?.full === true;
      if (!silent) setLoading(true);
      setError("");
      try {
        if (full) {
          await Promise.all([
            reloadCatalog(),
            reloadSchedule(true),
            reloadWizardDrivers(),
          ]);
        } else if (silent) {
          await reloadSchedule(true);
        } else {
          await Promise.all([reloadCatalog(), reloadSchedule(true)]);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "No se pudo cargar la planificación.",
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [reloadCatalog, reloadSchedule, reloadWizardDrivers],
  );

  useEffect(() => {
    void reloadCatalog().catch((caught) => {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo cargar la planificación.",
      );
    });
  }, [reloadCatalog]);

  useEffect(() => {
    void reloadSchedule();
  }, [reloadSchedule]);

  useEffect(() => {
    if (!generateOpen) return;
    void reloadWizardDrivers();
  }, [generateOpen, reloadWizardDrivers]);

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

  const groupedMatrix = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "", rows: filteredRows }];
    }
    const map = new Map<string, { key: string; label: string; rows: Row[] }>();
    for (const row of filteredRows) {
      let key = "";
      let label = "";
      if (groupBy === "group") {
        key = row.groupId || "sin-grupo";
        label = row.groupName || "Sin grupo";
      } else if (groupBy === "shift") {
        key = row.shift || "sin-turno";
        label = row.shift || "Sin turno";
      } else {
        key = `${row.groupId || "sin-grupo"}::${row.shift || "sin-turno"}`;
        label = `${row.groupName || "Sin grupo"} · ${row.shift || "Sin turno"}`;
      }
      const bucket = map.get(key) ?? { key, label, rows: [] };
      bucket.rows.push(row);
      map.set(key, bucket);
    }
    return [...map.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "es", { numeric: true }),
    );
  }, [filteredRows, groupBy]);

  const deletePreviewAbortRef = useRef<AbortController | null>(null);

  const refreshDeletePreview = useCallback(
    async (form: GenerateForm) => {
      deletePreviewAbortRef.current?.abort();
      const controller = new AbortController();
      deletePreviewAbortRef.current = controller;
      setDeletePreviewLoading(true);
      setDeletePreviewError("");
      try {
        const params = new URLSearchParams({
          year: String(year),
          month: String(month),
          deletePreview: "1",
        });
        appendScopeParams(params, form);
        const response = await fetch(`/api/monthly-schedules?${params}`, {
          ...adminFetchInit,
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          message?: string;
          preview?: DeletePreview;
        };
        if (!response.ok) {
          throw new Error(body.message || "No se pudo calcular el alcance.");
        }
        setDeletePreview(body.preview ?? null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setDeletePreview(null);
        setDeletePreviewError(
          caught instanceof Error
            ? caught.message
            : "No se pudo calcular el alcance.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setDeletePreviewLoading(false);
        }
      }
    },
    [month, year],
  );

  useEffect(() => {
    if (!deleteOpen) return;
    const timer = window.setTimeout(() => {
      void refreshDeletePreview(deleteForm);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [deleteForm, deleteOpen, refreshDeletePreview]);

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
    setGenerateOpen(true);
  }

  function openDelete() {
    setDeleteForm(emptyGenerateForm());
    setDeletePreview(null);
    setDeletePreviewError("");
    setDeleteConfirmText("");
    setIncludeManualOnDelete(true);
    setDeleteProgress(null);
    setDeleteOpen(true);
  }

  async function runDelete() {
    if (!deletePreview?.daysCount) {
      setDeletePreviewError(
        "No hay días generados en este alcance para eliminar.",
      );
      return;
    }
    if (deleteConfirmText.trim().toUpperCase() !== "ELIMINAR") {
      setDeletePreviewError('Escribe ELIMINAR para confirmar la eliminación.');
      return;
    }
    if (
      !window.confirm(
        `¿Seguro que deseas revertir y eliminar ${deletePreview.daysCount} días de ${deletePreview.driversCount} conductores en ${monthLabel}? Verás el avance lote a lote. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    const vehicles = deletePreview.vehicleNumbers?.filter(Boolean) ?? [];
    if (!vehicles.length) {
      setDeletePreviewError(
        "No se pudo obtener la lista de móviles generados. Vuelve a abrir el modal.",
      );
      return;
    }

    const chunkSize = 40;
    const batchCount = Math.ceil(vehicles.length / chunkSize);

    setBusy(true);
    setError("");
    setMessage("");
    setDeleteProgress({
      phase: "preparing",
      processed: 0,
      total: vehicles.length,
      percent: 0,
      message: `Preparando eliminación de ${vehicles.length} conductores en ${batchCount} lotes…`,
      batchIndex: 0,
      batchCount,
    });

    const totals = {
      daysDeleted: 0,
      driversTargeted: 0,
      monthlyCleared: false,
    };

    try {
      for (let offset = 0; offset < vehicles.length; offset += chunkSize) {
        const chunk = vehicles.slice(offset, offset + chunkSize);
        const batchIndex = Math.floor(offset / chunkSize) + 1;

        setDeleteProgress({
          phase: "batch",
          processed: offset,
          total: vehicles.length,
          percent: Math.round((offset / vehicles.length) * 100),
          message: `Eliminando lote ${batchIndex}/${batchCount} (${chunk[0]}…${chunk[chunk.length - 1]})`,
          batchIndex,
          batchCount,
        });

        const response = await fetch("/api/monthly-schedules", {
          ...adminFetchInit,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete",
            year,
            month,
            confirmText: "ELIMINAR",
            includeManualOverrides: includeManualOnDelete,
            mode: "vehicles",
            vehicleNumbers: chunk,
          }),
        });
        const body = (await response.json()) as {
          message?: string;
          summary?: {
            daysDeleted?: number;
            driversTargeted?: number;
            monthlyCleared?: boolean;
          };
        };
        if (!response.ok) {
          throw new Error(
            body.message ||
              `Error en lote ${batchIndex}/${batchCount}. Se eliminaron ${totals.daysDeleted} días antes del fallo.`,
          );
        }

        totals.daysDeleted += body.summary?.daysDeleted ?? 0;
        totals.driversTargeted += body.summary?.driversTargeted ?? chunk.length;
        if (body.summary?.monthlyCleared) totals.monthlyCleared = true;

        const processed = Math.min(offset + chunk.length, vehicles.length);
        setDeleteProgress({
          phase: "batch",
          processed,
          total: vehicles.length,
          percent: Math.round((processed / vehicles.length) * 100),
          message: `Lote ${batchIndex}/${batchCount} listo · ${processed} de ${vehicles.length}`,
          batchIndex,
          batchCount,
        });
      }

      setDeleteProgress({
        phase: "done",
        processed: vehicles.length,
        total: vehicles.length,
        percent: 100,
        message: "Eliminación completada",
        batchIndex: batchCount,
        batchCount,
      });

      await new Promise((resolve) => window.setTimeout(resolve, 700));
      setDeleteOpen(false);
      setDeleteProgress(null);
      await reload({ silent: true });
      setMessage(
        `Eliminado: ${totals.daysDeleted} días de ${totals.driversTargeted} conductores${
          totals.monthlyCleared ? " · el mes quedó sin planificación" : ""
        }.`,
      );
    } catch (caught) {
      const text =
        caught instanceof Error
          ? caught.message
          : "No se pudo eliminar la generación.";
      setDeleteProgress((current) =>
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

  async function copyPreviousMonth() {
    const source = new Date(year, month - 2, 1);
    const sourceYear = source.getFullYear();
    const sourceMonth = source.getMonth() + 1;
    const sourceLabel = new Intl.DateTimeFormat("es-CL", {
      month: "long",
      year: "numeric",
    }).format(source);
    if (
      !window.confirm(
        `¿Copiar la planificación de ${sourceLabel} hacia ${monthLabel}? Se respetan ajustes manuales del mes destino y se reaplican feriados/bloqueos/citas del mes actual.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/monthly-schedules", {
        ...adminFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copyMonth",
          year,
          month,
          sourceYear,
          sourceMonth,
          preserveManualOverrides: true,
          mode: "all",
        }),
      });
      const body = (await response.json()) as {
        message?: string;
        summary?: {
          driversTargeted?: number;
          created?: number;
          updated?: number;
          days?: number;
        };
      };
      if (!response.ok) {
        throw new Error(body.message || "No se pudo copiar el mes.");
      }
      await reload({ silent: true });
      setMessage(
        `Mes copiado desde ${sourceLabel}: ${body.summary?.driversTargeted ?? 0} móviles · ${body.summary?.days ?? 0} días · creados ${body.summary?.created ?? 0} · actualizados ${body.summary?.updated ?? 0}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo copiar el mes.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveDay() {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        id: edit.day.id,
        statusCode: edit.statusCode,
        observation: edit.observation,
        expectedVersion: edit.day.version,
        isManualOverride: true,
      };

      if (edit.statusCode === "BLOQUEADO") {
        payload.blockMode = edit.blockMode;
        payload.blockStartDate = edit.blockStartDate;
        if (edit.blockMode === "days") {
          payload.blockEndDate = edit.blockEndDate;
        } else {
          payload.blockStartTime = edit.blockStartTime;
          payload.blockEndTime = edit.blockEndTime;
        }
      }

      const response = await fetch("/api/monthly-schedules/day", {
        ...adminFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message || "No se pudo guardar el día.");
      }
      setEdit(null);
      setEditDirty(false);
      await reloadSchedule(true);
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
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await downloadMonthlyPlanningExcel({
      rows: filteredRows,
      calendarDays,
      holidayDates: new Set([...holidayMap.keys()]),
      todayDate,
      statuses,
      year,
      month,
    });
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
    <main className="flex h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] flex-col overflow-hidden px-2 py-1.5 sm:px-3">
      <div className="mx-auto flex min-h-0 w-full max-w-[1900px] flex-1 flex-col">
        <MaintainerPageHeader
          title="Planificación mensual"
          subtitle="Flota"
          onRefresh={() => void reload({ full: true })}
          isRefreshing={loading || scheduleRefreshing}
          lastUpdatedAt={lastUpdatedAt}
          refreshVariant="prominent"
        />
        <section className="mb-1.5 shrink-0 overflow-hidden rounded-[18px] border border-[#b7cce4] bg-[#f8fbff] shadow-lg shadow-slate-300/15">
          <button
            type="button"
            onClick={() => setControlsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 border-b border-[#d7e7f8] bg-white px-3 py-2 text-left text-xs font-semibold text-[#173b68] hover:bg-[#f8fbff]"
            aria-expanded={controlsOpen}
          >
            <span>
              Controles ·{" "}
              <span className="font-normal capitalize text-slate-500">
                {monthLabel}
              </span>
            </span>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[#b7cce4] bg-[#eef3f9] text-sm leading-none">
              {controlsOpen ? "▾" : "▸"}
            </span>
          </button>
          {controlsOpen ? (
            <div className="p-3">
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
                disabled={busy}
                onClick={() => void copyPreviousMonth()}
                className={buttonClass}
              >
                Copiar mes anterior
              </button>
              <button
                type="button"
                disabled={busy || !(data?.summary.totalDays ?? 0)}
                onClick={openDelete}
                className={dangerButtonClass}
              >
                Eliminar generación
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
            Usa el asistente de generación para elegir turno y móviles, o{" "}
            <strong>Copiar mes anterior</strong> para traer la planificación del
            mes previo respetando ajustes manuales y reaplicando feriados del
            mes actual.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1fr_1fr_1fr_auto_auto]">
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
            <Label text="Agrupar">
              <select
                value={groupBy}
                onChange={(e) =>
                  setGroupBy(
                    e.target.value as
                      | "none"
                      | "group"
                      | "shift"
                      | "group_shift",
                  )
                }
                className={controlClass}
              >
                <option value="none">Sin agrupar</option>
                <option value="group">Por grupo</option>
                <option value="shift">Por turno</option>
                <option value="group_shift">Grupo + turno</option>
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
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-[#173b68]">
              <button type="button" onClick={() => moveMonth(-1)} className={buttonClass}>
                ←
              </button>
              <span className="capitalize font-semibold">{monthLabel}</span>
              <button type="button" onClick={() => moveMonth(1)} className={buttonClass}>
                →
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={openGenerate}
                className={buttonClass}
              >
                Generar
              </button>
              <span className="text-slate-500">
                {filteredRows.length} filas visibles
              </span>
            </div>
          )}
        </section>

        {message ? (
          <p className="mb-1 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mb-1 shrink-0 rounded-xl border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
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
          <section
            className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/20 transition-opacity ${
              scheduleRefreshing ? "opacity-80" : ""
            }`}
          >
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="border-separate border-spacing-0 text-[10px] leading-tight">
                <thead className="sticky top-0 z-30 bg-[#d7e7f8] text-[#0f2747]">
                  <tr>
                    <StickyHead left={STICKY.mobile.left} width={STICKY.mobile.width}>
                      Móvil
                    </StickyHead>
                    <StickyHead left={STICKY.driver.left} width={STICKY.driver.width}>
                      Conductor
                    </StickyHead>
                    <StickyHead left={STICKY.group.left} width={STICKY.group.width}>
                      Grupo
                    </StickyHead>
                    <StickyHead left={STICKY.shift.left} width={STICKY.shift.width}>
                      Turno
                    </StickyHead>
                    <StickyHead left={STICKY.obs.left} width={STICKY.obs.width}>
                      Obs.
                    </StickyHead>
                    {calendarDays.map((column) => (
                      <th
                        key={column.date}
                        title={holidayMap.get(column.date)?.name}
                        className={`min-w-[34px] border-b border-r border-[#b7cce4] px-0.5 py-0.5 text-center ${
                          holidayMap.has(column.date)
                            ? "bg-rose-200"
                            : isToday(column.date)
                              ? "bg-amber-200"
                              : column.weekend
                                ? "bg-slate-200"
                                : "bg-[#d7e7f8]"
                        }`}
                      >
                        <span className="block text-[11px] font-semibold leading-none">
                          {column.day}
                        </span>
                        <span className="text-[8px] uppercase leading-none">
                          {column.weekday}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedMatrix.map((group) => {
                    const expanded =
                      groupsExpanded[group.key] !== undefined
                        ? groupsExpanded[group.key]
                        : true;
                    return (
                      <Fragment key={group.key}>
                        {groupBy !== "none" ? (
                          <tr
                            className="cursor-pointer bg-[#eef3f9] hover:bg-[#e2ebf5]"
                            onClick={() =>
                              setGroupsExpanded((current) => ({
                                ...current,
                                [group.key]: !expanded,
                              }))
                            }
                          >
                            <td
                              colSpan={calendarDays.length + STICKY_COUNT}
                              className="border-b border-[#b7cce4] px-2 py-1 text-[10px] font-semibold text-[#173b68]"
                            >
                              <span className="mr-2 inline-block w-4 text-center">
                                {expanded ? "▾" : "▸"}
                              </span>
                              {group.label}
                              <span className="ml-2 font-normal text-slate-500">
                                ({group.rows.length})
                              </span>
                            </td>
                          </tr>
                        ) : null}
                        {expanded
                          ? group.rows.map((row) => (
                              <tr key={row.id} className="hover:bg-[#eef5ff]">
                                <StickyCell
                                  left={STICKY.mobile.left}
                                  width={STICKY.mobile.width}
                                >
                                  <strong>{row.vehicle}</strong>
                                </StickyCell>
                                <StickyCell
                                  left={STICKY.driver.left}
                                  width={STICKY.driver.width}
                                >
                                  <span
                                    className="block max-w-[120px] truncate"
                                    title={row.driverName}
                                  >
                                    {row.driverName}
                                  </span>
                                </StickyCell>
                                <StickyCell
                                  left={STICKY.group.left}
                                  width={STICKY.group.width}
                                >
                                  <span className="block truncate" title={row.groupName}>
                                    {row.groupName}
                                  </span>
                                </StickyCell>
                                <StickyCell
                                  left={STICKY.shift.left}
                                  width={STICKY.shift.width}
                                >
                                  <span className="block truncate" title={row.shift}>
                                    {row.shift}
                                  </span>
                                </StickyCell>
                                <StickyCell left={STICKY.obs.left} width={STICKY.obs.width}>
                                  <span
                                    className="block max-w-[88px] truncate"
                                    title={row.observation}
                                  >
                                    {row.observation || "—"}
                                  </span>
                                </StickyCell>
                                {calendarDays.map((column) => {
                                  const day = row.byDate.get(column.date);
                                  const status = day?.effectiveStatus;
                                  const isBlocked = status?.code === "BLOQUEADO";
                                  const blockDetail =
                                    isBlocked && day
                                      ? planningBlockDetailLabel(day.driverBlock)
                                      : "";
                                  return (
                                    <td
                                      key={column.date}
                                      className={`h-7 min-w-[34px] border-b border-r border-[#d7e7f8] p-0.5 text-center ${
                                        column.weekend ? "bg-slate-50" : ""
                                      } ${isBlocked ? "bg-red-50/80" : ""}`}
                                    >
                                      {day ? (
                                        <button
                                          type="button"
                                          title={planningDayTooltip(day)}
                                          onClick={() => {
                                            setEdit(createEditForm(day));
                                            setEditDirty(false);
                                          }}
                                          className={`relative mx-auto flex h-6 w-7 flex-col items-center justify-center rounded-md text-[8px] font-bold leading-none ${
                                            isBlocked
                                              ? "ring-2 ring-red-500 ring-offset-1"
                                              : ""
                                          }`}
                                          style={{
                                            color: isBlocked ? "#991b1b" : status?.color,
                                            backgroundColor: isBlocked
                                              ? "#fecaca"
                                              : `${status?.color ?? "#64748b"}20`,
                                            border: isBlocked
                                              ? "1px solid #ef4444"
                                              : `1px solid ${status?.color ?? "#94a3b8"}55`,
                                          }}
                                        >
                                          <span>
                                            {status?.code
                                              ? status.code.length <= 4
                                                ? status.code.slice(0, 4)
                                                : status.code.slice(0, 1)
                                              : "—"}
                                          </span>
                                          {blockDetail ? (
                                            <span className="mt-px max-w-full truncate px-0.5 text-[6px] font-semibold normal-case text-red-800">
                                              {blockDetail}
                                            </span>
                                          ) : null}
                                          <span className="absolute -right-0.5 -top-0.5 flex gap-0.5">
                                            {day.eventsCount > 0 ? (
                                              <i className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                                            ) : null}
                                            {day.observation || day.driverBlock?.observation ? (
                                              <i className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                            ) : null}
                                            {day.isManualOverride ? (
                                              <i className="h-1.5 w-1.5 rounded-full bg-[#0b5cab]" />
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
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {!filteredRows.length ? (
                <p className="p-10 text-center text-sm text-slate-500">
                  No hay filas que coincidan con los filtros.
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-[#b7cce4] bg-[#eef3f9] px-2 py-1.5 text-[10px] text-[#173b68]">
              <strong>{data.summary.drivers} conductores</strong>
              <span>·</span>
              <span>{data.summary.totalDays} días</span>
              <span>·</span>
              <span>{data.summary.manualOverrides} manuales</span>
              {Object.entries(data.summary.byStatus).map(([code, total]) => (
                <span
                  key={code}
                  className="rounded-full border border-[#b7cce4] bg-white px-1.5 py-0.5"
                >
                  {code}: <strong>{total}</strong>
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <MonthlyGenerateWizard
        open={generateOpen}
        year={year}
        month={month}
        monthLabel={monthLabel}
        shifts={shiftDefinitions}
        drivers={wizardDrivers}
        holidays={holidays}
        driversLoading={wizardDriversLoading}
        busy={busy}
        onClose={() => setGenerateOpen(false)}
        onGenerated={(text) => {
          setMessage(text);
          void reload({ silent: true });
        }}
        onError={(text) => setError(text)}
        onBusy={setBusy}
        onShiftUpdated={(shift) => {
          setShiftDefinitions((current) =>
            current.map((item) => (item.id === shift.id ? shift : item)),
          );
        }}
      />

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f2747]/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-[22px] border border-red-200 bg-[#fff8f8] p-5 shadow-2xl">
            <h2 className="font-heading text-lg font-semibold text-red-800">
              Eliminar generación
            </h2>
            <p className="mt-1 text-sm capitalize text-slate-600">
              Periodo: {monthLabel}
            </p>
            <p className="mt-2 text-xs text-red-700">
              Solo borra la planificación ya generada del mes seleccionado y del
              alcance que indiques. No genera ni afecta conductores sin días en
              ese periodo. No se puede deshacer.
            </p>
            <div className="mt-4 grid gap-3">
              <Label text="Alcance a eliminar">
                <select
                  value={deleteForm.mode}
                  disabled={busy}
                  onChange={(e) =>
                    setDeleteForm({
                      ...deleteForm,
                      mode: e.target.value as GenerateMode,
                    })
                  }
                  className={controlClass}
                >
                  <option value="range">Rango de móviles</option>
                  <option value="group">Por grupo principal</option>
                  <option value="shift">Por turno</option>
                  <option value="vehicle">Un móvil</option>
                  <option value="all">Toda la flota / mes completo</option>
                </select>
              </Label>
              {deleteForm.mode === "group" ? (
                <Label text="Grupo">
                  <select
                    value={deleteForm.groupId}
                    disabled={busy}
                    onChange={(e) =>
                      setDeleteForm({
                        ...deleteForm,
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
              {deleteForm.mode === "shift" ? (
                <Label text="Turno">
                  <select
                    value={deleteForm.shiftDefinitionId}
                    disabled={busy}
                    onChange={(e) =>
                      setDeleteForm({
                        ...deleteForm,
                        shiftDefinitionId: e.target.value,
                      })
                    }
                    className={controlClass}
                  >
                    <option value="">Selecciona</option>
                    {shiftDefinitions.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {shift.name} ({shift.code})
                      </option>
                    ))}
                  </select>
                </Label>
              ) : null}
              {deleteForm.mode === "vehicle" ? (
                <Label text="Número de móvil">
                  <input
                    value={deleteForm.vehicleNumber}
                    disabled={busy}
                    onChange={(e) =>
                      setDeleteForm({
                        ...deleteForm,
                        vehicleNumber: e.target.value,
                      })
                    }
                    placeholder="Ej: 025"
                    className={controlClass}
                  />
                </Label>
              ) : null}
              {deleteForm.mode === "range" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Label text="Desde">
                    <input
                      value={deleteForm.vehicleFrom}
                      disabled={busy}
                      onChange={(e) =>
                        setDeleteForm({
                          ...deleteForm,
                          vehicleFrom: e.target.value,
                        })
                      }
                      placeholder="001"
                      className={controlClass}
                    />
                  </Label>
                  <Label text="Hasta">
                    <input
                      value={deleteForm.vehicleTo}
                      disabled={busy}
                      onChange={(e) =>
                        setDeleteForm({
                          ...deleteForm,
                          vehicleTo: e.target.value,
                        })
                      }
                      placeholder="050"
                      className={controlClass}
                    />
                  </Label>
                </div>
              ) : null}
              <label className="flex items-start gap-2 text-xs text-[#173b68]">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includeManualOnDelete}
                  disabled={busy}
                  onChange={(e) => setIncludeManualOnDelete(e.target.checked)}
                />
                <span>
                  Incluir también ajustes manuales del alcance
                  {deletePreview?.manualOverrides
                    ? ` (${deletePreview.manualOverrides})`
                    : ""}
                  .
                </span>
              </label>
              <Label text='Escribe ELIMINAR para confirmar'>
                <input
                  value={deleteConfirmText}
                  disabled={busy}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="ELIMINAR"
                  className={controlClass}
                  autoComplete="off"
                />
              </Label>
            </div>

            <div className="mt-4 rounded-2xl border border-red-200 bg-white p-3 text-xs text-[#173b68]">
              {deletePreviewLoading ? (
                <p>Calculando alcance…</p>
              ) : deletePreviewError ? (
                <p className="text-red-700">{deletePreviewError}</p>
              ) : deletePreview ? (
                <>
                  <p>
                    Se eliminarán{" "}
                    <strong>{deletePreview.daysCount} días ya generados</strong>{" "}
                    de{" "}
                    <strong>
                      {deletePreview.driversCount} conductores con planificación
                    </strong>{" "}
                    en este periodo
                    {deletePreview.manualOverrides ? (
                      <>
                        {" "}
                        · <strong>{deletePreview.manualOverrides}</strong> con
                        ajuste manual
                      </>
                    ) : null}
                    .
                  </p>
                  {deletePreview.driversInScope &&
                  deletePreview.driversInScope > deletePreview.driversCount ? (
                    <p className="mt-1 text-slate-500">
                      Alcance seleccionado: {deletePreview.driversInScope}{" "}
                      conductores; solo se tocan los que ya tienen días
                      generados ({deletePreview.driversCount}).
                    </p>
                  ) : null}
                  {deletePreview.sample.length ? (
                    <ul className="mt-2 space-y-1 text-slate-600">
                      {deletePreview.sample.map((item) => (
                        <li key={item.vehicleNumber}>
                          {item.vehicleNumber} · {item.fullName} ·{" "}
                          {item.groupName}
                        </li>
                      ))}
                      {deletePreview.driversCount >
                      deletePreview.sample.length ? (
                        <li>
                          … y{" "}
                          {deletePreview.driversCount -
                            deletePreview.sample.length}{" "}
                          más
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <p className="mt-2 text-slate-500">
                      No hay planificación generada en este alcance.
                    </p>
                  )}
                </>
              ) : (
                <p>Define el alcance para ver qué se eliminará.</p>
              )}
            </div>

            {deleteProgress ? (
              <div
                className={`mt-4 rounded-2xl border p-3 ${
                  deleteProgress.phase === "done"
                    ? "border-emerald-300 bg-emerald-50"
                    : deleteProgress.phase === "error"
                      ? "border-red-300 bg-red-50"
                      : "border-red-200 bg-white"
                }`}
                aria-live="polite"
              >
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-[#0f2747]">
                  <span>
                    {deleteProgress.phase === "done"
                      ? "Completado"
                      : deleteProgress.phase === "error"
                        ? "Error en la eliminación"
                        : "Eliminando…"}
                  </span>
                  <span>{deleteProgress.percent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[#f0d5d5]">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                      deleteProgress.phase === "done"
                        ? "bg-emerald-600"
                        : deleteProgress.phase === "error"
                          ? "bg-red-500"
                          : "bg-red-700"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(0, deleteProgress.percent))}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {deleteProgress.message}
                </p>
                {deleteProgress.total > 0 ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {deleteProgress.processed} / {deleteProgress.total}{" "}
                    conductores
                    {deleteProgress.batchIndex && deleteProgress.batchCount
                      ? ` · lote ${deleteProgress.batchIndex}/${deleteProgress.batchCount}`
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
                  setDeleteOpen(false);
                  setDeleteProgress(null);
                }}
                className={buttonClass}
              >
                {deleteProgress?.phase === "error" ? "Cerrar" : "Cancelar"}
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  deletePreviewLoading ||
                  !deletePreview?.daysCount ||
                  deleteConfirmText.trim().toUpperCase() !== "ELIMINAR" ||
                  deleteProgress?.phase === "done"
                }
                onClick={() => void runDelete()}
                className="inline-flex h-9 items-center justify-center rounded-2xl bg-red-700 px-4 text-xs font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busy
                  ? "Eliminando…"
                  : deleteProgress?.phase === "error"
                    ? "Reintentar"
                    : "Confirmar eliminación"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f2747]/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="my-auto w-full max-w-lg max-h-[min(92vh,920px)] overflow-y-auto rounded-[22px] border border-[#b7cce4] bg-[#f8fbff] p-5 shadow-2xl">
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
                    const nextCode = e.target.value.toUpperCase();
                    setEdit((prev) => {
                      if (!prev) return prev;
                      const next: EditForm = { ...prev, statusCode: nextCode };
                      if (nextCode === "BLOQUEADO" && !prev.day.driverBlock) {
                        next.blockStartDate = prev.day.date;
                        next.blockEndDate = prev.day.date;
                      }
                      return next;
                    });
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

              {edit.day.effectiveStatus?.code === "BLOQUEADO" &&
              edit.statusCode !== "BLOQUEADO" ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Al cambiar a <strong>{edit.statusCode || "otro estado"}</strong>{" "}
                  desbloquea solo este día, sin esperar el fin del rango de bloqueo.
                </p>
              ) : null}

              {edit.statusCode === "BLOQUEADO" ? (
                <div className="grid gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-3">
                  <p className="text-xs font-semibold text-red-900">
                    Configuración del bloqueo
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEdit({ ...edit, blockMode: "days" });
                        setEditDirty(true);
                      }}
                      className={`flex-1 rounded-xl border px-2 py-1.5 text-xs font-semibold transition ${
                        edit.blockMode === "days"
                          ? "border-red-500 bg-white text-red-800"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      Por días
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEdit({
                          ...edit,
                          blockMode: "hours",
                          blockStartDate: edit.day.date,
                        });
                        setEditDirty(true);
                      }}
                      className={`flex-1 rounded-xl border px-2 py-1.5 text-xs font-semibold transition ${
                        edit.blockMode === "hours"
                          ? "border-red-500 bg-white text-red-800"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      Por horas
                    </button>
                  </div>
                  {edit.blockMode === "days" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Label text="Desde">
                        <input
                          type="date"
                          value={edit.blockStartDate}
                          onChange={(e) => {
                            setEdit({ ...edit, blockStartDate: e.target.value });
                            setEditDirty(true);
                          }}
                          className={controlClass}
                        />
                      </Label>
                      <Label text="Hasta">
                        <input
                          type="date"
                          value={edit.blockEndDate}
                          min={edit.blockStartDate}
                          onChange={(e) => {
                            setEdit({ ...edit, blockEndDate: e.target.value });
                            setEditDirty(true);
                          }}
                          className={controlClass}
                        />
                      </Label>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Label text="Fecha">
                        <input
                          type="date"
                          value={edit.blockStartDate}
                          onChange={(e) => {
                            setEdit({ ...edit, blockStartDate: e.target.value });
                            setEditDirty(true);
                          }}
                          className={controlClass}
                        />
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Label text="Hora desde">
                          <input
                            type="time"
                            value={edit.blockStartTime}
                            onChange={(e) => {
                              setEdit({ ...edit, blockStartTime: e.target.value });
                              setEditDirty(true);
                            }}
                            className={controlClass}
                          />
                        </Label>
                        <Label text="Hora hasta">
                          <input
                            type="time"
                            value={edit.blockEndTime}
                            onChange={(e) => {
                              setEdit({ ...edit, blockEndTime: e.target.value });
                              setEditDirty(true);
                            }}
                            className={controlClass}
                          />
                        </Label>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <Label
                text={
                  edit.statusCode === "BLOQUEADO"
                    ? "Motivo del bloqueo"
                    : "Observación"
                }
              >
                <textarea
                  rows={edit.statusCode === "BLOQUEADO" ? 3 : 4}
                  value={edit.observation}
                  placeholder={
                    edit.statusCode === "BLOQUEADO"
                      ? "Ej.: licencia médica, mantención, sanción…"
                      : undefined
                  }
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
      className="sticky z-40 border-b border-r border-[#b7cce4] bg-[#d7e7f8] px-1 py-1 text-left text-[9px] uppercase tracking-wide"
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
      className="sticky z-20 border-b border-r border-[#d7e7f8] bg-white px-1 py-0.5 text-[10px] text-[#0f2747]"
      style={{ left, minWidth: width, width }}
    >
      {children}
    </td>
  );
}
