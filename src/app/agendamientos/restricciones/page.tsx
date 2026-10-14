"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { adminFetchInit } from "@/lib/admin-fetch";
import {
  APP_ACCESS_WEEKDAYS,
  buildRestrictedMessage,
  type AppAccessWindowInput,
} from "@/lib/app-access-rules";
import { useCallback, useEffect, useMemo, useState } from "react";

type ShiftAccess = {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  restricted: boolean;
  windows: AppAccessWindowInput[];
  updatedByEmail: string;
  updatedAt: string | null;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function defaultWindows(shift: ShiftAccess): AppAccessWindowInput[] {
  const startTime = TIME_PATTERN.test(shift.startTime) ? shift.startTime : "08:30";
  const endTime = TIME_PATTERN.test(shift.endTime) ? shift.endTime : "18:30";
  return APP_ACCESS_WEEKDAYS.map((day) => ({
    weekday: day.weekday,
    enabled: true,
    startTime,
    endTime,
  }));
}

function windowsFor(shift: ShiftAccess) {
  if (!shift.restricted) return defaultWindows(shift);
  const byWeekday = new Map(shift.windows.map((window) => [window.weekday, window]));
  return APP_ACCESS_WEEKDAYS.map(
    (day) =>
      byWeekday.get(day.weekday) ?? {
        weekday: day.weekday,
        enabled: false,
        startTime: "",
        endTime: "",
      },
  );
}

function summary(shift: ShiftAccess) {
  if (!shift.restricted) return "Sin restricción · puede solicitar a cualquier hora";
  const enabled = shift.windows.filter((window) => window.enabled);
  if (!enabled.length) return "Sin acceso ningún día";
  const labels = enabled.map((window) => {
    const day = APP_ACCESS_WEEKDAYS.find((item) => item.weekday === window.weekday);
    return `${day?.label.slice(0, 3)} ${window.startTime}–${window.endTime}`;
  });
  return labels.join(" · ");
}

export default function RestriccionesPage() {
  const [shifts, setShifts] = useState<ShiftAccess[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<AppAccessWindowInput[]>([]);
  const [dirty, setDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const selected = useMemo(
    () => shifts.find((shift) => shift.id === selectedId) ?? null,
    [shifts, selectedId],
  );

  const applyShifts = useCallback((next: ShiftAccess[], keepId?: string) => {
    setShifts(next);
    const target = next.find((shift) => shift.id === keepId) ?? next[0] ?? null;
    setSelectedId(target?.id ?? "");
    setDraft(target ? windowsFor(target) : []);
    setDirty(false);
  }, []);

  const load = useCallback(
    async (keepId?: string) => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch("/api/shift-app-access", {
          ...adminFetchInit,
          cache: "no-store",
        });
        const data = (await response.json()) as {
          shifts?: ShiftAccess[];
          message?: string;
        };
        if (!response.ok) {
          throw new Error(data.message || "No se pudieron cargar las restricciones.");
        }
        applyShifts(data.shifts ?? [], keepId);
        setLastUpdatedAt(new Date());
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "No se pudieron cargar las restricciones.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [applyShifts],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function selectShift(shift: ShiftAccess) {
    if (
      dirty &&
      !window.confirm("Hay cambios sin guardar en este turno. ¿Descartarlos?")
    ) {
      return;
    }
    setSelectedId(shift.id);
    setDraft(windowsFor(shift));
    setDirty(false);
    setMessage("");
    setError("");
  }

  function updateDay(weekday: number, patch: Partial<AppAccessWindowInput>) {
    setDraft((current) =>
      current.map((window) =>
        window.weekday === weekday ? { ...window, ...patch } : window,
      ),
    );
    setDirty(true);
    setMessage("");
  }

  function copyMondayToAll() {
    const monday = draft.find((window) => window.weekday === 1);
    if (!monday) return;
    setDraft((current) =>
      current.map((window) => ({ ...monday, weekday: window.weekday })),
    );
    setDirty(true);
  }

  async function save(clear = false) {
    if (!selected) return;
    if (
      clear &&
      !window.confirm(
        `¿Quitar la restricción del turno ${selected.code}? Sus conductores podrán solicitar a cualquier hora.`,
      )
    ) {
      return;
    }
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/shift-app-access", {
        ...adminFetchInit,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          clear
            ? { shiftDefinitionId: selected.id, clear: true }
            : { shiftDefinitionId: selected.id, windows: draft },
        ),
      });
      const data = (await response.json()) as {
        shifts?: ShiftAccess[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message || "No se pudo guardar la restricción.");
      }
      applyShifts(data.shifts ?? [], selected.id);
      setLastUpdatedAt(new Date());
      setMessage(
        clear
          ? `Turno ${selected.code}: restricción quitada.`
          : `Turno ${selected.code}: horario guardado. Se aplica de inmediato en la app.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo guardar la restricción.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const previewWindow = draft.find((window) => window.weekday === 1) ?? null;

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        <MaintainerPageHeader
          title="Restricciones"
          subtitle="Horario en que los conductores pueden enviar solicitudes desde la app"
          onRefresh={() => {
            if (
              dirty &&
              !window.confirm("Hay cambios sin guardar. ¿Descartarlos y recargar?")
            ) {
              return;
            }
            void load(selectedId);
          }}
          isRefreshing={isLoading}
          lastUpdatedAt={lastUpdatedAt}
        />

        {message ? (
          <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25">
            <div className="bg-[#d7e7f8] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0f2747]">
              Turnos
            </div>
            <div className="max-h-[70dvh] divide-y divide-[#c5d8eb] overflow-auto">
              {shifts.length === 0 && !isLoading ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  No hay turnos activos.
                </p>
              ) : null}
              {shifts.map((shift) => (
                <button
                  key={shift.id}
                  type="button"
                  onClick={() => selectShift(shift)}
                  className={`block w-full px-4 py-3 text-left text-xs transition hover:bg-[#eef6ff] ${
                    shift.id === selectedId ? "bg-[#eef6ff]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-[#0f2747]">
                      {shift.code} · {shift.name}
                    </strong>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        shift.restricted
                          ? "bg-amber-100 text-amber-900"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {shift.restricted ? "Con restricción" : "Sin restricción"}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-500">{summary(shift)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-[#b7cce4] bg-white p-4 shadow-lg shadow-slate-300/25">
            {selected ? (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-[#0f2747]">
                      {selected.code} · {selected.name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Turno {selected.startTime || "—"} a {selected.endTime || "—"}
                      {selected.restricted && selected.updatedByEmail
                        ? ` · última modificación por ${selected.updatedByEmail}`
                        : ""}
                    </p>
                  </div>
                  {!selected.restricted ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                      Aún sin restricción: al guardar comenzará a aplicarse
                    </span>
                  ) : null}
                </div>

                <p className="rounded-2xl border border-[#c5d8eb] bg-[#f8fbff] px-3 py-2 text-xs leading-relaxed text-slate-600">
                  Marca los días en que los conductores de este turno pueden
                  enviar solicitudes desde la app y en qué horario (hora de
                  Chile). Los días sin marcar quedan sin acceso. Si la hora de
                  término es menor que la de inicio, el horario cruza la
                  medianoche. Los ejecutivos pueden seguir registrando
                  solicitudes a cualquier hora.
                </p>

                <div className="overflow-auto rounded-2xl border border-[#b7cce4]">
                  <table className="w-full min-w-[520px] border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#d7e7f8] text-left text-[10px] font-semibold uppercase text-[#0f2747]">
                        <th className="px-3 py-2">Día</th>
                        <th className="px-3 py-2">Permitir</th>
                        <th className="px-3 py-2">Desde</th>
                        <th className="px-3 py-2">Hasta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.map((window) => {
                        const day = APP_ACCESS_WEEKDAYS.find(
                          (item) => item.weekday === window.weekday,
                        );
                        return (
                          <tr key={window.weekday} className="border-t border-[#d7e7f8]">
                            <td className="px-3 py-2 font-semibold text-[#173b68]">
                              {day?.label}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={window.enabled}
                                onChange={(event) =>
                                  updateDay(window.weekday, {
                                    enabled: event.target.checked,
                                    ...(event.target.checked && !window.startTime
                                      ? {
                                          startTime: selected.startTime || "08:30",
                                          endTime: selected.endTime || "18:30",
                                        }
                                      : {}),
                                  })
                                }
                                className="h-4 w-4 accent-[#0b5cab]"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                value={window.enabled ? window.startTime : ""}
                                disabled={!window.enabled}
                                onChange={(event) =>
                                  updateDay(window.weekday, {
                                    startTime: event.target.value,
                                  })
                                }
                                className="h-9 rounded-xl border border-[#9fb8d9] px-2 disabled:bg-slate-100"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                value={window.enabled ? window.endTime : ""}
                                disabled={!window.enabled}
                                onChange={(event) =>
                                  updateDay(window.weekday, {
                                    endTime: event.target.value,
                                  })
                                }
                                className="h-9 rounded-xl border border-[#9fb8d9] px-2 disabled:bg-slate-100"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-red-500">
                    Mensaje que verá el conductor fuera de horario (ejemplo lunes)
                  </span>
                  {buildRestrictedMessage(previewWindow)}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={copyMondayToAll}
                    className="inline-flex h-9 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-xs font-semibold text-[#173b68] transition hover:bg-[#eef6ff]"
                  >
                    Copiar lunes a todos los días
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {selected.restricted ? (
                      <button
                        type="button"
                        onClick={() => void save(true)}
                        disabled={isSaving}
                        className="inline-flex h-9 items-center justify-center rounded-2xl border border-red-300 bg-white px-4 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        Quitar restricción
                      </button>
                    ) : null}
                    {dirty ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(windowsFor(selected));
                          setDirty(false);
                        }}
                        disabled={isSaving}
                        className="inline-flex h-9 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-xs font-semibold text-[#173b68] transition hover:bg-[#eef6ff] disabled:opacity-60"
                      >
                        Descartar cambios
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void save(false)}
                      disabled={isSaving || (!dirty && selected.restricted)}
                      className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-xs font-semibold text-white transition hover:bg-[#084a8c] disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isSaving
                        ? "Guardando..."
                        : selected.restricted
                          ? "Guardar cambios"
                          : "Activar restricción"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">
                Selecciona un turno.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
