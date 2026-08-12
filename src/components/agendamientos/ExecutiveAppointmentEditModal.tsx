"use client";

import {
  type Appointment,
  type AppointmentReasonConfig,
  type ExecutiveConfig,
  defaultAppointmentReasons,
  getAppointmentTicketLabel,
  getSantiagoToday,
  checkReasonDateRules,
} from "@/lib/appointments";
import { getExecutiveDailyLimitStatus } from "@/lib/executive-daily-limit";
import {
  buildExecutiveDayAvailability,
  getExistingSlotsForExecutiveDay,
  suggestRangeFromFreeBlock,
  validateAppointmentTimeRange,
  type FreeInterval,
  type SelectedTimeRange,
} from "@/lib/executive-day-availability";
import {
  type HolidayConfig,
  checkHolidayRestrictedDates,
  getActiveHolidayDateSet,
} from "@/lib/holidays";
import { adminFetchInit } from "@/lib/admin-fetch";
import { displayVehicleNumber } from "@/lib/driver-owners";
import { scrollNativePickerIntoView } from "@/lib/form-scroll";
import {
  FALLBACK_APPOINTMENT_DURATION_MINUTES,
  formatDisplayDate,
  getReasonAppointmentDurationMinutes,
} from "@/lib/appointment-scheduling";
import { canEditAppointmentDates } from "@/lib/appointment-date-edit";
import ExecutiveAvailabilityPanel from "@/components/agendamientos/ExecutiveAvailabilityPanel";
import { useEffect, useId, useMemo, useState } from "react";

type ExecutiveAppointmentEditModalProps = {
  appointment: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (
    appointment: Appointment,
    meta: {
      dateChange: {
        occurred: boolean;
        requiresCalendarCancel: boolean;
        requiresCalendarInvite: boolean;
        previousAppointment: Appointment;
      } | null;
      previousAppointment: Appointment;
    },
  ) => void | Promise<void>;
  executives: ExecutiveConfig[];
  appointments: Appointment[];
  reasons: AppointmentReasonConfig[];
};

function freeBlockKey(block: FreeInterval) {
  return `${block.startTime}-${block.endTime}`;
}

