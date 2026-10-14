"use client";

import { useMemo, useState } from "react";

export type MonthPlanEntry = {
  works: boolean;
  startTime: string;
  endTime: string;
};

export type MonthPlanDay = {
  date: string;
  day: number;
  weekday: number;
  statusCode: string;
  works: boolean;
  startTime: string;
  endTime: string;
  isHoliday: boolean;
  edited: boolean;
};

type Props = {
  days: MonthPlanDay[];
  defaultStartTime: string;
  defaultEndTime: string;
  onSetDays: (entries: Array<{ date: string } & MonthPlanEntry>) => void;
  onResetDays: (dates: string[]) => void;
};

const weekdayHeaders = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const weekdayNames = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

type Selection =
  | { kind: "day"; date: string }
  | { kind: "week"; index: number }
  | null;

function statusLabel(day: MonthPlanDay) {
  if (day.statusCode === "TRABAJA") return "Trabaja";
  if (day.statusCode === "LIBRE") return "Libre";
  if (day.statusCode === "FERIADO") return "Feriado";
  return day.statusCode.replaceAll("_", " ").toLowerCase();
}

function cellTone(day: MonthPlanDay) {
  if (day.statusCode === "TRABAJA") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (day.statusCode === "FERIADO") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function MonthPlanCalendar({
  days,
  defaultStartTime,
  defaultEndTime,
  onSetDays,
  onResetDays,
}: Props) {
  const [selection, setSelection] = useState<Selection>(null);

  const weeks = useMemo(() => {
    const rows: Array<Array<MonthPlanDay | null>> = [];
    let current: Array<MonthPlanDay | null> = Array.from(
      { length: (days[0]?.weekday ?? 1) - 1 },
      () => null,
    );
    for (const day of days) {
      current.push(day);
      if (current.length === 7) {
        rows.push(current);
        current = [];
      }
    }
    if (current.length) {
      while (current.length < 7) current.push(null);
      rows.push(current);
    }
    return rows;
  }, [days]);

  const editedCount = days.filter((day) => day.edited).length;
  const selectedDay =
    selection?.kind === "day"
      ? days.find((day) => day.date === selection.date) ?? null
      : null;
  const selectedWeek =
    selection?.kind === "week" ? weeks[selection.index] ?? null : null;

  function setDay(day: MonthPlanDay, patch: Partial<MonthPlanEntry>) {
    const works = patch.works ?? day.works;
    onSetDays([
      {
        date: day.date,
        works,
        startTime: works
          ? patch.startTime ?? (day.startTime || defaultStartTime)
          : "",
        endTime: works ? patch.endTime ?? (day.endTime || defaultEndTime) : "",
      },
    ]);
  }

  function copyWeekForward(index: number) {
    const source = weeks[index];
    if (!source) return;
    const entries: Array<{ date: string } & MonthPlanEntry> = [];
    for (let target = index + 1; target < weeks.length; target += 1) {
      (weeks[target] ?? []).forEach((targetDay, column) => {
        const sourceDay = source[column];
        if (!targetDay || !sourceDay) return;
        if (targetDay.isHoliday || sourceDay.isHoliday) return;
        entries.push({
          date: targetDay.date,
          works: sourceDay.works,
          startTime: sourceDay.works ? sourceDay.startTime : "",
          endTime: sourceDay.works ? sourceDay.endTime : "",
        });
      });
    }
    if (entries.length) onSetDays(entries);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
        <p>
          Clic en un día para cambiarlo, o en <strong>Editar</strong> para
          ajustar toda la semana. Solo aplica a esta generación; el turno
          guardado no cambia.
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
            {editedCount} día(s) ajustado(s)
          </span>
          {editedCount ? (
            <button
              type="button"
              onClick={() => {
                onResetDays(days.filter((day) => day.edited).map((day) => day.date));
                setSelection(null);
              }}
              className="rounded-full border border-[#9fb8d9] bg-white px-2.5 py-0.5 font-semibold text-[#173b68] hover:bg-[#eef6ff]"
            >
              Restablecer todo
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border border-[#b7cce4] bg-white">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#d7e7f8] text-[10px] font-semibold uppercase text-[#0f2747]">
              <th className="w-28 px-2 py-2 text-left">Semana</th>
              {weekdayHeaders.map((label) => (
                <th key={label} className="px-1 py-2 text-center">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, index) => (
              <tr
                key={index}
                className={`border-t border-[#d7e7f8] ${
                  selection?.kind === "week" && selection.index === index
                    ? "bg-[#eef6ff]"
                    : ""
                }`}
              >
                <td className="px-2 py-1.5 align-top">
                  <strong className="block text-[#173b68]">
                    Semana {index + 1}
                  </strong>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setSelection({ kind: "week", index })}
                      className="rounded-lg border border-[#9fb8d9] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#0b5cab] hover:bg-[#eef6ff]"
                    >
                      Editar
                    </button>
                    {index < weeks.length - 1 ? (
                      <button
                        type="button"
                        title="Copiar esta semana a las semanas siguientes (los feriados no se modifican)"
                        onClick={() => copyWeekForward(index)}
                        className="rounded-lg border border-[#9fb8d9] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#0b5cab] hover:bg-[#eef6ff]"
                      >
                        Copiar ↓
                      </button>
                    ) : null}
                  </div>
                </td>
                {week.map((day, column) =>
                  day ? (
                    <td key={day.date} className="p-1 align-top">
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: "day", date: day.date })}
                        className={`flex min-h-[3.6rem] w-full flex-col items-start rounded-xl border p-1.5 text-left transition hover:brightness-95 ${cellTone(day)} ${
                          day.edited ? "ring-2 ring-amber-400" : ""
                        } ${
                          selection?.kind === "day" && selection.date === day.date
                            ? "outline outline-2 outline-[#0b5cab]"
                            : ""
                        }`}
                      >
                        <span className="text-xs font-bold">{day.day}</span>
                        <span className="font-semibold capitalize">
                          {statusLabel(day)}
                        </span>
                        {day.works && day.startTime ? (
                          <span className="text-[10px]">
                            {day.startTime}–{day.endTime}
                          </span>
                        ) : null}
                      </button>
                    </td>
                  ) : (
                    <td key={`empty-${index}-${column}`} className="p-1" />
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedDay ? (
        <div className="rounded-2xl border border-[#b7cce4] bg-white p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-[#0f2747]">
              Día {selectedDay.day} ({weekdayNames[selectedDay.weekday - 1]})
              {selectedDay.isHoliday ? " · feriado" : ""}
            </strong>
            <div className="flex gap-2">
              {selectedDay.edited ? (
                <button
                  type="button"
                  onClick={() => onResetDays([selectedDay.date])}
                  className="rounded-lg border border-[#9fb8d9] px-2 py-1 font-semibold text-[#173b68] hover:bg-[#eef6ff]"
                >
                  Volver a lo del turno
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelection(null)}
                className="rounded-lg border border-[#9fb8d9] px-2 py-1 font-semibold text-[#173b68] hover:bg-[#eef6ff]"
              >
                Cerrar
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={selectedDay.works}
                onChange={(event) =>
                  setDay(selectedDay, {
                    works: event.target.checked,
                    ...(event.target.checked
                      ? { startTime: defaultStartTime, endTime: defaultEndTime }
                      : {}),
                  })
                }
                className="h-4 w-4 accent-[#0b5cab]"
              />
              Trabaja
            </label>
            <label className="flex items-center gap-1">
              Inicio
              <input
                type="time"
                value={selectedDay.works ? selectedDay.startTime : ""}
                disabled={!selectedDay.works}
                onChange={(event) =>
                  setDay(selectedDay, { startTime: event.target.value })
                }
                className="h-8 rounded-xl border border-[#9fb8d9] px-2 disabled:bg-slate-100"
              />
            </label>
            <label className="flex items-center gap-1">
              Término
              <input
                type="time"
                value={selectedDay.works ? selectedDay.endTime : ""}
                disabled={!selectedDay.works}
                onChange={(event) =>
                  setDay(selectedDay, { endTime: event.target.value })
                }
                className="h-8 rounded-xl border border-[#9fb8d9] px-2 disabled:bg-slate-100"
              />
            </label>
          </div>
        </div>
      ) : null}

      {selectedWeek && selection?.kind === "week" ? (
        <div className="rounded-2xl border border-[#b7cce4] bg-white p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-[#0f2747]">
              Semana {selection.index + 1}
            </strong>
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="rounded-lg border border-[#9fb8d9] px-2 py-1 font-semibold text-[#173b68] hover:bg-[#eef6ff]"
            >
              Cerrar
            </button>
          </div>
          <div className="mt-2 overflow-auto">
            <div className="grid min-w-[700px] grid-cols-7 gap-2">
              {selectedWeek.map((day, column) => (
                <div
                  key={day?.date ?? `empty-${column}`}
                  className={`rounded-xl border p-2 ${
                    day ? "border-[#c5d8eb]" : "border-dashed border-slate-200"
                  }`}
                >
                  <p className="font-semibold text-[#173b68]">
                    {weekdayHeaders[column]} {day ? day.day : ""}
                  </p>
                  {day ? (
                    <div className="mt-1 grid gap-1">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={day.works}
                          onChange={(event) =>
                            setDay(day, {
                              works: event.target.checked,
                              ...(event.target.checked
                                ? {
                                    startTime: defaultStartTime,
                                    endTime: defaultEndTime,
                                  }
                                : {}),
                            })
                          }
                          className="h-4 w-4 accent-[#0b5cab]"
                        />
                        Trabaja
                      </label>
                      <input
                        type="time"
                        value={day.works ? day.startTime : ""}
                        disabled={!day.works}
                        onChange={(event) =>
                          setDay(day, { startTime: event.target.value })
                        }
                        className="h-8 rounded-xl border border-[#9fb8d9] px-1 disabled:bg-slate-100"
                      />
                      <input
                        type="time"
                        value={day.works ? day.endTime : ""}
                        disabled={!day.works}
                        onChange={(event) =>
                          setDay(day, { endTime: event.target.value })
                        }
                        className="h-8 rounded-xl border border-[#9fb8d9] px-1 disabled:bg-slate-100"
                      />
                      {day.isHoliday ? (
                        <span className="text-[10px] font-semibold text-rose-700">
                          Feriado
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-400">Otro mes</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
