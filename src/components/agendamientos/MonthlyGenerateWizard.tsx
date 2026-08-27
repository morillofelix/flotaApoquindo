"use client";

import ShiftWeekdayGrid, {
  cloneDayRules,
} from "@/components/agendamientos/ShiftWeekdayGrid";
import { adminFetchInit } from "@/lib/admin-fetch";
import { previewMonthPattern } from "@/lib/shift-pattern-engine";
import type {
  ShiftDayRuleConfig,
  ShiftDefinitionConfig,
} from "@/lib/shift-definitions";
import { useEffect, useMemo, useState } from "react";

export type WizardDriver = {
  id: string;
  vehicleNumber: string;
  fullName: string;
  rut: string;
  licensePlate: string;
  groupId: string;
  groupName: string;
  isActive: boolean;
  isConductor: boolean;
  shiftId: string;
  shiftCode: string;
  shiftName: string;
};

type DayOverride = {
  date: string;
  statusCode: string;
  startTime?: string;
  endTime?: string;
  observation?: string;
};

type Props = {
  open: boolean;
  year: number;
  month: number;
  monthLabel: string;
  shifts: ShiftDefinitionConfig[];
  drivers: WizardDriver[];
  holidays: Array<{ date: string; isActive: boolean }>;
  driversLoading?: boolean;
  busy: boolean;
  onClose: () => void;
  onGenerated: (message: string) => void;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
  onShiftUpdated?: (shift: ShiftDefinitionConfig) => void;
};

const buttonClass =
  "inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] disabled:cursor-not-allowed disabled:bg-slate-300";
const ghostClass =
  "inline-flex h-9 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-xs font-semibold text-[#173b68] disabled:opacity-50";

const steps = [
  "Periodo",
  "Turno",
  "Móviles",
  "Vista previa",
  "Confirmar",
] as const;