function addMinutesToTime(startTime: string, minutes: number) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!match) {
    return "";
  }

  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export default function ExecutiveAppointmentEditModal({
  appointment,
  isOpen,
  onClose,
  onSaved,
  executives,
  appointments,
  reasons,
}: ExecutiveAppointmentEditModalProps) {
  const titleId = useId();
  const today = useMemo(() => getSantiagoToday().date, []);
  const [holidays, setHolidays] = useState<HolidayConfig[]>([]);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [assignedExecutive, setAssignedExecutive] = useState("");
  const [scheduledStartTime, setScheduledStartTime] = useState("");
  const [scheduledEndTime, setScheduledEndTime] = useState("");
  const [vacationStartDate, setVacationStartDate] = useState("");
  const [vacationEndDate, setVacationEndDate] = useState("");
  const [permitStartDate, setPermitStartDate] = useState("");
  const [permitEndDate, setPermitEndDate] = useState("");
  const [permitDate, setPermitDate] = useState("");
  const [permitStartTime, setPermitStartTime] = useState("");
  const [permitEndTime, setPermitEndTime] = useState("");
  const [selectedFreeBlockKey, setSelectedFreeBlockKey] = useState<string | null>(
    null,
  );
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const activeReasons = useMemo(
    () =>
      (reasons.length ? reasons : defaultAppointmentReasons).filter(
        (reason) => reason.isActive,
      ),
    [reasons],
  );

  const selectedReasonConfig = useMemo(() => {
    if (!appointment) {
      return undefined;
    }

    return activeReasons.find(
      (reason) => reason.value === appointment.appointmentReason,
    );
  }, [activeReasons, appointment]);

  const holidayDateSet = useMemo(
    () => getActiveHolidayDateSet(holidays),
    [holidays],
  );

  const allowsExecutiveAssignment = Boolean(
    appointment?.reasonAllowsExecutiveAssignment,
  );
  const usesDateRange = Boolean(appointment?.reasonUsesDateRange);
  const usesPermitDetails = Boolean(appointment?.reasonUsesPermitDetails);

  const reasonDateCheck = useMemo(() => {
    if (!appointment || !selectedReasonConfig) {
      return { blocked: false, message: "" };
    }

    const dateInput = {
      usesDateRange: selectedReasonConfig.usesDateRange,
      usesPermitDetails: selectedReasonConfig.usesPermitDetails,
      allowsExecutiveAssignment: selectedReasonConfig.allowsExecutiveAssignment,
      vacationStartDate,
      vacationEndDate,
      permitType: appointment.permitType,
      permitStartDate,
      permitEndDate,
      permitDate,
      appointmentDate,
    };

    const holidayCheck = checkHolidayRestrictedDates(holidays, dateInput, today);
    if (holidayCheck.blocked) {
      return holidayCheck;
    }

    return checkReasonDateRules(
      selectedReasonConfig.restrictedWeekdays,
      selectedReasonConfig.weekdayBusinessAdvance,
      dateInput,
      today,
      holidayDateSet,
    );
  }, [
    appointment,
    appointmentDate,
    holidayDateSet,
    holidays,
    permitDate,
    permitEndDate,
    permitStartDate,
    selectedReasonConfig,
    today,
    vacationEndDate,
    vacationStartDate,
  ]);

  const executiveLimitStatus = useMemo(() => {
    if (
      !appointment ||
      !allowsExecutiveAssignment ||
      !assignedExecutive ||
      !appointmentDate
    ) {
      return { blocked: false as const };
    }

    const executive = executives.find((option) => option.name === assignedExecutive);

    return getExecutiveDailyLimitStatus(
      executive,
      appointments,
      {
        ...appointment,
        appointmentDate,
      },
      assignedExecutive,
    );
  }, [
    allowsExecutiveAssignment,
    appointment,
    appointmentDate,
    appointments,
    assignedExecutive,
    executives,
  ]);

  const executiveDayAvailability = useMemo(() => {
    if (
      !appointment ||
      !allowsExecutiveAssignment ||
      !assignedExecutive ||
      !appointmentDate ||
      !selectedReasonConfig
    ) {
      return null;
    }

    const executive = executives.find((option) => option.name === assignedExecutive);
    if (!executive) {
      return null;
    }

    return buildExecutiveDayAvailability({
      existingSlots: getExistingSlotsForExecutiveDay(
        appointments,
        assignedExecutive,
        appointmentDate,
        appointment.id,
      ),
      lunchBreak: {
        lunchBreakEnabled: executive.lunchBreakEnabled,
        lunchBreakStart: executive.lunchBreakStart,
        lunchBreakEnd: executive.lunchBreakEnd,
      },
      reason: selectedReasonConfig,
      appointmentDate,
      now: new Date(nowMs),
    });
  }, [
    allowsExecutiveAssignment,
    appointment,
    appointmentDate,
    appointments,
    assignedExecutive,
    executives,
    nowMs,
    selectedReasonConfig,
  ]);

  const selectedRange: SelectedTimeRange = {
    startTime: scheduledStartTime,
    endTime: scheduledEndTime,
  };

  const timeRangeValidation = useMemo(() => {
    if (!allowsExecutiveAssignment) {
      return { ok: true as const };
    }

    if (!scheduledStartTime && !scheduledEndTime) {
      return {
        ok: false as const,
        message:
          "Selecciona un bloque disponible o ajusta manualmente la hora de atención.",
      };
    }

    if (!executiveDayAvailability) {
      return {
        ok: false as const,
        message: "Selecciona fecha y ejecutivo para validar el horario.",
      };
    }

    return validateAppointmentTimeRange({
      startTime: scheduledStartTime,
      endTime: scheduledEndTime,
      availability: executiveDayAvailability,
    });
  }, [
    allowsExecutiveAssignment,
    executiveDayAvailability,
    scheduledEndTime,
    scheduledStartTime,
  ]);

  useEffect(() => {
    if (!isOpen || !appointment) {
      return;
    }

    setAppointmentDate(appointment.appointmentDate || "");
    setAssignedExecutive(appointment.assignedExecutive || "");
    setScheduledStartTime(appointment.scheduledStartTime || "");
    setScheduledEndTime(appointment.scheduledEndTime || "");
    setVacationStartDate(appointment.vacationStartDate || "");
    setVacationEndDate(appointment.vacationEndDate || "");
    setPermitStartDate(appointment.permitStartDate || "");
    setPermitEndDate(appointment.permitEndDate || "");
    setPermitDate(appointment.permitDate || "");
    setPermitStartTime(appointment.permitStartTime || "");
    setPermitEndTime(appointment.permitEndTime || "");
    setSelectedFreeBlockKey(null);
    setSubmitError("");
    setIsSubmitting(false);
    setNowMs(Date.now());

    fetch("/api/holidays", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { holidays?: HolidayConfig[] };
        setHolidays(data.holidays ?? []);
      })
      .catch(() => {
        setHolidays([]);
      });
  }, [appointment, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  function applySelectedRange(range: SelectedTimeRange, freeKey?: string | null) {
    setSelectedFreeBlockKey(freeKey ?? null);
    setScheduledStartTime(range.startTime);
    setScheduledEndTime(range.endTime);
    setSubmitError("");
  }

  function updateStartTime(value: string) {
    setSelectedFreeBlockKey(null);
    setScheduledStartTime(value);
    const duration = selectedReasonConfig
      ? getReasonAppointmentDurationMinutes(selectedReasonConfig)
      : FALLBACK_APPOINTMENT_DURATION_MINUTES;
    const previousExpectedEnd = scheduledStartTime
      ? addMinutesToTime(scheduledStartTime, duration)
      : "";

    if (!scheduledEndTime || scheduledEndTime === previousExpectedEnd) {
      setScheduledEndTime(value ? addMinutesToTime(value, duration) : "");
    }

    setSubmitError("");
  }

  const canSubmit = Boolean(
    appointment &&
      canEditAppointmentDates(appointment.status) &&
      !reasonDateCheck.blocked &&
      !executiveLimitStatus.blocked &&
      !isSubmitting &&
      (allowsExecutiveAssignment
        ? Boolean(appointmentDate) &&
          Boolean(assignedExecutive) &&
          Boolean(scheduledStartTime) &&
          Boolean(scheduledEndTime) &&
          timeRangeValidation.ok
        : usesDateRange
          ? Boolean(vacationStartDate) &&
            Boolean(vacationEndDate) &&
            vacationEndDate >= vacationStartDate
          : usesPermitDetails
            ? appointment.permitType === "dias"
              ? Boolean(permitStartDate) &&
                Boolean(permitEndDate) &&
                permitEndDate >= permitStartDate
              : appointment.permitType === "horas"
                ? Boolean(permitDate) &&
                  Boolean(permitStartTime) &&
                  Boolean(permitEndTime) &&
                  permitEndTime > permitStartTime
                : false
            : false),
  );

  async function handleSubmit() {
    if (!appointment || !canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const patchBody: Record<string, string> = {};

      if (allowsExecutiveAssignment) {
        patchBody.appointmentDate = appointmentDate;
        patchBody.assignedExecutive = assignedExecutive;
        patchBody.scheduledStartTime = scheduledStartTime;
        patchBody.scheduledEndTime = scheduledEndTime;
        if (assignedExecutive) {
          patchBody.status = "revisado";
        } else if (appointment.status === "revisado") {
          patchBody.status = "pendiente";
        }
      } else if (usesDateRange) {
        patchBody.vacationStartDate = vacationStartDate;
        patchBody.vacationEndDate = vacationEndDate;
      } else if (usesPermitDetails && appointment.permitType === "dias") {
        patchBody.permitStartDate = permitStartDate;
        patchBody.permitEndDate = permitEndDate;
      } else if (usesPermitDetails && appointment.permitType === "horas") {
        patchBody.permitDate = permitDate;
        patchBody.permitStartTime = permitStartTime;
        patchBody.permitEndTime = permitEndTime;
      }

      const response = await fetch(`/api/appointments/${appointment.id}`, {
        ...adminFetchInit,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patchBody),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        appointment?: Appointment;
        dateChange?: {
          occurred: boolean;
          requiresCalendarCancel: boolean;
          requiresCalendarInvite: boolean;
          previousAppointment: Appointment;
        } | null;
      };

      if (!response.ok) {
        throw new Error(result.message || "No se pudo guardar la solicitud.");
      }

      if (!result.appointment) {
        throw new Error("No se pudo guardar la solicitud.");
      }

      await onSaved(result.appointment, {
        dateChange: result.dateChange ?? null,
        previousAppointment: appointment,
      });
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "No se pudo guardar la solicitud.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen || !appointment) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0f2747]/45 backdrop-blur-[1px]"
        aria-label="Cerrar edición de solicitud"
        onClick={() => {
          if (!isSubmitting) {
            onClose();
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <p
                id={titleId}
                className="font-heading text-base font-semibold text-[#0f2747]"
              >
                Editar solicitud
              </p>
              <p className="mt-0.5 text-xs text-[#173b68]">
                Ticket {getAppointmentTicketLabel(appointment)} ·{" "}
                {appointment.createdByType === "conductor"
                  ? "Origen conductor — asigna fecha, hora y ejecutivo"
                  : "Origen ejecutivo — ajusta fecha, hora y ejecutivo"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex size-8 items-center justify-center rounded-xl border border-[#9fb8d9] bg-white text-sm font-semibold text-[#173b68] disabled:opacity-60"
            >
              ×
            </button>
          </div>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5">
          <div className="mb-4 rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Datos de la solicitud
            </p>
            <p className="mt-1 font-heading text-sm font-semibold text-[#0f2747]">
              Móvil {displayVehicleNumber(appointment.vehicleNumber)} ·{" "}
              {appointment.driverName}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {appointment.appointmentReasonLabel}
              {appointment.email ? ` · ${appointment.email}` : ""}
              {appointment.phone ? ` · ${appointment.phone}` : ""}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {allowsExecutiveAssignment ? (
              <>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha requerida para la cita
                  </span>
                  <input
                    type="date"
                    value={appointmentDate}
                    min={today}
                    onChange={(event) => {
                      setAppointmentDate(event.target.value);
                      setScheduledStartTime("");
                      setScheduledEndTime("");
                      setSelectedFreeBlockKey(null);
                      setSubmitError("");
                    }}
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Ejecutivo que atenderá
                  </span>
                  <select
                    value={assignedExecutive}
                    onChange={(event) => {
                      setAssignedExecutive(event.target.value);
                      setScheduledStartTime("");
                      setScheduledEndTime("");
                      setSelectedFreeBlockKey(null);
                      setSubmitError("");
                    }}
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  >
                    <option value="">Selecciona un ejecutivo</option>
                    {executives.map((executive) => (
                      <option key={executive.name} value={executive.name}>
                        {executive.name}
                      </option>
                    ))}
                  </select>
                </label>

                {executiveLimitStatus.blocked ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 sm:col-span-2">
                    {executiveLimitStatus.executiveName} ya llegó al tope de{" "}
                    {executiveLimitStatus.max} solicitudes para el{" "}
                    {executiveLimitStatus.appointmentDate}. Elige otro ejecutivo o
                    otra fecha.
                  </div>
                ) : null}

                {executiveDayAvailability ? (
                  <>
                    <ExecutiveAvailabilityPanel
                      executiveName={assignedExecutive}
                      appointmentDateLabel={formatDisplayDate(appointmentDate)}
                      availability={executiveDayAvailability}
                      selectedRange={selectedRange}
                      selectedFreeBlockKey={selectedFreeBlockKey}
                      onSelectFreeBlock={(block, range) =>
                        applySelectedRange(range, freeBlockKey(block))
                      }
                      onSelectSuggestedRange={(range) => {
                        const matchingFree = executiveDayAvailability.free.find(
                          (block) =>
                            suggestRangeFromFreeBlock(
                              block,
                              executiveDayAvailability.durationMinutes,
                            ) &&
                            range.startTime >= block.startTime &&
                            range.endTime <= block.endTime,
                        );
                        applySelectedRange(
                          range,
                          matchingFree ? freeBlockKey(matchingFree) : null,
                        );
                      }}
                    />

                    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-[#173b68]">
                          Hora de inicio
                        </span>
                        <input
                          type="time"
                          value={scheduledStartTime}
                          onChange={(event) =>
                            updateStartTime(event.target.value)
                          }
                          className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-[#173b68]">
                          Hora de término
                        </span>
                        <input
                          type="time"
                          value={scheduledEndTime}
                          onChange={(event) => {
                            setSelectedFreeBlockKey(null);
                            setScheduledEndTime(event.target.value);
                            setSubmitError("");
                          }}
                          className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                        />
                      </label>
                    </div>

                    {!timeRangeValidation.ok &&
                    (scheduledStartTime || scheduledEndTime) ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 sm:col-span-2">
                        {timeRangeValidation.message}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    Selecciona fecha y ejecutivo para ver la disponibilidad del día.
                  </p>
                )}
              </>
            ) : null}

            {usesDateRange ? (
              <>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha desde
                  </span>
                  <input
                    type="date"
                    value={vacationStartDate}
                    min={today}
                    onChange={(event) => {
                      setVacationStartDate(event.target.value);
                      setSubmitError("");
                    }}
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha hasta
                  </span>
                  <input
                    type="date"
                    value={vacationEndDate}
                    min={vacationStartDate || today}
                    onChange={(event) => {
                      setVacationEndDate(event.target.value);
                      setSubmitError("");
                    }}
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
                  />
                </label>
              </>
            ) : null}

            {usesPermitDetails && appointment.permitType === "dias" ? (
              <>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha desde
                  </span>
                  <input
                    type="date"
                    value={permitStartDate}
                    min={today}
                    onChange={(event) => {
                      setPermitStartDate(event.target.value);
                      setSubmitError("");
                    }}
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha hasta
                  </span>
                  <input
                    type="date"
                    value={permitEndDate}
                    min={permitStartDate || today}
                    onChange={(event) => {
                      setPermitEndDate(event.target.value);
                      setSubmitError("");
                    }}
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
                  />
                </label>
              </>
            ) : null}

            {usesPermitDetails && appointment.permitType === "horas" ? (
              <>
                <label className="flex flex-col gap-2 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha del permiso
                  </span>
                  <input
                    type="date"
                    value={permitDate}
                    min={today}
                    onFocus={scrollNativePickerIntoView}
                    onChange={(event) => {
                      setPermitDate(event.target.value);
                      setSubmitError("");
                    }}
                    className="h-11 w-full min-w-0 scroll-mt-24 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] sm:px-4"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Hora desde
                  </span>
                  <input
                    type="time"
                    value={permitStartTime}
                    onFocus={scrollNativePickerIntoView}
                    onChange={(event) => {
                      setPermitStartTime(event.target.value);
                      setSubmitError("");
                    }}
                    className="h-11 w-full min-w-0 scroll-mt-28 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] sm:px-4"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Hora hasta
                  </span>
                  <input
                    type="time"
                    value={permitEndTime}
                    onFocus={scrollNativePickerIntoView}
                    onChange={(event) => {
                      setPermitEndTime(event.target.value);
                      setSubmitError("");
                    }}
                    className="h-11 w-full min-w-0 scroll-mt-28 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] sm:px-4"
                  />
                </label>
              </>
            ) : null}

            {reasonDateCheck.blocked ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 sm:col-span-2">
                {reasonDateCheck.message}
              </div>
            ) : null}

            {submitError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 sm:col-span-2">
                {submitError}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#c5d8eb] bg-[#f8fbff] px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm font-semibold text-[#173b68] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white transition hover:bg-[#094a8d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
