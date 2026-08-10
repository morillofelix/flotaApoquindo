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
    "inline-flex size-8 items-center justify-center rounded-xl border bg-white transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

  if (variant === "danger") {
    return `${base} border-red-200 text-red-700 hover:bg-red-50 focus-visible:ring-red-200/60`;
  }

  return `${base} border-[#9fb8d9] text-[#0b5cab] hover:border-[#0b5cab] hover:bg-[#f8fbff] focus-visible:ring-[#0b5cab]/20`;
}

export default function AppointmentRowActions({
  appointment,
  isResending,
  onResend,
  onDelete,
}: AppointmentRowActionsProps) {
  const showResend = canResendAppointmentReminder(appointment);

  return (
    <div className="flex flex-col items-center gap-1.5">
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
            className={`size-4 ${isResending ? "animate-pulse" : ""}`}
            fill="currentColor"
          >
            <path d="M2.3 11.2 21 3l-3.2 8.4 4.8 1.6-3.2 1.1-1.1 3.2-1.6-4.8L2.3 11.2z" />
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
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 7h15" />
          <path d="M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" />
          <path d="M7 7l.7 11.2a1.5 1.5 0 0 0 1.5 1.3h5.6a1.5 1.5 0 0 0 1.5-1.3L17 7" />
          <path d="M10 10.5v6" />
          <path d="M14 10.5v6" />
        </svg>
      </button>
    </div>
  );
}
