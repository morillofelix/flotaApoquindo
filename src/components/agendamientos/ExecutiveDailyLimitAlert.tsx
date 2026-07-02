"use client";

import { formatDate } from "@/lib/agendamientos-appointments";

type ExecutiveDailyLimitAlertProps = {
  executiveName: string;
  appointmentDate: string;
  currentCount: number;
  max: number;
  onClose: () => void;
};

export default function ExecutiveDailyLimitAlert({
  executiveName,
  appointmentDate,
  currentCount,
  max,
  onClose,
}: ExecutiveDailyLimitAlertProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="pointer-events-auto w-full max-w-lg animate-fade-in overflow-hidden rounded-[22px] border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-orange-50 shadow-2xl shadow-amber-200/60 ring-1 ring-amber-200/80">
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-lg font-bold text-white shadow-md shadow-amber-300/50">
            !
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
              Tope diario alcanzado
            </p>
            <p className="mt-1 font-heading text-base font-semibold leading-snug text-[#0f2747] sm:text-lg">
              {executiveName} ya llegó a la cantidad tope de solicitudes
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Para el día{" "}
              <strong className="text-[#173b68]">
                {formatDate(appointmentDate)}
              </strong>{" "}
              este ejecutivo tiene{" "}
              <strong className="text-[#173b68]">
                {currentCount} de {max}
              </strong>{" "}
              citas asignadas. Elige otro ejecutivo o ajusta el tope en
              Mantenedores.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-sm font-bold text-amber-700 transition hover:bg-amber-50"
            aria-label="Cerrar alerta"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