export default function MonthlyGenerateWizard({
  open,
  year,
  month,
  monthLabel,
  shifts,
  drivers,
  holidays,
  driversLoading = false,
  busy,
  onClose,
  onGenerated,
  onError,
  onBusy,
  onShiftUpdated,
}: Props) {
  const [step, setStep] = useState(0);
  const [shiftId, setShiftId] = useState("");
  const [shiftSearch, setShiftSearch] = useState("");
  const [showShiftDays, setShowShiftDays] = useState(false);
  const [editedDayRules, setEditedDayRules] = useState<ShiftDayRuleConfig[]>(
    [],
  );
  const [shiftRulesDirty, setShiftRulesDirty] = useState(false);
  const [savingShiftRules, setSavingShiftRules] = useState(false);
  const [shiftRulesMessage, setShiftRulesMessage] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [patternMode, setPatternMode] = useState<"continue" | "start">(
    "continue",
  );
  const [patternBaseDate, setPatternBaseDate] = useState(
    `${year}-${String(month).padStart(2, "0")}-01`,
  );
  const [assignMode, setAssignMode] = useState<"assign" | "keep" | "exception">(
    "assign",
  );
  const [preserveManual, setPreserveManual] = useState(true);
  const [overrides, setOverrides] = useState<DayOverride[]>([]);
  const [previewDay, setPreviewDay] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    percent: number;
    message: string;
    phase: "idle" | "run" | "done" | "error";
  }>({ percent: 0, message: "", phase: "idle" });

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setShiftId("");
    setSelectedVehicles([]);
    setOverrides([]);
    setShowShiftDays(false);
    setEditedDayRules([]);
    setShiftRulesDirty(false);
    setShiftRulesMessage("");
    setPatternBaseDate(`${year}-${String(month).padStart(2, "0")}-01`);
    setProgress({ percent: 0, message: "", phase: "idle" });
  }, [open, year, month]);

  const activeShifts = useMemo(
    () => shifts.filter((shift) => shift.isActive),
    [shifts],
  );

  const selectedShift = useMemo(
    () => activeShifts.find((shift) => shift.id === shiftId) ?? null,
    [activeShifts, shiftId],
  );

  useEffect(() => {
    if (!selectedShift) {
      setEditedDayRules([]);
      setShiftRulesDirty(false);
      return;
    }
    setEditedDayRules(
      cloneDayRules(
        selectedShift.dayRules,
        selectedShift.startTime,
        selectedShift.endTime,
      ),
    );
    setShiftRulesDirty(false);
    setShiftRulesMessage("");
  }, [selectedShift]);

  const filteredShifts = useMemo(() => {
    const q = shiftSearch.trim().toLowerCase();
    if (!q) return activeShifts;
    return activeShifts.filter((shift) =>
      `${shift.code} ${shift.name}`.toLowerCase().includes(q),
    );
  }, [activeShifts, shiftSearch]);

  const conductorDrivers = useMemo(
    () => drivers.filter((d) => d.isActive && d.isConductor),
    [drivers],
  );

  const filteredDrivers = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return conductorDrivers.slice(0, 80);
    return conductorDrivers
      .filter((d) =>
        `${d.vehicleNumber} ${d.fullName} ${d.rut} ${d.licensePlate} ${d.groupName} ${d.shiftCode} ${d.shiftName}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 80);
  }, [conductorDrivers, vehicleSearch]);

  const selectedDriverRows = useMemo(() => {
    const set = new Set(selectedVehicles);
    return conductorDrivers.filter((d) => set.has(d.vehicleNumber));
  }, [conductorDrivers, selectedVehicles]);

  const holidaySet = useMemo(
    () =>
      new Set(
        holidays.filter((h) => h.isActive).map((h) => h.date.slice(0, 10)),
      ),
    [holidays],
  );

  const patternPreview = useMemo(() => {
    if (!selectedShift) return [];
    const base =
      patternMode === "start"
        ? patternBaseDate
        : selectedShift.cycleStartDate || patternBaseDate;
    return previewMonthPattern(
      year,
      month,
      {
        startTime: selectedShift.startTime,
        endTime: selectedShift.endTime,
        saturdayRule: selectedShift.saturdayRule,
        sundayRule: selectedShift.sundayRule,
        holidayRule: selectedShift.holidayRule,
        cycleLengthDays: selectedShift.cycleLengthDays,
        cycleStartDate: selectedShift.cycleStartDate,
        dayRules: editedDayRules.length
          ? editedDayRules
          : selectedShift.dayRules,
      },
      { patternBaseDate: base },
    ).map((day) => {
      const override = overrides.find((item) => item.date === day.date);
      const isHoliday = holidaySet.has(day.date);
      let statusCode = override?.statusCode ?? day.statusCode;
      if (isHoliday && selectedShift.holidayRule !== "work" && !override) {
        statusCode = "FERIADO";
      }
      return {
        ...day,
        statusCode,
        startTime: override?.startTime ?? day.startTime,
        endTime: override?.endTime ?? day.endTime,
        overridden: Boolean(override),
        isHoliday,
      };
    });
  }, [
    selectedShift,
    editedDayRules,
    year,
    month,
    patternMode,
    patternBaseDate,
    overrides,
    holidaySet,
  ]);

  const conflictSummary = useMemo(() => {
    const withoutShift = selectedDriverRows.filter((d) => !d.shiftId);
    const sameShift = selectedDriverRows.filter((d) => d.shiftId === shiftId);
    const otherShift = selectedDriverRows.filter(
      (d) => d.shiftId && d.shiftId !== shiftId,
    );
    const withoutDriver = selectedDriverRows.filter(
      (d) => !d.fullName.trim() || d.fullName === "—",
    );
    return { withoutShift, sameShift, otherShift, withoutDriver };
  }, [selectedDriverRows, shiftId]);

  function addVehicle(vehicleNumber: string) {
    setSelectedVehicles((current) =>
      current.includes(vehicleNumber)
        ? current
        : [...current, vehicleNumber],
    );
  }

  function removeVehicle(vehicleNumber: string) {
    setSelectedVehicles((current) =>
      current.filter((item) => item !== vehicleNumber),
    );
  }

  function addFiltered() {
    setSelectedVehicles((current) => {
      const next = new Set(current);
      for (const row of filteredDrivers) next.add(row.vehicleNumber);
      return [...next];
    });
  }

  function addWithoutShift() {
    setSelectedVehicles((current) => {
      const next = new Set(current);
      for (const row of conductorDrivers) {
        if (!row.shiftId) next.add(row.vehicleNumber);
      }
      return [...next];
    });
  }

  function addOfSelectedShift() {
    if (!shiftId) return;
    setSelectedVehicles((current) => {
      const next = new Set(current);
      for (const row of conductorDrivers) {
        if (row.shiftId === shiftId) next.add(row.vehicleNumber);
      }
      return [...next];
    });
  }

  function addByGroup(groupId: string) {
    setSelectedVehicles((current) => {
      const next = new Set(current);
      for (const row of conductorDrivers) {
        if (row.groupId === groupId) next.add(row.vehicleNumber);
      }
      return [...next];
    });
  }

  function toggleDayOverride(date: string) {
    const current = overrides.find((item) => item.date === date);
    const preview = patternPreview.find((item) => item.date === date);
    if (current) {
      setOverrides((list) => list.filter((item) => item.date !== date));
      return;
    }
    const nextCode =
      preview?.statusCode === "TRABAJA" || preview?.statusCode === "FERIADO"
        ? "LIBRE"
        : "TRABAJA";
    setOverrides((list) => [
      ...list,
      {
        date,
        statusCode: nextCode,
        startTime:
          nextCode === "TRABAJA" ? selectedShift?.startTime || "" : "",
        endTime: nextCode === "TRABAJA" ? selectedShift?.endTime || "" : "",
      },
    ]);
    setPreviewDay(date);
  }

  function canNext() {
    if (step === 1) return Boolean(shiftId);
    if (step === 2) return selectedVehicles.length > 0;
    return true;
  }

  async function saveShiftDayRules() {
    if (!selectedShift || !shiftRulesDirty) return;
    setSavingShiftRules(true);
    setShiftRulesMessage("");
    try {
      const response = await fetch("/api/shift-definitions", {
        ...adminFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedShift.id,
          dayRules: editedDayRules,
        }),
      });
      const body = (await response.json()) as {
        message?: string;
        shift?: ShiftDefinitionConfig;
      };
      if (!response.ok || !body.shift) {
        throw new Error(body.message || "No se pudo guardar el turno.");
      }
      setEditedDayRules(cloneDayRules(body.shift.dayRules, body.shift.startTime, body.shift.endTime));
      setShiftRulesDirty(false);
      setShiftRulesMessage("Días del turno guardados.");
      onShiftUpdated?.(body.shift);
    } catch (caught) {
      setShiftRulesMessage(
        caught instanceof Error ? caught.message : "No se pudo guardar el turno.",
      );
    } finally {
      setSavingShiftRules(false);
    }
  }

  async function runGenerate() {
    if (!selectedShift || !selectedVehicles.length) return;
    onBusy(true);
    setProgress({
      percent: 0,
      message: "Iniciando generación…",
      phase: "run",
    });
    const chunkSize = 40;
    const batchCount = Math.ceil(selectedVehicles.length / chunkSize);
    const totals = { created: 0, updated: 0, days: 0, drivers: 0 };
    const baseDate =
      patternMode === "start"
        ? patternBaseDate
        : selectedShift.cycleStartDate || patternBaseDate;

    try {
      for (let offset = 0; offset < selectedVehicles.length; offset += chunkSize) {
        const chunk = selectedVehicles.slice(offset, offset + chunkSize);
        const batchIndex = Math.floor(offset / chunkSize) + 1;
        setProgress({
          percent: Math.round((offset / selectedVehicles.length) * 100),
          message: `Lote ${batchIndex}/${batchCount}…`,
          phase: "run",
        });

        const response = await fetch("/api/monthly-schedules", {
          ...adminFetchInit,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate",
            year,
            month,
            mode: "vehicles",
            vehicleNumbers: chunk,
            forceShiftDefinitionId: shiftId,
            shiftDefinitionId: shiftId,
            patternBaseDate: baseDate,
            assignMode,
            preserveManualOverrides: preserveManual,
            dayOverrides: overrides,
            ...(shiftRulesDirty
              ? {
                  forceShiftDayRules: editedDayRules.map((rule) => ({
                    weekday: rule.weekday,
                    works: rule.works,
                    startTime: rule.startTime,
                    endTime: rule.endTime,
                    defaultStatusCode: rule.defaultStatusCode,
                  })),
                }
              : {}),
          }),
        });
        const body = (await response.json()) as {
          message?: string;
          summary?: {
            created?: number;
            updated?: number;
            days?: number;
            driversTargeted?: number;
          };
        };
        if (!response.ok) {
          throw new Error(body.message || `Error en lote ${batchIndex}`);
        }
        totals.created += body.summary?.created ?? 0;
        totals.updated += body.summary?.updated ?? 0;
        totals.days += body.summary?.days ?? 0;
        totals.drivers += body.summary?.driversTargeted ?? chunk.length;
      }

      setProgress({
        percent: 100,
        message: "Completado",
        phase: "done",
      });
      await new Promise((r) => window.setTimeout(r, 500));
      onGenerated(
        `Generado con ${selectedShift.code}: ${totals.drivers} móviles · ${totals.days} días · creados ${totals.created} · actualizados ${totals.updated}.`,
      );
      onClose();
    } catch (caught) {
      const text =
        caught instanceof Error ? caught.message : "No se pudo generar.";
      setProgress({ percent: 0, message: text, phase: "error" });
      onError(text);
    } finally {
      onBusy(false);
    }
  }

  if (!open) return null;

  const groups = [
    ...new Map(
      conductorDrivers
        .filter((d) => d.groupId)
        .map((d) => [d.groupId, d.groupName]),
    ),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f2747]/50 p-3"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[22px] border border-[#b7cce4] bg-[#f8fbff] shadow-2xl">
        <div className="border-b border-[#b7cce4] bg-white px-5 py-4">
          <h2 className="font-heading text-lg font-semibold text-[#0f2747]">
            Generar planificación mensual
          </h2>
          <p className="mt-1 text-sm capitalize text-slate-600">{monthLabel}</p>
          <ol className="mt-3 flex flex-wrap gap-2 text-[11px]">
            {steps.map((label, index) => (
              <li
                key={label}
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  index === step
                    ? "bg-[#0b5cab] text-white"
                    : index < step
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 text-sm text-[#0f2747]">
          {step === 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs font-semibold">Continuidad del patrón</span>
                <select
                  value={patternMode}
                  onChange={(e) =>
                    setPatternMode(e.target.value as "continue" | "start")
                  }
                  className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3"
                >
                  <option value="continue">Continuar rotación / fecha base del turno</option>
                  <option value="start">Iniciar patrón desde esta fecha</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold">Fecha base del ciclo</span>
                <input
                  type="date"
                  value={patternBaseDate}
                  onChange={(e) => setPatternBaseDate(e.target.value)}
                  className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3"
                />
              </label>
              <p className="md:col-span-2 text-xs text-slate-500">
                El mes/año es el de la pantalla. Si el turno tiene ciclo (ej. 5x1),
                la fecha base mantiene la continuidad entre meses.
              </p>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-3">
              <input
                value={shiftSearch}
                onChange={(e) => setShiftSearch(e.target.value)}
                placeholder="Buscar turno por código o nombre"
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3"
              />
              <div className="max-h-48 space-y-1 overflow-auto rounded-2xl border border-[#b7cce4] bg-white p-2">
                {filteredShifts.map((shift) => (
                  <button
                    key={shift.id}
                    type="button"
                    onClick={() => {
                      setShiftId(shift.id);
                      setShowShiftDays(true);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs ${
                      shiftId === shift.id
                        ? "bg-[#d7e7f8] font-semibold"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span>
                      {shift.code} · {shift.name}
                      <span className="block text-slate-500">
                        {shift.startTime || "—"}–{shift.endTime || "—"}
                        {shift.cycleLengthDays
                          ? ` · ciclo ${shift.cycleLengthDays}d`
                          : " · semanal"}
                      </span>
                    </span>
                    {shiftId === shift.id ? <span>✓</span> : null}
                  </button>
                ))}
              </div>
              {selectedShift ? (
                <div className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className={ghostClass}
                      onClick={() => setShowShiftDays((current) => !current)}
                    >
                      {showShiftDays ? "Ocultar días" : "Ver / editar días del turno"}
                    </button>
                    {shiftRulesDirty ? (
                      <button
                        type="button"
                        disabled={savingShiftRules || busy}
                        onClick={() => void saveShiftDayRules()}
                        className={buttonClass}
                      >
                        {savingShiftRules ? "Guardando…" : "Guardar en turno"}
                      </button>
                    ) : null}
                  </div>
                  {shiftRulesMessage ? (
                    <p className="mt-2 text-xs text-slate-600">{shiftRulesMessage}</p>
                  ) : null}
                  {showShiftDays ? (
                    <ShiftWeekdayGrid
                      compact
                      dayRules={editedDayRules}
                      defaultStartTime={selectedShift.startTime || "08:00"}
                      defaultEndTime={selectedShift.endTime || "17:00"}
                      onChange={(rules) => {
                        setEditedDayRules(rules);
                        setShiftRulesDirty(true);
                        setShiftRulesMessage("");
                      }}
                    />
                  ) : null}
                  {shiftRulesDirty && !showShiftDays ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Hay cambios en los días del turno. Se usarán al generar aunque
                      no los guardes en el turno maestro.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-3">
              {driversLoading ? (
                <p className="rounded-2xl border border-[#b7cce4] bg-white px-3 py-4 text-xs text-slate-600">
                  Cargando conductores y asignaciones de turno…
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={ghostClass} onClick={addFiltered}>
                  Agregar resultados filtrados
                </button>
                <button type="button" className={ghostClass} onClick={addWithoutShift}>
                  Sin turno
                </button>
                <button
                  type="button"
                  className={ghostClass}
                  onClick={addOfSelectedShift}
                  disabled={!shiftId}
                >
                  Del turno seleccionado
                </button>
                <button
                  type="button"
                  className={ghostClass}
                  onClick={() => setSelectedVehicles([])}
                >
                  Quitar todos
                </button>
              </div>
              {groups.length ? (
                <div className="flex flex-wrap gap-2">
                  {groups.map(([id, name]) => (
                    <button
                      key={id}
                      type="button"
                      className={ghostClass}
                      onClick={() => addByGroup(id)}
                    >
                      Grupo {name}
                    </button>
                  ))}
                </div>
              ) : null}
              <input
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                placeholder="Buscar móvil, conductor, RUT, patente, grupo, turno"
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#b7cce4] bg-[#eef3f9] px-3 py-2 text-xs text-[#173b68]">
                <span>
                  <strong>{selectedVehicles.length}</strong>{" "}
                  {selectedVehicles.length === 1
                    ? "móvil seleccionado"
                    : "móviles seleccionados"}
                </span>
                <span className="text-slate-500">
                  Agrega con + abajo o quita con × en cada chip
                </span>
              </div>
              <div className="flex flex-wrap gap-2 rounded-2xl border border-[#b7cce4] bg-white p-3 min-h-16 max-h-40 overflow-auto">
                {selectedDriverRows.length ? (
                  selectedDriverRows.map((row) => (
                    <span
                      key={row.vehicleNumber}
                      title={`${row.vehicleNumber} · ${row.fullName} · ${row.groupName} · ${row.shiftName || "Sin turno"}`}
                      className="inline-flex items-center gap-1 rounded-full border border-[#9fb8d9] bg-[#eef3f9] px-2.5 py-1 text-[11px] font-semibold"
                    >
                      {row.vehicleNumber}
                      {!row.shiftId ? (
                        <span className="text-amber-700">· sin turno</span>
                      ) : row.shiftId !== shiftId ? (
                        <span className="text-amber-700">· otro turno</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeVehicle(row.vehicleNumber)}
                        aria-label={`Quitar ${row.vehicleNumber}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">
                    Agrega uno o más móviles.
                  </span>
                )}
              </div>
              <div className="max-h-48 space-y-1 overflow-auto rounded-2xl border border-[#b7cce4] bg-white p-2">
                {filteredDrivers.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => addVehicle(row.vehicleNumber)}
                    className="flex w-full justify-between rounded-xl px-3 py-2 text-left text-xs hover:bg-slate-50"
                  >
                    <span>
                      <strong>{row.vehicleNumber}</strong> · {row.fullName}
                      <span className="block text-slate-500">
                        {row.groupName || "Sin grupo"} ·{" "}
                        {row.shiftName || "Sin turno"}
                      </span>
                    </span>
                    <span>+</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-3">
              <p className="text-xs text-slate-600">
                Clic en un día para alternar Trabaja/Libre solo en esta
                generación (no modifica el turno maestro).
              </p>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500">
                {["L", "M", "M", "J", "V", "S", "D"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({
                  length: (patternPreview[0]?.weekday ?? 1) - 1,
                }).map((_, i) => (
                  <span key={`pad-${i}`} />
                ))}
                {patternPreview.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => toggleDayOverride(day.date)}
                    className={`min-h-14 rounded-xl border p-1 text-[10px] ${
                      day.overridden
                        ? "border-amber-400 bg-amber-50"
                        : day.isHoliday
                          ? "border-rose-300 bg-rose-50"
                          : "border-[#c5d8eb] bg-white"
                    }`}
                  >
                    <strong className="block text-xs">{day.day}</strong>
                    <span>
                      {day.statusCode === "TRABAJA"
                        ? "T"
                        : day.statusCode === "LIBRE"
                          ? "L"
                          : day.statusCode === "FERIADO"
                            ? "F"
                            : day.statusCode.slice(0, 1)}
                    </span>
                  </button>
                ))}
              </div>
              {previewDay ? (
                <p className="text-xs text-slate-500">
                  Último día ajustado: {previewDay}
                </p>
              ) : null}
              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1 text-xs">
                  <span className="font-semibold">Si el móvil no tiene turno</span>
                  <select
                    value={assignMode}
                    onChange={(e) =>
                      setAssignMode(
                        e.target.value as "assign" | "keep" | "exception",
                      )
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3"
                  >
                    <option value="assign">Asignar este turno (historial)</option>
                    <option value="exception">
                      Solo esta generación (sin cambiar turno permanente)
                    </option>
                    <option value="keep">No asignar / conservar actual</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={preserveManual}
                    onChange={(e) => setPreserveManual(e.target.checked)}
                  />
                  Regenerar conservando ajustes manuales
                </label>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3 text-xs">
              <div className="rounded-2xl border border-[#b7cce4] bg-white p-3">
                <p>
                  <strong>Turno:</strong> {selectedShift?.code} ·{" "}
                  {selectedShift?.name}
                </p>
                <p>
                  <strong>Móviles:</strong> {selectedVehicles.length}
                </p>
                <p>
                  <strong>Días del mes:</strong> {patternPreview.length}
                </p>
                <p>
                  <strong>Excepciones en vista previa:</strong>{" "}
                  {overrides.length}
                </p>
                <p>
                  <strong>Fecha base ciclo:</strong>{" "}
                  {patternMode === "start"
                    ? patternBaseDate
                    : selectedShift?.cycleStartDate || patternBaseDate}
                </p>
              </div>
              <ul className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                <li>Sin turno: {conflictSummary.withoutShift.length}</li>
                <li>Mismo turno: {conflictSummary.sameShift.length}</li>
                <li>Otro turno: {conflictSummary.otherShift.length}</li>
                <li>
                  Advertencia otro turno: se aplicará según modo “
                  {assignMode}”.
                </li>
              </ul>
              {progress.phase !== "idle" ? (
                <div className="rounded-2xl border border-[#b7cce4] bg-white p-3">
                  <div className="mb-1 flex justify-between font-semibold">
                    <span>
                      {progress.phase === "done"
                        ? "Completado"
                        : progress.phase === "error"
                          ? "Error"
                          : "Generando…"}
                    </span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#d7e4f4]">
                    <div
                      className="h-full bg-[#0b5cab] transition-[width]"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-slate-600">{progress.message}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-between gap-2 border-t border-[#b7cce4] bg-white px-5 py-3">
          <button
            type="button"
            className={ghostClass}
            disabled={busy}
            onClick={() => {
              if (busy) return;
              onClose();
            }}
          >
            Cancelar
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className={ghostClass}
              disabled={busy || step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Atrás
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                className={buttonClass}
                disabled={!canNext() || busy}
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              >
                Siguiente
              </button>
            ) : (
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !selectedVehicles.length || !shiftId}
                onClick={() => void runGenerate()}
              >
                {busy ? "Generando…" : "Generar planificación"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
