"use client";

import {
  type Appointment,
  type AppointmentReasonConfig,
  type ExecutiveConfig,
  appointmentReasonAllowsExecutive,
  appointmentReasonUsesDateRange,
  appointmentReasonUsesPermitDetails,
  appointmentReasonUsesDaySwap,
  appointmentReasonRequiresObservation,
  APPOINTMENT_OBSERVATION_MAX_LENGTH,
  validateAppointmentObservation,
  defaultAppointmentReasons,
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
import ExecutiveAvailabilityPanel from "@/components/agendamientos/ExecutiveAvailabilityPanel";
import TimeSelectField from "@/components/TimeSelectField";
import { useEffect, useId, useMemo, useState } from "react";

type VehicleLookupResult = {
  vehicleNumber: string;
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  ownerName: string;
  ownerEmail: string;
};

type ExecutiveAppointmentCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (
    appointment: Appointment,
    meta: { emailsSent: boolean; emailsQueued?: boolean; emailWarning: string },
  ) => void | Promise<void>;
  executives: ExecutiveConfig[];
  appointments: Appointment[];
};

type FormValues = {
  vehicleNumber: string;
  appointmentReason: string;
  appointmentDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  assignedExecutive: string;
  vacationStartDate: string;
  vacationEndDate: string;
  permitType: string;
  permitStartDate: string;
  permitEndDate: string;
  permitDate: string;
  permitStartTime: string;
  permitEndTime: string;
  swapFromDate: string;
  swapToDate: string;
  observation: string;
  ccOwnerEmail: boolean;
};

