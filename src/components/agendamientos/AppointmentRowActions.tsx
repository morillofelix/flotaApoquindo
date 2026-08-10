"use client";

import { useEffect, useRef, useState } from "react";
import { type Appointment } from "@/lib/appointments";
import { shouldSendCalendarInvite } from "@/lib/agendamientos-appointments";

type AppointmentRowActionsProps = {
  appointment: Appointment;
  isResending: boolean;
  onResend: (appointment: Appointment) => void;
  onDelete: (appointment: Appointment) => void;
};

export function canResendAppointmentReminder(appointment: Appointment) {
  if (
    appointment.createdByType === "ejecutivo" &&
    appointment.driverApprovalPending
  ) {
    return true;
  }

  return shouldSendCalendarInvite(appointment);
}

function TrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" />
      <path d="M7 7l.75 11.5a1.4 1.4 0 0 0 1.4 1.2h5.7a1.4 1.4 0 0 0 1.4-1.2L17 7" />
      <path d="M10 10.8v5.8" />
      <path d="M14 10.8v5.8" />
    </svg>
  );
}

function SendIcon({ pulsing }: { pulsing?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`size-4 shrink-0 ${pulsing ? "animate-pulse" : ""}`}
      fill="currentColor"
    >
      <path d="M2.2 11.4 21.2 2.8l-3.4 8.8 5.1 1.7-3.4 1.2-1.2 3.4-1.7-5.1L2.2 11.4z" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4"
      fill="currentColor"
    >
      <circle cx="12" cy="6" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="18" r="1.8" />
    </svg>
  );
}

export default function AppointmentRowActions({
  appointment,
  isResending,
  onResend,
  onDelete,
}: AppointmentRowActionsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const showResend = canResendAppointmentReminder(appointment);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex flex-col items-center">
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#173b68]">
        Acciones
      </p>

      <button
        type="button"
        title="Ver acciones"
        aria-label="Ver acciones"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex size-8 items-center justify-center rounded-lg border border-[#9fb8d9] bg-white text-[#173b68] shadow-sm transition hover:border-[#0b5cab] hover:bg-[#eef6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5cab]/25"
      >
        <DotsIcon />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-full top-5 z-40 mr-1.5 min-w-[12.5rem] overflow-hidden rounded-xl border border-[#b7cce4] bg-white py-1 shadow-lg shadow-slate-300/35"
        >
          {showResend ? (
            <button
              type="button"
              role="menuitem"
              disabled={isResending}
              onClick={() => {
                setOpen(false);
                onResend(appointment);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-[#0b5cab] transition hover:bg-[#eef6ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SendIcon pulsing={isResending} />
              <span>Enviar nuevamente</span>
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete(appointment);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-red-700 transition hover:bg-red-50"
          >
            <TrashIcon />
            <span>Eliminar</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
