"use client";

import {
  type Appointment,
  type AppointmentReasonConfig,
  type ExecutiveConfig,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import {
  buildExecutiveDayAvailability,
  getExistingSlotsForExecutiveDay,
  suggestRangeFromFreeBlock,
  validateAppointmentTimeRange,
  type FreeInterval,
  type SelectedTimeRange,
} from "@/lib/executive-day-availability";
import { formatDisplayDate } from "@/lib/appointment-scheduling";
import ExecutiveAvailabilityPanel from "@/components/agendamientos/ExecutiveAvailabilityPanel";
import { useEffect, useId, useMemo, useState } from "react";

type ExecutiveAssignmentConfirmModalProps = {
  appointment: Appointment;
  assignedExecutive: string;
  executives: ExecutiveConfig[];
  appointments: Appointment[];
  reason: AppointmentReasonConfig | undefined;
  willSendEmail: boolean;
  isConfirming: boolean;
  onCancel: () => void;
  onConfirm: (selection: {
    assignedExecutive: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
  }) => void;
};

function freeBlockKey(block: FreeInterval) {
  return `${block.startTime}-${block.endTime}`;
}

export default function ExecutiveAssignmentConfirmModal({
  appointment,
  assignedExecutive,
  executives,
  appointments,
  reason,
  willSendEmail,
  isConfirming,
  onCancel,
  onConfirm,
}: ExecutiveAssignmentConfirmModalProps) {
  const titleId = useId();
  const isClearing = assignedExecutive === "";
  const [selectedRange, setSelectedRange] = useState<SelectedTimeRange>({
    startTime: appointment.scheduledStartTime || "",
    endTime: appointment.scheduledEndTime || "",
  });
  const [selectedFreeBlockKey, setSelectedFreeBlockKey] = useState<string | null>(
    null,
  );

  const executive = useMemo(
    () => executives.find((option) => option.name === assignedExecutive),
    [assignedExecutive, executives],
  );

  const availability = useMemo(() => {
    if (isClearing || !reason || !executive || !appointment.appointmentDate) {
      return null;
    }

    return buildExecutiveDayAvailability({
      existingSlots: getExistingSlotsForExecutiveDay(
        appointments,
        assignedExecutive,
        appointment.appointmentDate,
        appointment.id,
      ),
      lunchBreak: {
        lunchBreakEnabled: executive.lunchBreakEnabled,
        lunchBreakStart: executive.lunchBreakStart,
        lunchBreakEnd: executive.lunchBreakEnd,
      },
      reason,
      appointmentDate: appointment.appointmentDate,
    });
  }, [
    appointment.appointmentDate,
    appointment.id,
    appointments,
    assignedExecutive,
    executive,
    isClearing,
    reason,
  ]);

  useEffect(() => {
    if (!availability || isClearing) {
      return;
    }

    setSelectedRange((current) => {
      const currentValid =
        current.startTime &&
        current.endTime &&
        validateAppointmentTimeRange({
          startTime: current.startTime,
          endTime: current.endTime,
          availability,
        }).ok;

      if (currentValid) {
        return current;
      }

      const firstSuggested = availability.suggestedStarts[0];
      if (firstSuggested) {
        return firstSuggested;
      }

      return { startTime: "", endTime: "" };
    });
    setSelectedFreeBlockKey(null);
  }, [availability, isClearing]);

  const timeValidation = useMemo(() => {
    if (isClearing) {
      return { ok: true as const };
    }

    if (!availability) {
      return {
        ok: false as const,
        message: "No se pudo cargar la disponibilidad del ejecutivo.",
      };
    }

    if (!selectedRange.startTime || !selectedRange.endTime) {
      return {
        ok: false as const,
        message: "Selecciona un bloque disponible o una hora sugerida.",
      };
    }

    return validateAppointmentTimeRange({
      startTime: selectedRange.startTime,
      endTime: selectedRange.endTime,
      availability,
    });
  }, [availability, isClearing, selectedRange.endTime, selectedRange.startTime]);

  const canConfirm = isClearing || timeValidation.ok;

  function updateStartTime(startTime: string) {
    setSelectedFreeBlockKey(null);
    if (!startTime || !availability) {
      setSelectedRange({ startTime, endTime: "" });
      return;
    }

    const [hourValue = 0, minuteValue = 0] = startTime.split(":").map(Number);
    const endMinutes = hourValue * 60 + minuteValue + availability.durationMinutes;
    const endHour = Math.floor(endMinutes / 60) % 24;
    const endMinute = endMinutes % 60;
    setSelectedRange({
      startTime,
      endTime: `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`,
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isConfirming) {
        onCancel();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isConfirming, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0f2747]/45 backdrop-blur-[1px]"
        aria-label="Cerrar confirmación de ejecutivo"
        onClick={() => {
          if (!isConfirming) {
            onCancel();
          }
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-2xl shadow-slate-900/20"
      >
        <div className="border-b border-[#c5d8eb] bg-[#d7e7f8] px-4 py-3 sm:px-5">
          <p
            id={titleId}
            className="font-heading text-base font-semibold text-[#0f2747]"
          >
            {isClearing ? "Quitar ejecutivo" : "Confirmar ejecutivo"}
          </p>
          <p className="mt-0.5 text-xs text-[#173b68]">
            Ticket {getAppointmentTicketLabel(appointment)} · Móvil{" "}
            {appointment.vehicleNumber} · {appointment.driverName}
          </p>
        </div>

        <div className="overflow-y-auto px-4 py-4 sm:px-5">
          {isClearing ? (
            <p className="text-sm leading-6 text-[#173b68]">
              ¿Desea quitar el ejecutivo asignado a esta solicitud? Se eliminará
              también el horario agendado.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm leading-6 text-[#173b68]">
                {appointment.assignedExecutive &&
                appointment.assignedExecutive !== assignedExecutive ? (
                  <>
                    Cambiar ejecutivo de{" "}
                    <strong>{appointment.assignedExecutive}</strong> a{" "}
                    <strong>{assignedExecutive}</strong>.
                  </>
                ) : (
                  <>
                    Asignar a <strong>{assignedExecutive}</strong> como ejecutivo
                    que atenderá.
                  </>
                )}
                {willSendEmail
                  ? " Al confirmar se enviará el correo con la cita."
                  : ""}
              </p>

              {availability ? (
                <>
                  <ExecutiveAvailabilityPanel
                    executiveName={assignedExecutive}
                    appointmentDateLabel={formatDisplayDate(
                      appointment.appointmentDate,
                    )}
                    availability={availability}
                    selectedRange={selectedRange}
                    selectedFreeBlockKey={selectedFreeBlockKey}
                    onSelectFreeBlock={(block, range) => {
                      setSelectedRange(range);
                      setSelectedFreeBlockKey(freeBlockKey(block));
                    }}
                    onSelectSuggestedRange={(range) => {
                      setSelectedRange(range);
                      const matchingFree = availability.free.find((block) => {
                        const suggested = suggestRangeFromFreeBlock(
                          block,
                          availability.durationMinutes,
                        );
                        return (
                          suggested &&
                          range.startTime >= block.startTime &&
                          range.endTime <= block.endTime
                        );
                      });
                      setSelectedFreeBlockKey(
                        matchingFree ? freeBlockKey(matchingFree) : null,
                      );
                    }}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#173b68]">
                        Hora de inicio
                      </span>
                      <input
                        type="time"
                        value={selectedRange.startTime}
                        onChange={(event) => updateStartTime(event.target.value)}
                        className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#173b68]">
                        Hora de término
                      </span>
                      <input
                        type="time"
                        value={selectedRange.endTime}
                        onChange={(event) => {
                          setSelectedFreeBlockKey(null);
                          setSelectedRange((current) => ({
                            ...current,
                            endTime: event.target.value,
                          }));
                        }}
                        className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                      />
                    </label>
                  </div>

                  {!timeValidation.ok ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
                      {timeValidation.message}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-600">
                  No hay fecha requerida o configuración de motivo para mostrar
                  disponibilidad.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#c5d8eb] bg-[#f8fbff] px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm font-semibold text-[#173b68] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canConfirm || isConfirming}
            onClick={() =>
              onConfirm({
                assignedExecutive,
                scheduledStartTime: isClearing
                  ? undefined
                  : selectedRange.startTime,
                scheduledEndTime: isClearing
                  ? undefined
                  : selectedRange.endTime,
              })
            }
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white transition hover:bg-[#094a8d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isConfirming ? "Guardando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
