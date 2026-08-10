"use client";

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

function iconButtonClassName(variant: "danger" | "primary") {
  const base =
    "inline-flex size-9 items-center justify-center rounded-lg border bg-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

  if (variant === "danger") {
    return `${base} border-red-300 text-red-700 hover:bg-red-50 focus-visible:ring-red-200/70`;
  }

  return `${base} border-[#7eb0dc] text-[#0b5cab] hover:border-[#0b5cab] hover:bg-[#eef6ff] focus-visible:ring-[#0b5cab]/25`;
}

export default function AppointmentRowActions({
  appointment,
  isResending,
  onResend,
  onDelete,
}: AppointmentRowActionsProps) {
  const showResend = canResendAppointmentReminder(appointment);

  return (
    <div
      className="inline-flex flex-col items-center gap-1.5 rounded-xl border border-[#b7cce4] bg-[#f8fbff] p-1.5"
      title="Acciones de la solicitud"
    >
      {showResend ? (
        <button
          type="button"
          title="Reenviar solicitud"
          aria-label="Reenviar solicitud"
          disabled={isResending}
          onClick={() => onResend(appointment)}
          className={iconButtonClassName("primary")}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className={`size-[18px] ${isResending ? "animate-pulse" : ""}`}
            fill="currentColor"
          >
            <path d="M2.2 11.4 21.2 2.8l-3.4 8.8 5.1 1.7-3.4 1.2-1.2 3.4-1.7-5.1L2.2 11.4z" />
          </svg>
        </button>
      ) : null}

      <button
        type="button"
        title="Eliminar"
        aria-label="Eliminar"
        onClick={() => onDelete(appointment)}
        className={iconButtonClassName("danger")}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-[18px]"
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
      </button>
    </div>
  );
}
