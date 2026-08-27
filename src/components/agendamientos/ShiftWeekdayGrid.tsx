"use client";

import type { ShiftDayRuleConfig } from "@/lib/shift-definitions";

const weekdays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

type Props = {
  dayRules: ShiftDayRuleConfig[];
  defaultStartTime: string;
  defaultEndTime: string;
  onChange?: (dayRules: ShiftDayRuleConfig[]) => void;
  readOnly?: boolean;
  compact?: boolean;
};

export function cloneDayRules(
  rules: ShiftDayRuleConfig[] | undefined,
  fallbackStart = "08:00",
  fallbackEnd = "17:00",
): ShiftDayRuleConfig[] {
  const byWeekday = new Map((rules ?? []).map((rule) => [rule.weekday, rule]));
  return weekdays.map((_, index) => {
    const weekday = index + 1;
    const existing = byWeekday.get(weekday);
    const works = existing?.works ?? weekday < 6;
    return {
      weekday,
      works,
      startTime: existing?.startTime || fallbackStart,
      endTime: existing?.endTime || fallbackEnd,
      durationMinutes: existing?.durationMinutes ?? 540,
      defaultStatusCode: works ? "TRABAJA" : "LIBRE",
    };
  });
}

export default function ShiftWeekdayGrid({
  dayRules,
  defaultStartTime,
  defaultEndTime,
  onChange,
  readOnly = false,
  compact = false,
}: Props) {
  function updateDay(index: number, patch: Partial<ShiftDayRuleConfig>) {
    if (readOnly || !onChange) return;
    onChange(
      dayRules.map((day, i) =>
        i === index
          ? {
              ...day,
              ...patch,
              defaultStatusCode:
                patch.works === false
                  ? "LIBRE"
                  : patch.works === true
                    ? "TRABAJA"
                    : patch.defaultStatusCode ?? day.defaultStatusCode,
            }
          : day,
      ),
    );
  }

  return (
    <div
      className={`overflow-auto rounded-2xl border border-[#b7cce4] bg-white ${
        compact ? "" : "mt-2"
      }`}
    >
      <div className="border-b border-[#d7e7f8] bg-[#eef3f9] px-3 py-2 text-[11px] text-slate-600">
        Grilla semanal: <strong>tildado = trabaja</strong>,{" "}
        <strong>sin tildar = libre</strong>.
      </div>
      <div
        className={`min-w-[480px] grid grid-cols-[1fr_.55fr_.8fr_.8fr_.8fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase text-[#0f2747] ${
          compact ? "text-[9px]" : ""
        }`}
      >
        <span>Día</span>
        <span>Trabaja</span>
        <span>Inicio</span>
        <span>Término</span>
        <span>Estado</span>
      </div>
      {dayRules.map((day, index) => (
        <div
          key={day.weekday}
          className={`min-w-[480px] grid grid-cols-[1fr_.55fr_.8fr_.8fr_.8fr] items-center gap-2 border-t border-[#d7e7f8] px-3 py-2 ${
            compact ? "text-[11px]" : "text-xs"
          }`}
        >
          <strong className="text-[#173b68]">{weekdays[index]}</strong>
          <input
            type="checkbox"
            checked={day.works}
            disabled={readOnly}
            onChange={(e) =>
              updateDay(index, {
                works: e.target.checked,
                defaultStatusCode: e.target.checked ? "TRABAJA" : "LIBRE",
                ...(e.target.checked
                  ? {
                      startTime: defaultStartTime,
                      endTime: defaultEndTime,
                    }
                  : {}),
              })
            }
            className="h-4 w-4 accent-[#0b5cab] disabled:opacity-60"
            aria-label={`${weekdays[index]} trabaja`}
          />
          <input
            type="time"
            value={day.startTime}
            disabled={readOnly || !day.works}
            onChange={(e) => updateDay(index, { startTime: e.target.value })}
            className="h-8 rounded-xl border border-[#9fb8d9] px-2 disabled:bg-slate-100"
          />
          <input
            type="time"
            value={day.endTime}
            disabled={readOnly || !day.works}
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
  );
}
