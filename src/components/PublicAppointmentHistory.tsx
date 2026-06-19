"use client";

import {
  statusLabels,
  formatCreatedAt,
} from "@/lib/agendamientos-appointments";
import { type AppointmentStatus } from "@/lib/appointments";
import { UI_PANEL_BORDER } from "@/lib/ui-borders";
import { useEffect, useId, useState } from "react";

export type PublicAppointmentSummary = {
  ticketLabel: string;
  appointmentReasonLabel: string;
  status: AppointmentStatus;
  assignedExecutive: string;
  allowsExecutiveAssignment: boolean;
  scheduledSummary: string;
  createdAt: string;
};

const publicStatusBadgeStyles: Record<AppointmentStatus, string> = {
  pendiente:
    "border-amber-400 bg-amber-100 text-amber-950 ring-2 ring-amber-200/80",
  revisado:
    "border-emerald-400 bg-emerald-100 text-emerald-950 ring-2 ring-emerald-200/80",
  aprobado:
    "border-blue-400 bg-blue-100 text-blue-950 ring-2 ring-blue-200/80",
  rechazado:
    "border-red-400 bg-red-100 text-red-950 ring-2 ring-red-200/80",
  cancelado:
    "border-slate-400 bg-slate-200 text-slate-800 ring-2 ring-slate-200/80",
};

const publicStatusCardAccent: Record<AppointmentStatus, string> = {
  pendiente: "border-l-4 border-l-amber-400",
  revisado: "border-l-4 border-l-emerald-500",
  aprobado: "border-l-4 border-l-blue-500",
  rechazado: "border-l-4 border-l-red-500",
  cancelado: "border-l-4 border-l-slate-400",
};

const publicStatusDotStyles: Record<AppointmentStatus, string> = {
  pendiente: "bg-amber-500",
  revisado: "bg-emerald-500",
  aprobado: "bg-blue-500",
  rechazado: "bg-red-500",
  cancelado: "bg-slate-500",
};

type PublicAppointmentHistoryContentProps = {
  appointments: PublicAppointmentSummary[];
  vehicleNumber: string;
};

function PublicAppointmentHistoryContent({
  appointments,
  vehicleNumber,
}: PublicAppointmentHistoryContentProps) {
  return (
    <>
      <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0b5cab]">
          Últimas 3 solicitudes
        </h3>
        <p className="text-[11px] text-slate-500">Móvil {vehicleNumber}</p>
      </div>

      <ul className="grid max-h-[min(60vh,24rem)] gap-2 overflow-y-auto pr-0.5">
        {appointments.map((appointment) => (
          <li
            key={`${appointment.ticketLabel}-${appointment.createdAt}`}
            className={`rounded-xl border border-[#c5d8eb] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,39,71,0.04)] ${publicStatusCardAccent[appointment.status]}`}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] shadow-sm ${publicStatusBadgeStyles[appointment.status]}`}
                >
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${publicStatusDotStyles[appointment.status]} ${appointment.status === "pendiente" ? "animate-pulse" : ""}`}
                  />
                  {statusLabels[appointment.status]}
                </span>
                {appointment.allowsExecutiveAssignment &&
                appointment.assignedExecutive ? (
                  <span className="inline-flex items-center rounded-full border border-[#0b5cab]/25 bg-[#d7e7f8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0b5cab]">
                    Derivado
                  </span>
                ) : null}
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-heading text-sm font-bold tracking-tight text-[#0f2747]">
                    {appointment.ticketLabel}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-sm font-medium text-[#173b68]">
                    {appointment.appointmentReasonLabel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {formatCreatedAt(appointment.createdAt)}
                </p>
                  {appointment.scheduledSummary ? (
                    <p className="text-xs font-medium text-[#0f2747]">
                      Atención:{" "}
                      <span className="text-[#0b5cab]">
                        {appointment.scheduledSummary}
                      </span>
                    </p>
                  ) : null}
                  {appointment.assignedExecutive ? (
                  <p className="text-xs font-medium text-[#0f2747]">
                    Ejecutivo:{" "}
                    <span className="text-[#0b5cab]">
                      {appointment.assignedExecutive}
                    </span>
                  </p>
                ) : appointment.allowsExecutiveAssignment &&
                  appointment.status === "revisado" ? (
                  <p className="text-xs text-slate-500">
                    Derivación en proceso
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

type PublicAppointmentHistoryProps = {
  appointments: PublicAppointmentSummary[];
  isLoading: boolean;
  vehicleNumber: string;
};

export default function PublicAppointmentHistory({
  appointments,
  isLoading,
  vehicleNumber,
}: PublicAppointmentHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const showBell =
    Boolean(vehicleNumber) && !isLoading && appointments.length > 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!showBell) {
      setIsOpen(false);
    }
  }, [showBell]);

  if (!showBell) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="relative mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#9fb8d9] bg-white text-[#0b5cab] shadow-[0_1px_2px_rgba(15,39,71,0.05)] transition hover:border-[#0b5cab] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5cab]/25"
        aria-label={`Ver ${appointments.length} solicitud${appointments.length === 1 ? "" : "es"} recientes`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          className="size-5"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[#0b5cab] text-[10px] font-bold text-white ring-2 ring-white">
          {appointments.length}
        </span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-[#0f2747]/45 backdrop-blur-[1px]"
            aria-label="Cerrar historial de solicitudes"
            onClick={() => setIsOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`relative z-10 w-full max-w-md rounded-2xl ${UI_PANEL_BORDER} bg-white p-4 shadow-2xl shadow-slate-900/20 sm:p-5`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p
                  id={titleId}
                  className="font-heading text-base font-semibold text-[#0f2747]"
                >
                  Tus solicitudes
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Revisa el estado de tus últimas solicitudes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-[#0f2747]"
                aria-label="Cerrar"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-5"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <PublicAppointmentHistoryContent
              appointments={appointments}
              vehicleNumber={vehicleNumber}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
