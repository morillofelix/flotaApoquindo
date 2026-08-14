"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type Appointment,
  type AppointmentStatus,
} from "@/lib/appointments";
import {
  appointmentAllowsExecutive,
  statusStyles,
} from "@/lib/agendamientos-appointments";

type AppointmentStatusControlProps = {
  appointment: Appointment;
  onRequestStatusChange: (
    appointment: Appointment,
    nextStatus: AppointmentStatus,
  ) => void;
};

const revisadoAlternateStatuses: {
  value: AppointmentStatus;
  label: string;
}[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "aprobado", label: "Aprobado" },
  { value: "rechazado", label: "Rechazado" },
];

function StatusBadgeButton({
  label,
  className,
  options,
  onSelect,
}: {
  label: string;
  className: string;
  options: { value: AppointmentStatus; label: string }[];
  onSelect: (status: AppointmentStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    <div
      ref={containerRef}
      className="group relative inline-flex min-w-28"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-full border px-2.5 text-xs font-semibold transition hover:brightness-[0.98] ${className}`}
      >
        {label}
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 pt-1">
          <div
            role="menu"
            className="min-w-[11.5rem] overflow-hidden rounded-xl border border-[#b7cce4] bg-white py-1 shadow-lg shadow-slate-300/30"
          >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(option.value);
              }}
              className="flex w-full items-center px-3 py-2 text-left text-xs font-semibold text-[#173b68] transition hover:bg-[#eef6ff]"
            >
              {option.label}
            </button>
          ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RejectionNoteButton({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-labelledby="rejection-note-title"
            aria-modal="true"
            className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0f2747]/55 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6"
            role="dialog"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-2xl shadow-slate-900/25 sm:rounded-[24px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-[#c5d8eb] bg-[#eef3f9] px-4 py-3.5 sm:px-5 sm:py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0b5cab] sm:text-xs">
                  Solicitud rechazada
                </p>
                <h2
                  id="rejection-note-title"
                  className="mt-1.5 font-heading text-lg font-semibold leading-tight text-[#0f2747] sm:mt-2 sm:text-xl"
                >
                  Motivo del rechazo
                </h2>
              </div>

              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <p className="rounded-2xl border border-[#c5d8eb] bg-[#f8fbff] px-4 py-3 text-sm font-medium leading-6 text-[#0f2747]">
                  {message}
                </p>

                <div className="mt-5 flex justify-end">
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white shadow-md shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        aria-label="Ver motivo del rechazo"
        title="Ver motivo del rechazo"
        onClick={() => setOpen(true)}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white text-[#0b5cab] shadow-[0_1px_2px_rgba(15,39,71,0.06)] transition hover:border-[#0b5cab] hover:bg-[#eef6ff]"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      </button>
      {dialog}
    </>
  );
}

export default function AppointmentStatusControl({
  appointment,
  onRequestStatusChange,
}: AppointmentStatusControlProps) {
  const rejectionNote = appointment.rejectionMessage.trim();
  const showRejectionNote =
    appointment.status === "rechazado" && rejectionNote.length > 0;

  let control = (
    <select
      value={appointment.status}
      onChange={(event) =>
        onRequestStatusChange(
          appointment,
          event.target.value as AppointmentStatus,
        )
      }
      className={`h-8 min-w-28 rounded-full border px-2.5 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-[#0b5cab]/15 ${statusStyles[appointment.status]}`}
    >
      <option value="pendiente">Pendiente</option>
      <option value="aprobado">Aprobado</option>
      <option value="rechazado">Rechazado</option>
    </select>
  );

  if (appointment.status === "revisado") {
    const options = appointmentAllowsExecutive(appointment)
      ? [{ value: "cancelado" as const, label: "Cambiar a Cancelado" }]
      : revisadoAlternateStatuses.map((option) => ({
          value: option.value,
          label: `Cambiar a ${option.label}`,
        }));

    control = (
      <StatusBadgeButton
        label="Agendado"
        className={statusStyles.revisado}
        options={options}
        onSelect={(nextStatus) =>
          onRequestStatusChange(appointment, nextStatus)
        }
      />
    );
  } else if (appointment.status === "cancelado") {
    control = (
      <StatusBadgeButton
        label="Cancelado"
        className={statusStyles.cancelado}
        options={[{ value: "revisado", label: "Cambiar a Agendado" }]}
        onSelect={(nextStatus) =>
          onRequestStatusChange(appointment, nextStatus)
        }
      />
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      {control}
      {showRejectionNote ? <RejectionNoteButton message={rejectionNote} /> : null}
    </div>
  );
}