const initialValues: FormValues = {
  vehicleNumber: "",
  appointmentReason: "",
  appointmentDate: "",
  scheduledStartTime: "",
  scheduledEndTime: "",
  assignedExecutive: "",
  vacationStartDate: "",
  vacationEndDate: "",
  permitType: "",
  permitStartDate: "",
  permitEndDate: "",
  permitDate: "",
  permitStartTime: "",
  permitEndTime: "",
  swapFromDate: "",
  swapToDate: "",
  observation: "",
  ccOwnerEmail: false,
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

export default function ExecutiveAppointmentCreateModal({
  isOpen,
  onClose,
  onCreated,
  executives,
  appointments,
}: ExecutiveAppointmentCreateModalProps) {
  const titleId = useId();
  const today = useMemo(() => getSantiagoToday().date, []);
  const [creatorName, setCreatorName] = useState("");
  const [reasons, setReasons] = useState<AppointmentReasonConfig[]>(
    defaultAppointmentReasons,
  );
  const [holidays, setHolidays] = useState<HolidayConfig[]>([]);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [selectedFreeBlockKey, setSelectedFreeBlockKey] = useState<string | null>(
    null,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedDriver, setSelectedDriver] = useState<VehicleLookupResult | null>(
    null,
  );
  const [lookupError, setLookupError] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  const activeReasons = useMemo(
    () => reasons.filter((reason) => reason.isActive),
    [reasons],
  );
  const usesDateRange = appointmentReasonUsesDateRange(
    values.appointmentReason,
    reasons,
  );
  const usesPermitDetails = appointmentReasonUsesPermitDetails(
    values.appointmentReason,
    reasons,
  );
  const usesDaySwap = appointmentReasonUsesDaySwap(
    values.appointmentReason,
    reasons,
  );
  const requiresObservation = appointmentReasonRequiresObservation(
    values.appointmentReason,
    reasons,
  );
  const allowsExecutiveAssignment = appointmentReasonAllowsExecutive(
    values.appointmentReason,
    reasons,
  );
  const selectedReasonConfig = useMemo(
    () =>
      activeReasons.find((reason) => reason.value === values.appointmentReason),
    [activeReasons, values.appointmentReason],
  );
  const holidayDateSet = useMemo(
    () => getActiveHolidayDateSet(holidays),
    [holidays],
  );
  const reasonDateCheck = useMemo(() => {
    if (!selectedReasonConfig) {
      return { blocked: false, message: "" };
    }

    const dateInput = {
      usesDateRange: selectedReasonConfig.usesDateRange,
      usesPermitDetails: selectedReasonConfig.usesPermitDetails,
      usesDaySwap: selectedReasonConfig.usesDaySwap,
      allowsExecutiveAssignment:
        selectedReasonConfig.allowsExecutiveAssignment,
      vacationStartDate: values.vacationStartDate,
      vacationEndDate: values.vacationEndDate,
      permitType: values.permitType,
      permitStartDate: values.permitStartDate,
      permitEndDate: values.permitEndDate,
      permitDate: values.permitDate,
      appointmentDate: values.appointmentDate,
      swapFromDate: values.swapFromDate,
      swapToDate: values.swapToDate,
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
  }, [selectedReasonConfig, values, holidays, holidayDateSet, today]);

  const executiveLimitStatus = useMemo(() => {
    if (!allowsExecutiveAssignment || !values.assignedExecutive || !values.appointmentDate) {
      return { blocked: false as const };
    }

    const executive = executives.find(
      (option) => option.name === values.assignedExecutive,
    );

    return getExecutiveDailyLimitStatus(
      executive,
      appointments,
      {
        id: "draft",
        appointmentDate: values.appointmentDate,
      } as Appointment,
      values.assignedExecutive,
    );
  }, [
    allowsExecutiveAssignment,
    appointments,
    executives,
    values.appointmentDate,
    values.assignedExecutive,
  ]);

  const executiveDayAvailability = useMemo(() => {
    if (
      !allowsExecutiveAssignment ||
      !values.assignedExecutive ||
      !values.appointmentDate ||
      !selectedReasonConfig
    ) {
      return null;
    }

    const executive = executives.find(
      (option) => option.name === values.assignedExecutive,
    );

    if (!executive) {
      return null;
    }

    return buildExecutiveDayAvailability({
      existingSlots: getExistingSlotsForExecutiveDay(
        appointments,
        values.assignedExecutive,
        values.appointmentDate,
      ),
      lunchBreak: {
        lunchBreakEnabled: executive.lunchBreakEnabled,
        lunchBreakStart: executive.lunchBreakStart,
        lunchBreakEnd: executive.lunchBreakEnd,
      },
      reason: selectedReasonConfig,
      appointmentDate: values.appointmentDate,
      now: new Date(nowMs),
    });
  }, [
    allowsExecutiveAssignment,
    appointments,
    executives,
    nowMs,
    selectedReasonConfig,
    values.appointmentDate,
    values.assignedExecutive,
  ]);

  const selectedRange: SelectedTimeRange = {
    startTime: values.scheduledStartTime,
    endTime: values.scheduledEndTime,
  };

  const timeRangeValidation = useMemo(() => {
    if (!allowsExecutiveAssignment) {
      return { ok: true as const };
    }

    if (!values.scheduledStartTime && !values.scheduledEndTime) {
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
      startTime: values.scheduledStartTime,
      endTime: values.scheduledEndTime,
      availability: executiveDayAvailability,
    });
  }, [
    allowsExecutiveAssignment,
    executiveDayAvailability,
    values.scheduledEndTime,
    values.scheduledStartTime,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValues(initialValues);
    setSelectedFreeBlockKey(null);
    setSelectedDriver(null);
    setLookupError("");
    setSubmitError("");
    setIsSubmitting(false);
    setIsLoadingContext(true);

    Promise.all([
      fetch("/api/appointments/executive", { ...adminFetchInit, cache: "no-store" }),
      fetch("/api/appointment-reasons", { cache: "no-store" }),
      fetch("/api/holidays", { cache: "no-store" }),
    ])
      .then(async ([contextResponse, reasonsResponse, holidaysResponse]) => {
        if (contextResponse.ok) {
          const context = (await contextResponse.json()) as {
            creatorName?: string;
          };
          setCreatorName(context.creatorName ?? "Ejecutivo");
        }

        if (reasonsResponse.ok) {
          const data = (await reasonsResponse.json()) as {
            reasons?: AppointmentReasonConfig[];
          };
          if (data.reasons?.length) {
            setReasons(data.reasons);
          }
        }

        if (holidaysResponse.ok) {
          const data = (await holidaysResponse.json()) as {
            holidays?: HolidayConfig[];
          };
          setHolidays(data.holidays ?? []);
        }
      })
      .finally(() => {
        setIsLoadingContext(false);
      });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setNowMs(Date.now());
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
      if (event.key === "Escape") {
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
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const digits = values.vehicleNumber.replace(/\D/g, "");

    if (digits.length < 1) {
      setSelectedDriver(null);
      setLookupError("");
      setValues((currentValues) =>
        currentValues.ccOwnerEmail
          ? { ...currentValues, ccOwnerEmail: false }
          : currentValues,
      );
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsLookingUp(true);
      setLookupError("");

      fetch(`/api/appointments/vehicle-lookup?q=${encodeURIComponent(digits)}`, {
        ...adminFetchInit,
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("lookup-failed");
          }

          const data = (await response.json()) as {
            result?: VehicleLookupResult | null;
          };

          if (!data.result) {
            setSelectedDriver(null);
            setLookupError("Móvil no registrado o no activo.");
            return;
          }

          const nextDriver: VehicleLookupResult = {
            vehicleNumber: data.result.vehicleNumber,
            fullName: data.result.fullName,
            email: data.result.email,
            phone: data.result.phone,
            companyName: data.result.companyName ?? "",
            ownerName: data.result.ownerName ?? "",
            ownerEmail: data.result.ownerEmail ?? "",
          };

          setSelectedDriver(nextDriver);
          if (!nextDriver.ownerEmail) {
            setValues((currentValues) => ({
              ...currentValues,
              ccOwnerEmail: false,
            }));
          }
          setLookupError("");
        })
        .catch(() => {
          setSelectedDriver(null);
          setLookupError("No se pudo validar el móvil.");
        })
        .finally(() => {
          setIsLookingUp(false);
        });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, values.vehicleNumber]);

  function clearScheduledTime() {
    setSelectedFreeBlockKey(null);
    setValues((currentValues) => ({
      ...currentValues,
      scheduledStartTime: "",
      scheduledEndTime: "",
    }));
  }

  function applySelectedRange(range: SelectedTimeRange, freeKey?: string | null) {
    setSelectedFreeBlockKey(freeKey ?? null);
    setValues((currentValues) => ({
      ...currentValues,
      scheduledStartTime: range.startTime,
      scheduledEndTime: range.endTime,
    }));
    setSubmitError("");
  }

  function updateField<K extends keyof FormValues>(name: K, value: FormValues[K]) {
    setValues((currentValues) => {
      const nextValues: FormValues = {
        ...currentValues,
        [name]: value,
      };

      if (name === "appointmentReason" && typeof value === "string") {
        if (!appointmentReasonUsesDateRange(value, reasons)) {
          nextValues.vacationStartDate = "";
          nextValues.vacationEndDate = "";
        }

        if (!appointmentReasonUsesPermitDetails(value, reasons)) {
          nextValues.permitType = "";
          nextValues.permitStartDate = "";
          nextValues.permitEndDate = "";
          nextValues.permitDate = "";
          nextValues.permitStartTime = "";
          nextValues.permitEndTime = "";
        }

        if (!appointmentReasonUsesDaySwap(value, reasons)) {
          nextValues.swapFromDate = "";
          nextValues.swapToDate = "";
        }

        if (!appointmentReasonRequiresObservation(value, reasons)) {
          nextValues.observation = "";
        }

        if (!appointmentReasonAllowsExecutive(value, reasons)) {
          nextValues.appointmentDate = "";
          nextValues.assignedExecutive = "";
          nextValues.scheduledStartTime = "";
          nextValues.scheduledEndTime = "";
        } else {
          nextValues.scheduledStartTime = "";
          nextValues.scheduledEndTime = "";
        }
      }

      if (name === "appointmentDate" || name === "assignedExecutive") {
        nextValues.scheduledStartTime = "";
        nextValues.scheduledEndTime = "";
      }

      if (name === "permitType" && value === "dias") {
        nextValues.permitDate = "";
        nextValues.permitStartTime = "";
        nextValues.permitEndTime = "";
      }

      if (name === "permitType" && value === "horas") {
        nextValues.permitStartDate = "";
        nextValues.permitEndDate = "";
      }

      if (name === "scheduledStartTime" && typeof value === "string") {
        const duration = selectedReasonConfig
          ? getReasonAppointmentDurationMinutes(selectedReasonConfig)
          : FALLBACK_APPOINTMENT_DURATION_MINUTES;
        const previousExpectedEnd = currentValues.scheduledStartTime
          ? addMinutesToTime(currentValues.scheduledStartTime, duration)
          : "";

        if (
          !currentValues.scheduledEndTime ||
          currentValues.scheduledEndTime === previousExpectedEnd
        ) {
          nextValues.scheduledEndTime = value
            ? addMinutesToTime(value, duration)
            : "";
        }
      }

      return nextValues;
    });

    if (
      name === "appointmentReason" ||
      name === "appointmentDate" ||
      name === "assignedExecutive"
    ) {
      setSelectedFreeBlockKey(null);
    } else if (name === "scheduledStartTime" || name === "scheduledEndTime") {
      setSelectedFreeBlockKey(null);
    }

    setSubmitError("");
  }

  const canSubmit =
    Boolean(selectedDriver) &&
    Boolean(values.appointmentReason) &&
    !reasonDateCheck.blocked &&
    !executiveLimitStatus.blocked &&
    timeRangeValidation.ok &&
    (!allowsExecutiveAssignment ||
      (Boolean(values.appointmentDate) &&
        Boolean(values.assignedExecutive) &&
        Boolean(values.scheduledStartTime) &&
        Boolean(values.scheduledEndTime))) &&
    (!usesDateRange ||
      (Boolean(values.vacationStartDate) &&
        Boolean(values.vacationEndDate) &&
        values.vacationEndDate >= values.vacationStartDate)) &&
    (!usesDaySwap ||
      (Boolean(values.swapFromDate) &&
        Boolean(values.swapToDate) &&
        values.swapFromDate !== values.swapToDate)) &&
    (!requiresObservation ||
      validateAppointmentObservation(values.observation, true).ok) &&
    !isSubmitting &&
    !isLoadingContext;

  async function handleSubmit() {
    if (!selectedDriver || !canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch("/api/appointments/executive", {
        ...adminFetchInit,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        appointment?: Appointment;
        emailsSent?: boolean;
        emailsQueued?: boolean;
        emailWarning?: string;
      };

      if (!response.ok) {
        throw new Error(result.message || "No se pudo registrar la solicitud.");
      }

      if (!result.appointment) {
        throw new Error("No se pudo registrar la solicitud.");
      }

      await onCreated(result.appointment, {
        emailsSent: result.emailsSent === true,
        emailsQueued: result.emailsQueued === true,
        emailWarning: result.emailWarning ?? "",
      });
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "No se pudo registrar la solicitud.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0f2747]/45 backdrop-blur-[1px]"
        aria-label="Cerrar creación de solicitud"
        onClick={onClose}
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
                Crear solicitud
              </p>
              <p className="mt-0.5 text-xs text-[#173b68]">
                Registro realizado por ejecutivo hacia un móvil.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-8 items-center justify-center rounded-xl border border-[#9fb8d9] bg-white text-sm font-semibold text-[#173b68]"
            >
              ×
            </button>
          </div>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5">
          <div className="mb-4 rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Ejecutivo que crea
            </p>
            <p className="mt-1 font-heading text-sm font-semibold text-[#0f2747]">
              {isLoadingContext ? "Cargando..." : creatorName || "Ejecutivo"}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-xs font-semibold text-[#173b68]">
                Número de móvil
              </span>
              <input
                type="search"
                inputMode="numeric"
                value={values.vehicleNumber}
                onChange={(event) =>
                  updateField("vehicleNumber", event.target.value)
                }
                placeholder="Ej: 999"
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              />
              {isLookingUp ? (
                <span className="text-xs text-slate-500">Validando móvil...</span>
              ) : null}
              {lookupError ? (
                <span className="text-xs font-medium text-red-600">{lookupError}</span>
              ) : null}
            </label>

            {selectedDriver ? (
              <div className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-4 py-3 sm:col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Conductor confirmado
                </p>
                <p className="mt-1 font-heading text-sm font-semibold text-[#0f2747]">
                  Móvil {displayVehicleNumber(selectedDriver.vehicleNumber)} ·{" "}
                  {selectedDriver.fullName}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {selectedDriver.email} · {selectedDriver.phone}
                </p>
                {selectedDriver.companyName || selectedDriver.ownerName ? (
                  <div className="mt-2 space-y-2 border-t border-[#c5d8eb] pt-2">
                    {selectedDriver.companyName ? (
                      <p className="text-xs font-medium text-[#0f2747]">
                        Empresa:{" "}
                        <span className="text-[#0b5cab]">
                          {selectedDriver.companyName}
                        </span>
                      </p>
                    ) : null}
                    {selectedDriver.ownerName ? (
                      <p className="text-xs font-medium text-[#0f2747]">
                        Propietario:{" "}
                        <span className="text-[#0b5cab]">
                          {selectedDriver.ownerName}
                        </span>
                      </p>
                    ) : null}
                    <label className="flex items-start gap-2.5 rounded-xl border border-[#c5d8eb] bg-white px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={values.ccOwnerEmail}
                        disabled={!selectedDriver.ownerEmail}
                        onChange={(event) =>
                          updateField("ccOwnerEmail", event.target.checked)
                        }
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0b5cab] disabled:opacity-50"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-[#173b68]">
                          Enviar correo en copia al propietario
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-5 text-slate-500">
                          {selectedDriver.ownerEmail
                            ? `Copia del correo de confirmación a ${selectedDriver.ownerEmail}${
                                selectedDriver.companyName
                                  ? ` (${selectedDriver.companyName})`
                                  : ""
                              }.`
                            : "Este móvil no tiene correo de propietario registrado."}
                        </span>
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2 border-t border-[#c5d8eb] pt-2">
                    <p className="text-[11px] text-slate-500">
                      Sin propietario asociado a este móvil en el mantenedor.
                    </p>
                    <label className="flex items-start gap-2.5 rounded-xl border border-[#c5d8eb] bg-white px-3 py-2.5 opacity-70">
                      <input
                        type="checkbox"
                        checked={false}
                        disabled
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0b5cab] disabled:opacity-50"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-[#173b68]">
                          Enviar correo en copia al propietario
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-5 text-slate-500">
                          Este móvil no tiene correo de propietario registrado.
                        </span>
                      </span>
                    </label>
                  </div>
                )}
              </div>
            ) : null}

            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-xs font-semibold text-[#173b68]">
                Motivo de la cita
              </span>
              <select
                value={values.appointmentReason}
                onChange={(event) =>
                  updateField("appointmentReason", event.target.value)
                }
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              >
                <option value="">Selecciona una opción</option>
                {activeReasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                    {reason.visibleToDriver === false ? " (solo ejecutivo)" : ""}
                  </option>
                ))}
              </select>
            </label>

            {requiresObservation ? (
              <label className="flex flex-col gap-1.5 rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 sm:col-span-2">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    ¿Por qué se solicita?
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                    Obligatorio
                  </span>
                </span>
                <textarea
                  required
                  rows={3}
                  maxLength={APPOINTMENT_OBSERVATION_MAX_LENGTH}
                  value={values.observation}
                  onChange={(event) =>
                    updateField("observation", event.target.value)
                  }
                  placeholder="Escribe brevemente el motivo de esta solicitud"
                  className="min-h-[4.75rem] resize-none rounded-xl border border-[#9fb8d9] bg-white px-3 py-2.5 text-sm leading-5 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                />
                <span className="text-right text-[11px] text-slate-500">
                  {values.observation.trim().length}/
                  {APPOINTMENT_OBSERVATION_MAX_LENGTH}
                </span>
              </label>
            ) : null}

            {allowsExecutiveAssignment ? (
              <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha requerida para la cita
                  </span>
                  <input
                    type="date"
                    value={values.appointmentDate}
                    min={today}
                    onFocus={scrollNativePickerIntoView}
                    onChange={(event) =>
                      updateField("appointmentDate", event.target.value)
                    }
                    className="h-10 w-full min-w-0 scroll-mt-24 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Ejecutivo que atenderá
                  </span>
                  <select
                    value={values.assignedExecutive}
                    onChange={(event) =>
                      updateField("assignedExecutive", event.target.value)
                    }
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
                      executiveName={values.assignedExecutive}
                      appointmentDateLabel={formatDisplayDate(values.appointmentDate)}
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
                      <label className="flex min-w-0 flex-col gap-2">
                        <span className="text-xs font-semibold text-[#173b68]">
                          Hora de inicio
                        </span>
                        <input
                          type="time"
                          value={values.scheduledStartTime}
                          onFocus={scrollNativePickerIntoView}
                          onChange={(event) =>
                            updateField("scheduledStartTime", event.target.value)
                          }
                          className="h-11 w-full min-w-0 scroll-mt-28 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 sm:px-4"
                        />
                      </label>
                      <label className="flex min-w-0 flex-col gap-2">
                        <span className="text-xs font-semibold text-[#173b68]">
                          Hora de término
                        </span>
                        <input
                          type="time"
                          value={values.scheduledEndTime}
                          onFocus={scrollNativePickerIntoView}
                          onChange={(event) =>
                            updateField("scheduledEndTime", event.target.value)
                          }
                          className="h-11 w-full min-w-0 scroll-mt-28 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 sm:px-4"
                        />
                      </label>
                    </div>

                    {!timeRangeValidation.ok &&
                    (values.scheduledStartTime || values.scheduledEndTime) ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 sm:col-span-2">
                        {timeRangeValidation.message}
                      </div>
                    ) : null}

                    {values.scheduledStartTime || values.scheduledEndTime ? (
                      <button
                        type="button"
                        onClick={clearScheduledTime}
                        className="justify-self-start text-xs font-semibold text-[#0b5cab] underline-offset-2 hover:underline sm:col-span-2"
                      >
                        Limpiar horario seleccionado
                      </button>
                    ) : null}
                  </>
                ) : values.assignedExecutive || values.appointmentDate ? (
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    Selecciona fecha y ejecutivo para ver la disponibilidad del día.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    Tras elegir motivo, fecha y ejecutivo se mostrará la
                    disponibilidad del día.
                  </p>
                )}
              </div>
            ) : null}

            {usesDaySwap ? (
              <>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Día que desea cambiar
                  </span>
                  <input
                    type="date"
                    value={values.swapFromDate}
                    min={today}
                    onChange={(event) =>
                      updateField("swapFromDate", event.target.value)
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Cambiar por este día
                  </span>
                  <input
                    type="date"
                    value={values.swapToDate}
                    min={today}
                    onChange={(event) =>
                      updateField("swapToDate", event.target.value)
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
                  />
                </label>
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
                    value={values.vacationStartDate}
                    min={today}
                    onChange={(event) =>
                      updateField("vacationStartDate", event.target.value)
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Fecha hasta
                  </span>
                  <input
                    type="date"
                    value={values.vacationEndDate}
                    min={values.vacationStartDate || today}
                    onChange={(event) =>
                      updateField("vacationEndDate", event.target.value)
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>
              </>
            ) : null}

            {usesPermitDetails ? (
              <div className="grid gap-3 sm:col-span-2">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Tipo de permiso
                  </span>
                  <select
                    value={values.permitType}
                    onChange={(event) =>
                      updateField("permitType", event.target.value)
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  >
                    <option value="">Selecciona una opción</option>
                    <option value="dias">Por día</option>
                    <option value="horas">Por horas</option>
                  </select>
                </label>

                {values.permitType === "dias" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#173b68]">
                        Fecha desde
                      </span>
                      <input
                        type="date"
                        value={values.permitStartDate}
                        min={today}
                        onFocus={scrollNativePickerIntoView}
                        onChange={(event) =>
                          updateField("permitStartDate", event.target.value)
                        }
                        className="h-11 w-full min-w-0 scroll-mt-24 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] sm:px-4"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#173b68]">
                        Fecha hasta
                      </span>
                      <input
                        type="date"
                        value={values.permitEndDate}
                        min={values.permitStartDate || today}
                        onFocus={scrollNativePickerIntoView}
                        onChange={(event) =>
                          updateField("permitEndDate", event.target.value)
                        }
                        className="h-11 w-full min-w-0 scroll-mt-24 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] sm:px-4"
                      />
                    </label>
                  </div>
                ) : null}

                {values.permitType === "horas" ? (
                  <div className="grid gap-3">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#173b68]">
                        Fecha del permiso
                      </span>
                      <input
                        type="date"
                        value={values.permitDate}
                        min={today}
                        onFocus={scrollNativePickerIntoView}
                        onChange={(event) =>
                          updateField("permitDate", event.target.value)
                        }
                        className="h-11 w-full min-w-0 scroll-mt-24 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] sm:px-4"
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="flex min-w-0 flex-col gap-2">
                        <span className="text-xs font-semibold text-[#173b68]">
                          Hora desde
                        </span>
                        <TimeSelectField
                          value={values.permitStartTime}
                          onChange={(nextValue) =>
                            updateField("permitStartTime", nextValue)
                          }
                        />
                      </label>
                      <label className="flex min-w-0 flex-col gap-2">
                        <span className="text-xs font-semibold text-[#173b68]">
                          Hora hasta
                        </span>
                        <TimeSelectField
                          value={values.permitEndTime}
                          onChange={(nextValue) =>
                            updateField("permitEndTime", nextValue)
                          }
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
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
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm font-semibold text-[#173b68]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white transition hover:bg-[#094a8d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Guardando..." : "Crear solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}
