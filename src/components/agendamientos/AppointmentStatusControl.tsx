"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  type Appointment,
  type AppointmentStatus,
} from "@/lib/appointments";
import {
  appointmentAllowsExecutive,
  statusLabels,
  statusStyles,
} from "@/lib/agendamientos-appointments";
import NotePeekButton from "@/components/agendamientos/NotePeekButton";

const auditActionLabels: Partial<Record<AppointmentStatus, string>> = {
  pendiente: "Vuelto a pendiente",
  revisado: "Agendado",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
  anulado: "Anulado",
};

function formatAuditDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusAuditHover({
  appointment,
  children,
}: {
  appointment: Appointment;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    above: boolean;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audit =
    appointment.statusAudit &&
    appointment.statusAudit.status === appointment.status
      ? appointment.statusAudit
      : null;

  if (!audit && appointment.status === "pendiente") {
    return <>{children}</>;
  }

  function show() {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const width = 260;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const above = rect.top > 150;
    const top = above ? rect.top - 8 : rect.bottom + 8;
    setPosition({ top, left, above });
  }

  return (
    <div
      ref={containerRef}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setPosition(null)}
    >
      {children}
      {position ? (
        <div
          role="tooltip"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            width: 260,
            transform: position.above ? "translateY(-100%)" : undefined,
            zIndex: 90,
          }}
          className={`pointer-events-none rounded-xl border bg-white px-3 py-2.5 text-left text-xs shadow-lg shadow-slate-400/30 ${
            appointment.status === "anulado"
              ? "border-red-300"
              : "border-[#b7cce4]"
          }`}
        >
          {audit ? (
            <>
              <p
                className={`font-semibold ${
                  appointment.status === "anulado"
                    ? "text-red-800"
                    : "text-[#0f2747]"
                }`}
              >
                {auditActionLabels[audit.status] ?? statusLabels[audit.status]}{" "}
                por {audit.userName || "usuario sin nombre"}
              </p>
              {audit.userEmail && audit.userEmail !== audit.userName ? (
                <p className="mt-0.5 break-all text-[11px] text-slate-500">
                  {audit.userEmail}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-slate-600">
                {formatAuditDate(audit.at)}
              </p>
              {audit.reason && audit.action === "anular" ? (
                <p className="mt-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] leading-4 text-red-900">
                  <span className="font-semibold">Motivo:</span> {audit.reason}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[11px] text-slate-500">
              Sin registro de usuario: este cambio se hizo antes de activar la
              auditoría.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

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
  } else if (appointment.status === "anulado") {
    control = (
      <span
        className={`inline-flex h-8 min-w-28 items-center justify-center rounded-full border px-2.5 text-xs font-semibold ${statusStyles.anulado}`}
      >
        Anulado
      </span>
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
      <StatusAuditHover appointment={appointment}>{control}</StatusAuditHover>
      {showRejectionNote ? (
        <NotePeekButton
          tone="navy"
          message={rejectionNote}
          eyebrow="Solicitud rechazada"
          title="Motivo del rechazo"
          ariaLabel="Ver motivo del rechazo"
        />
      ) : null}
    </div>
  );
}
