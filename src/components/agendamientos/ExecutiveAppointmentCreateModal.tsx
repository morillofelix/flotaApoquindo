"use client";

import {
  type Appointment,
  type AppointmentReasonConfig,
  type ExecutiveConfig,
  appointmentReasonAllowsExecutive,
  appointmentReasonAllowsManualStartTime,
  appointmentReasonUsesDateRange,
  appointmentReasonUsesPermitDetails,
  defaultAppointmentReasons,
  getSantiagoToday,
  checkReasonDateRules,
} from "@/lib/appointments";
import { getExecutiveDailyLimitStatus } from "@/lib/executive-daily-limit";
import {
  type HolidayConfig,
  checkHolidayRestrictedDates,
  getActiveHolidayDateSet,
} from "@/lib/holidays";
import { adminFetchInit } from "@/lib/admin-fetch";
import { displayVehicleNumber } from "@/lib/driver-owners";
import { useEffect, useId, useMemo, useState } from "react";

type VehicleLookupResult = {
  vehicleNumber: string;
  fullName: string;
  email: string;
  phone: string;
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
  assignedExecutive: string;
  vacationStartDate: string;
  vacationEndDate: string;
  permitType: string;
  permitStartDate: string;
  permitEndDate: string;
  permitDate: string;
  permitStartTime: string;
  permitEndTime: string;
};

const initialValues: FormValues = {
  vehicleNumber: "",
  appointmentReason: "",
  appointmentDate: "",
  scheduledStartTime: "",
  assignedExecutive: "",
  vacationStartDate: "",
  vacationEndDate: "",
  permitType: "",
  permitStartDate: "",
  permitEndDate: "",
  permitDate: "",
  permitStartTime: "",
  permitEndTime: "",
};

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
  const allowsExecutiveAssignment = appointmentReasonAllowsExecutive(
    values.appointmentReason,
    reasons,
  );
  const allowsManualStartTime = appointmentReasonAllowsManualStartTime(
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
      allowsExecutiveAssignment:
        selectedReasonConfig.allowsExecutiveAssignment,
      vacationStartDate: values.vacationStartDate,
      vacationEndDate: values.vacationEndDate,
      permitType: values.permitType,
      permitStartDate: values.permitStartDate,
      permitEndDate: values.permitEndDate,
      permitDate: values.permitDate,
      appointmentDate: values.appointmentDate,
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValues(initialValues);
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

          setSelectedDriver(data.result);
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

  function updateField<K extends keyof FormValues>(name: K, value: FormValues[K]) {
    setValues((currentValues) => ({
      ...currentValues,
      [name]: value,
      ...(name === "appointmentReason" &&
      !appointmentReasonUsesDateRange(value, reasons)
        ? { vacationStartDate: "", vacationEndDate: "" }
        : {}),
      ...(name === "appointmentReason" &&
      !appointmentReasonUsesPermitDetails(value, reasons)
        ? {
            permitType: "",
            permitStartDate: "",
            permitEndDate: "",
            permitDate: "",
            permitStartTime: "",
            permitEndTime: "",
          }
        : {}),
      ...(name === "appointmentReason" &&
      !appointmentReasonAllowsExecutive(value, reasons)
        ? {
            appointmentDate: "",
            scheduledStartTime: "",
            assignedExecutive: "",
          }
        : {}),
      ...(name === "appointmentReason" &&
      appointmentReasonAllowsExecutive(value, reasons) &&
      !appointmentReasonAllowsManualStartTime(value, reasons)
        ? { scheduledStartTime: "" }
        : {}),
      ...(name === "permitType" && value === "dias"
        ? { permitDate: "", permitStartTime: "", permitEndTime: "" }
        : {}),
      ...(name === "permitType" && value === "horas"
        ? { permitStartDate: "", permitEndDate: "" }
        : {}),
    }));
    setSubmitError("");
  }

  const canSubmit =
    Boolean(selectedDriver) &&
    Boolean(values.appointmentReason) &&
    !reasonDateCheck.blocked &&
    !executiveLimitStatus.blocked &&
    (!allowsExecutiveAssignment ||
      (Boolean(values.appointmentDate) &&
        Boolean(values.assignedExecutive) &&
        (!allowsManualStartTime || Boolean(values.scheduledStartTime)))) &&
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

        <div className="overflow-y-auto px-4 py-4 sm:px-5">
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
                  </option>
                ))}
              </select>
            </label>

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
                    onChange={(event) =>
                      updateField("appointmentDate", event.target.value)
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                {allowsManualStartTime ? (
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-[#173b68]">
                      Hora de atención
                    </span>
                    <input
                      type="time"
                      value={values.scheduledStartTime}
                      onChange={(event) =>
                        updateField("scheduledStartTime", event.target.value)
                      }
                      className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                    />
                  </label>
                ) : null}

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
              </div>
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
                        onChange={(event) =>
                          updateField("permitStartDate", event.target.value)
                        }
                        className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
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
                        onChange={(event) =>
                          updateField("permitEndDate", event.target.value)
                        }
                        className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
                      />
                    </label>
                  </div>
                ) : null}

                {values.permitType === "horas" ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#173b68]">
                        Fecha del permiso
                      </span>
                      <input
                        type="date"
                        value={values.permitDate}
                        min={today}
                        onChange={(event) =>
                          updateField("permitDate", event.target.value)
                        }
                        className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#173b68]">
                        Hora desde
                      </span>
                      <input
                        type="time"
                        value={values.permitStartTime}
                        onChange={(event) =>
                          updateField("permitStartTime", event.target.value)
                        }
                        className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#173b68]">
                        Hora hasta
                      </span>
                      <input
                        type="time"
                        value={values.permitEndTime}
                        onChange={(event) =>
                          updateField("permitEndTime", event.target.value)
                        }
                        className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-4 text-sm text-[#0f2747]"
                      />
                    </label>
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
