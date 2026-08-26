"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { adminFetchInit } from "@/lib/admin-fetch";
import {
  loadDriverGroups,
  loadShiftDefinitions,
} from "@/lib/agendamientos-admin";
import type { DriverGroupConfig } from "@/lib/driver-groups";
import type {
  ShiftDayRuleConfig,
  ShiftDefinitionConfig,
} from "@/lib/shift-definitions";
import { uiListRowClass } from "@/lib/ui-borders";
import { useCallback, useEffect, useMemo, useState } from "react";

type Form = {
  id: string;
  code: string;
  name: string;
  description: string;
  groupId: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  color: string;
  saturdayRule: string;
  sundayRule: string;
  holidayRule: string;
  isActive: boolean;
  observation: string;
  dayRules: ShiftDayRuleConfig[];
};

const weekdays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
const rules = [
  ["default", "Predeterminado"],
  ["work", "Trabaja"],
  ["free", "Libre"],
  ["special", "Especial"],
] as const;

const emptyDays = (): ShiftDayRuleConfig[] =>
  weekdays.map((_, index) => ({
    weekday: index + 1,
    works: index < 5,
    startTime: "08:00",
    endTime: "17:00",
    durationMinutes: 540,
    defaultStatusCode: index < 5 ? "TRABAJA" : "LIBRE",
  }));

const emptyForm = (): Form => ({
  id: "",
  code: "",
  name: "",
  description: "",
  groupId: "",
  startTime: "08:00",
  endTime: "17:00",
  crossesMidnight: false,
  color: "#0b5cab",
  saturdayRule: "default",
  sundayRule: "default",
  holidayRule: "default",
  isActive: true,
  observation: "",
  dayRules: emptyDays(),
});

const inputClass =
  "h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

