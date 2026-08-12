"use client";

import { type ExecutiveDayAvailability } from "@/lib/executive-day-availability";

type ExecutiveAvailabilityPanelProps = {
  executiveName: string;
  appointmentDateLabel: string;
  availability: ExecutiveDayAvailability;
  selectedStartTime: string;
  onSelectStartTime?: (startTime: string) => void;
  allowSelect?: boolean;
};

export default function ExecutiveAvailabilityPanel({
  executiveName,
  appointmentDateLabel,
  availability,
  selectedStartTime,
  onSelectStartTime,
  allowSelect = true,
}: ExecutiveAvailabilityPanelProps) {
  return (
    <div className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-4 py-3 sm:col-span-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Disponibilidad del día
      </p>
      <p className="mt-1 text-sm font-semibold text-[#0f2747]">
        {executiveName} · {appointmentDateLabel}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Duración estimada de la cita: {availability.durationMinutes} min
        {availability.hasLunchBreak ? " · Incluye bloqueo de colación" : ""}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a3b12]">
            Ocupado
          </p>
          {availability.busy.length ? (
            <ul className="mt-2 space-y-1.5">
              {availability.busy.map((block) => (
                <li
                  key={`${block.kind}-${block.startTime}-${block.endTime}`}
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    block.kind === "colacion"
                      ? "border-amber-200 bg-amber-50 text-amber-950"
                      : "border-rose-200 bg-rose-50 text-rose-900"
                  }`}
                >
                  <span className="font-semibold">
                    {block.startTime} – {block.endTime}
                  </span>
                  <span className="mt-0.5 block opacity-90">{block.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Sin citas ni colación en este día.
            </p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#0b5cab]">
            Libre
          </p>
          {availability.free.length ? (
            <ul className="mt-2 space-y-1.5">
              {availability.free.map((block) => (
                <li
                  key={`free-${block.startTime}-${block.endTime}`}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
                >
                  <span className="font-semibold">
                    {block.startTime} – {block.endTime}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              No quedan espacios libres en la jornada.
            </p>
          )}
        </div>
      </div>

      {allowSelect && availability.suggestedStarts.length ? (
        <div className="mt-3 border-t border-[#c5d8eb] pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#173b68]">
            Horas sugeridas
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {availability.suggestedStarts.slice(0, 16).map((slot) => {
              const selected = selectedStartTime === slot.startTime;

              return (
                <button
                  key={slot.startTime}
                  type="button"
                  onClick={() => onSelectStartTime?.(slot.startTime)}
                  className={`inline-flex h-8 items-center justify-center rounded-full border px-3 text-xs font-semibold transition ${
                    selected
                      ? "border-[#0b5cab] bg-[#0b5cab] text-white"
                      : "border-[#9fb8d9] bg-white text-[#173b68] hover:border-[#0b5cab] hover:bg-[#eef3f9]"
                  }`}
                >
                  {slot.startTime}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Toca una hora para asignarla. También puedes escribirla manualmente.
          </p>
        </div>
      ) : null}

      {allowSelect &&
      !availability.suggestedStarts.length &&
      availability.busy.length ? (
        <p className="mt-3 text-xs font-medium text-amber-800">
          No hay huecos suficientes para una cita de{" "}
          {availability.durationMinutes} minutos este día.
        </p>
      ) : null}
    </div>
  );
}
