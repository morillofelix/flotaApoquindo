"use client";

import {
  statusLabels,
  formatCreatedAt,
} from "@/lib/agendamientos-appointments";
import { type AppointmentCreatedByType, type AppointmentStatus } from "@/lib/appointments";
import { playNotificationSound } from "@/lib/notification-sound";
import { UI_PANEL_BORDER } from "@/lib/ui-borders";
import { useEffect, useId, useRef, useState } from "react";

export type PublicAppointmentSummary = {
  id: string;
  ticketLabel: string;
  appointmentReasonLabel: string;
  status: AppointmentStatus;
  assignedExecutive: string;
  allowsExecutiveAssignment: boolean;
  scheduledSummary: string;
  dateChangePending: boolean;
  dateChangeMessage: string;
  driverApprovalPending: boolean;
  driverApprovalRejected: boolean;
  driverApprovalMessage: string;
  rejectionMessage: string;
  createdByType: AppointmentCreatedByType;
  createdByExecutiveName: string;
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
  onDismissDateChange?: (appointmentId: string) => void;
  onApproveDriverRequest?: (appointmentId: string) => void;
  onRejectDriverRequest?: (
    appointmentId: string,
    rejectionNote: string,
  ) => void | Promise<void>;
};

function PublicAppointmentHistoryContent({
  appointments,
  vehicleNumber,
  onDismissDateChange,
  onApproveDriverRequest,
  onRejectDriverRequest,
}: PublicAppointmentHistoryContentProps) {
  const [rejectingId, setRejectingId] = useState("");
  const [rejectionNote, setRejectionNote] = useState("");
  const [rejectionError, setRejectionError] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  async function submitRejection(appointmentId: string) {
    const note = rejectionNote.trim();
    if (note.length < 3) {
      setRejectionError("Escribe una observación breve (mínimo 3 caracteres).");
      return;
    }

    if (!onRejectDriverRequest) {
      return;
    }

    setIsRejecting(true);
    setRejectionError("");
    try {
      await onRejectDriverRequest(appointmentId, note);
      setRejectingId("");
      setRejectionNote("");
    } catch {
      setRejectionError("No se pudo registrar el rechazo. Intenta nuevamente.");
    } finally {
      setIsRejecting(false);
    }
  }

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
            key={appointment.id}
            className={`rounded-xl border border-[#c5d8eb] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,39,71,0.04)] ${publicStatusCardAccent[appointment.status]}`}
          >
            <div className="flex flex-col gap-2.5">
              {appointment.driverApprovalPending &&
              appointment.driverApprovalMessage ? (
                <div className="rounded-xl border-2 border-violet-400 bg-violet-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-900">
                    Solicitud de tu ejecutivo
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-violet-950">
                    {appointment.driverApprovalMessage}
                  </p>
                  {onApproveDriverRequest || onRejectDriverRequest ? (
                    rejectingId === appointment.id ? (
                      <div className="mt-3 space-y-2">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-violet-900">
                            Observación del rechazo
                          </span>
                          <textarea
                            value={rejectionNote}
                            onChange={(event) => {
                              setRejectionNote(event.target.value.slice(0, 400));
                              setRejectionError("");
                            }}
                            rows={3}
                            maxLength={400}
                            placeholder="Ej: No puedo asistir en ese horario..."
                            className="w-full resize-none rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs leading-5 text-[#0f2747] outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-200"
                          />
                          <span className="text-[10px] text-violet-800/80">
                            {rejectionNote.length}/400
                          </span>
                        </label>
                        {rejectionError ? (
                          <p className="text-[11px] font-medium text-red-700">
                            {rejectionError}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isRejecting}
                            onClick={() => {
                              setRejectingId("");
                              setRejectionNote("");
                              setRejectionError("");
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-xl border border-violet-300 bg-white px-3 text-[11px] font-semibold text-violet-900 transition hover:bg-violet-100 disabled:opacity-60"
                          >
                            Volver
                          </button>
                          <button
                            type="button"
                            disabled={isRejecting}
                            onClick={() => void submitRejection(appointment.id)}
                            className="inline-flex h-8 items-center justify-center rounded-xl border border-red-300 bg-red-600 px-3 text-[11px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                          >
                            {isRejecting ? "Enviando..." : "Confirmar rechazo"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {onApproveDriverRequest ? (
                          <button
                            type="button"
                            onClick={() => onApproveDriverRequest(appointment.id)}
                            className="inline-flex h-8 items-center justify-center rounded-xl bg-violet-700 px-3 text-[11px] font-semibold text-white transition hover:bg-violet-800"
                          >
                            Aprobar solicitud
                          </button>
                        ) : null}
                        {onRejectDriverRequest ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(appointment.id);
                              setRejectionNote("");
                              setRejectionError("");
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-xl border border-red-300 bg-white px-3 text-[11px] font-semibold text-red-700 transition hover:bg-red-50"
                          >
                            Rechazar
                          </button>
                        ) : null}
                      </div>
                    )
                  ) : null}
                </div>
              ) : null}

              {appointment.driverApprovalRejected &&
              appointment.driverApprovalMessage ? (
                <div className="rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-900">
                    Rechazaste esta solicitud
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-red-950">
                    {appointment.driverApprovalMessage}
                  </p>
                </div>
              ) : null}

              {appointment.status === "rechazado" &&
              appointment.rejectionMessage.trim() ? (
                <div className="rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-900">
                    Solicitud rechazada
                  </p>
                  <p className="mt-1 text-xs font-medium leading-5 text-red-950">
                    {appointment.rejectionMessage}
                  </p>
                </div>
              ) : null}

              {appointment.dateChangePending && appointment.dateChangeMessage ? (
                <div
                  className={`rounded-xl border-2 px-3 py-2.5 ${
                    /cancelad/i.test(appointment.dateChangeMessage)
                      ? "border-slate-400 bg-slate-100"
                      : "border-amber-400 bg-amber-50"
                  }`}
                >
                  <p
                    className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                      /cancelad/i.test(appointment.dateChangeMessage)
                        ? "text-slate-800"
                        : "text-amber-900"
                    }`}
                  >
                    {/cancelad/i.test(appointment.dateChangeMessage)
                      ? "Solicitud cancelada"
                      : "Fecha actualizada"}
                  </p>
                  <p
                    className={`mt-1 text-xs font-semibold leading-5 ${
                      /cancelad/i.test(appointment.dateChangeMessage)
                        ? "text-slate-900"
                        : "text-amber-950"
                    }`}
                  >
                    {appointment.dateChangeMessage}
                  </p>
                  {onDismissDateChange ? (
                    <button
                      type="button"
                      onClick={() => onDismissDateChange(appointment.id)}
                      className={`mt-2 text-[11px] font-semibold underline underline-offset-2 ${
                        /cancelad/i.test(appointment.dateChangeMessage)
                          ? "text-slate-800"
                          : "text-amber-900"
                      }`}
                    >
                      Entendido
                    </button>
                  ) : null}
                </div>
              ) : null}
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
                <div className="flex flex-wrap items-center gap-2">
                  {appointment.createdByType === "ejecutivo" ? (
                    <span className="inline-flex items-center rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
                      E
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800">
                      C
                    </span>
                  )}
                  {appointment.allowsExecutiveAssignment &&
                  appointment.assignedExecutive ? (
                    <span className="inline-flex items-center rounded-full border border-[#0b5cab]/25 bg-[#d7e7f8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0b5cab]">
                      Derivado
                    </span>
                  ) : null}
                </div>
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
                {appointment.createdByType === "ejecutivo" &&
                appointment.createdByExecutiveName ? (
                  <p className="text-xs font-medium text-violet-800">
                    Creada por ejecutivo: {appointment.createdByExecutiveName}
                  </p>
                ) : null}
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
  onDismissDateChange?: (appointmentId: string) => void;
  onApproveDriverRequest?: (appointmentId: string) => void;
  onRejectDriverRequest?: (
    appointmentId: string,
    rejectionNote: string,
  ) => void | Promise<void>;
};

export default function PublicAppointmentHistory({
  appointments,
  isLoading,
  vehicleNumber,
  onDismissDateChange,
  onApproveDriverRequest,
  onRejectDriverRequest,
}: PublicAppointmentHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const knownApprovalIdsRef = useRef<Set<string>>(new Set());
  const hasPendingApproval = appointments.some(
    (appointment) => appointment.driverApprovalPending,
  );
  const hasPendingDateChange = appointments.some(
    (appointment) => appointment.dateChangePending,
  );
  const showBell =
    Boolean(vehicleNumber) &&
    !isLoading &&
    (appointments.length > 0 || hasPendingApproval || hasPendingDateChange);

  useEffect(() => {
    if (!showBell) {
      return;
    }

    const pendingApprovalKeys = appointments
      .filter((appointment) => appointment.driverApprovalPending)
      .map(
        (appointment) =>
          `${appointment.id}:${appointment.driverApprovalMessage}`,
      );
    const hasNewApproval = pendingApprovalKeys.some(
      (approvalKey) => !knownApprovalIdsRef.current.has(approvalKey),
    );

    if (hasNewApproval) {
      playNotificationSound();
      setIsOpen(true);
    }

    knownApprovalIdsRef.current = new Set(pendingApprovalKeys);
  }, [appointments, showBell]);

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
        className={`relative mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border bg-white text-[#0b5cab] shadow-[0_1px_2px_rgba(15,39,71,0.05)] transition hover:border-[#0b5cab] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5cab]/25 ${
          hasPendingApproval
            ? "animate-pulse border-violet-400"
            : "border-[#9fb8d9]"
        }`}
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
        <span
          className={`absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white ${
            hasPendingApproval
              ? "bg-violet-700"
              : hasPendingDateChange
                ? "bg-amber-600"
                : "bg-[#0b5cab]"
          }`}
        >
          {hasPendingApproval || hasPendingDateChange ? "!" : appointments.length}
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
              onDismissDateChange={onDismissDateChange}
              onApproveDriverRequest={onApproveDriverRequest}
              onRejectDriverRequest={onRejectDriverRequest}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