export default function TurnosPage() {
  const [shifts, setShifts] = useState<ShiftDefinitionConfig[]>([]);
  const [groups, setGroups] = useState<DriverGroupConfig[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const [loadedShifts, loadedGroups] = await Promise.all([
      loadShiftDefinitions(),
      loadDriverGroups(),
    ]);
    setShifts(loadedShifts);
    setGroups(loadedGroups);
    setError("");
  }, []);

  const { refresh, isRefreshing, lastUpdatedAt } = useAutoRefresh({
    onRefresh: reload,
    pause: saving,
  });

  useEffect(() => {
    reload().catch(() => setError("No se pudieron cargar los turnos."));
  }, [reload]);

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    return value
      ? shifts.filter((item) =>
          `${item.code} ${item.name}`.toLowerCase().includes(value),
        )
      : shifts;
  }, [search, shifts]);

  function groupLabel(groupId: string | null) {
    if (!groupId) return "Sin grupo";
    return groups.find((group) => group.id === groupId)?.name ?? "Grupo";
  }

  function edit(item: ShiftDefinitionConfig) {
    const dayMap = new Map(item.dayRules.map((day) => [day.weekday, day]));
    setForm({
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      groupId: item.groupId ?? "",
      startTime: item.startTime,
      endTime: item.endTime,
      crossesMidnight: item.crossesMidnight,
      color: item.color,
      saturdayRule: item.saturdayRule,
      sundayRule: item.sundayRule,
      holidayRule: item.holidayRule,
      isActive: item.isActive,
      observation: item.observation,
      dayRules: emptyDays().map((day) => ({
        ...day,
        ...(dayMap.get(day.weekday) ?? {}),
      })),
    });
    setMessage("");
    setError("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/shift-definitions", {
        ...adminFetchInit,
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          groupId: form.groupId || null,
          categorySubgroupId: null,
          cycleLengthDays: 0,
          validFrom: null,
          validTo: null,
          cycleStartDate: null,
          patternId: null,
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || "No se pudo guardar el turno.");
      }
      await reload();
      setForm(emptyForm());
      setMessage(form.id ? "Turno actualizado." : "Turno creado.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo guardar el turno.",
      );
    } finally {
      setSaving(false);
    }
  }

  function updateDay(index: number, patch: Partial<ShiftDayRuleConfig>) {
    setForm((current) => ({
      ...current,
      dayRules: current.dayRules.map((day, i) =>
        i === index ? { ...day, ...patch } : day,
      ),
    }));
  }

  function handleGroupChange(groupId: string) {
    setForm((current) => ({
      ...current,
      groupId,
    }));
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-6">
      <MaintainerPageHeader
        title="Turnos"
        subtitle="Flota"
        onRefresh={() => void refresh()}
        isRefreshing={isRefreshing}
        lastUpdatedAt={lastUpdatedAt}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(300px,.7fr)_minmax(650px,1.3fr)]">
        <section className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25">
          <div className="border-b border-[#c5d8eb] bg-[#eef3f9] p-4">
            <label className="grid gap-1.5 text-xs font-semibold text-[#173b68]">
              Buscar
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código o nombre"
                className={inputClass}
              />
            </label>
          </div>
          <div className="grid grid-cols-[1.2fr_1fr_.5fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#0f2747]">
            <span>Turno</span>
            <span>Grupo</span>
            <span>Estado</span>
          </div>
          <div className="max-h-[72dvh] divide-y divide-[#c5d8eb] overflow-auto">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => edit(item)}
                className={uiListRowClass(
                  form.id === item.id,
                  "grid w-full grid-cols-[1.2fr_1fr_.5fr] gap-2 px-3 py-2 text-left text-xs",
                )}
              >
                <span>
                  <strong className="block text-[#0f2747]">{item.name}</strong>
                  <span className="text-slate-500">
                    {item.code} · {item.startTime || "—"}–{item.endTime || "—"}
                  </span>
                </span>
                <span className="text-slate-600">{groupLabel(item.groupId)}</span>
                <span className={item.isActive ? "text-green-700" : "text-slate-500"}>
                  {item.isActive ? "Activo" : "Inactivo"}
                </span>
              </button>
            ))}
            {!filtered.length && (
              <p className="p-8 text-center text-sm text-slate-500">
                No hay turnos para mostrar.
              </p>
            )}
          </div>
        </section>

        <form
          onSubmit={save}
          className="rounded-[22px] border border-[#b7cce4] bg-[#f8fbff] p-4 shadow-lg shadow-slate-300/20"
        >
          <h2 className="font-heading text-lg font-semibold text-[#0f2747]">
            {form.id ? "Editar turno" : "Nuevo turno"}
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Código">
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className={`${inputClass} uppercase`}
              />
            </Field>
            <Field label="Nombre">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Descripción" className="md:col-span-2">
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Grupo principal">
              <select
                value={form.groupId}
                onChange={(e) => handleGroupChange(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecciona grupo</option>
                {groups
                  .filter((group) => group.isActive || group.id === form.groupId)
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                      {!group.isActive ? " (inactivo)" : ""}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Hora inicio">
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Hora término">
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Color">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className={`${inputClass} w-full p-1`}
              />
            </Field>
            <label className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68]">
              Cruza medianoche
              <input
                type="checkbox"
                checked={form.crossesMidnight}
                onChange={(e) =>
                  setForm({ ...form, crossesMidnight: e.target.checked })
                }
                className="h-4 w-4 accent-[#0b5cab]"
              />
            </label>
            <Field label="Regla feriado">
              <select
                value={form.holidayRule}
                onChange={(e) =>
                  setForm({ ...form, holidayRule: e.target.value })
                }
                className={inputClass}
              >
                {rules.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68]">
              Activo
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 accent-[#0b5cab]"
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            <strong>Cruza medianoche:</strong> el turno empieza un día y termina
            al siguiente (ej. 22:00–06:00); en marcación se verá como un bloque
            continuo de color entre ambos días.{" "}
            <strong>Regla feriado:</strong> qué hacer si esa fecha es feriado,
            aunque el día de la semana diga “trabaja”.
          </p>
          <Field label="Observación" className="mt-3">
            <textarea
              rows={2}
              value={form.observation}
              onChange={(e) => setForm({ ...form, observation: e.target.value })}
              className="rounded-2xl border border-[#9fb8d9] bg-white p-3 text-sm outline-none focus:border-[#0b5cab]"
            />
          </Field>
          <div className="mt-4 overflow-auto rounded-2xl border border-[#b7cce4] bg-white">
            <div className="border-b border-[#d7e7f8] bg-[#eef3f9] px-3 py-2 text-[11px] text-slate-600">
              Grilla semanal: <strong>tildado = trabaja</strong>,{" "}
              <strong>sin tildar = libre</strong>. No hace falta poner LIBRE a
              mano: al destildar ya queda libre.
            </div>
            <div className="min-w-[520px] grid grid-cols-[1fr_.55fr_.8fr_.8fr_.8fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase text-[#0f2747]">
              <span>Día</span>
              <span>Trabaja</span>
              <span>Inicio</span>
              <span>Término</span>
              <span>Estado</span>
            </div>
            {form.dayRules.map((day, index) => (
              <div
                key={day.weekday}
                className="min-w-[520px] grid grid-cols-[1fr_.55fr_.8fr_.8fr_.8fr] items-center gap-2 border-t border-[#d7e7f8] px-3 py-2 text-xs"
              >
                <strong className="text-[#173b68]">{weekdays[index]}</strong>
                <input
                  type="checkbox"
                  checked={day.works}
                  onChange={(e) =>
                    updateDay(index, {
                      works: e.target.checked,
                      defaultStatusCode: e.target.checked ? "TRABAJA" : "LIBRE",
                    })
                  }
                  className="h-4 w-4 accent-[#0b5cab]"
                  aria-label={`${weekdays[index]} trabaja`}
                />
                <input
                  type="time"
                  value={day.startTime}
                  disabled={!day.works}
                  onChange={(e) => updateDay(index, { startTime: e.target.value })}
                  className="h-8 rounded-xl border border-[#9fb8d9] px-2 disabled:bg-slate-100"
                />
                <input
                  type="time"
                  value={day.endTime}
                  disabled={!day.works}
                  onChange={(e) => updateDay(index, { endTime: e.target.value })}
                  className="h-8 rounded-xl border border-[#9fb8d9] px-2 disabled:bg-slate-100"
                />
                <span
                  className={`rounded-xl px-2 py-1 text-[11px] font-semibold ${
                    day.works
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {day.works ? "TRABAJA" : "LIBRE"}
                </span>
              </div>
            ))}
          </div>
          {message ? (
            <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setForm(emptyForm());
                setMessage("");
                setError("");
              }}
              className="h-10 rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white"
            >
              Cancelar
            </button>
            <button
              disabled={saving}
              className="h-10 rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              {saving ? "Guardando..." : form.id ? "Guardar cambios" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-semibold text-[#173b68]">{label}</span>
      {children}
    </label>
  );
}
