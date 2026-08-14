"use client";

import { useEffect, useRef, useState } from "react";
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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Ver motivo del rechazo"
        title="Ver motivo del rechazo"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex size-8 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h8M8 14h5"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12c0 4.418-4.03 8-9 8-.9 0-1.76-.12-2.56-.35L3 21l1.55-3.72C3.58 16.08 3 14.11 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
          />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-red-200 bg-white p-3 shadow-lg shadow-slate-300/40">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-800">
            Motivo del rechazo
          </p>
          <p className="mt-1.5 text-xs font-medium leading-5 text-[#0f2747]">
            {message}
          </p>
        </div>
      ) : null}
    </div>
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
