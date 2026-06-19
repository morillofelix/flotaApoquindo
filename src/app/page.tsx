"use client";

import {
  type Appointment,
  type AppointmentReasonConfig,
  appointmentReasonUsesPermitDetails,
  appointmentReasonUsesDateRange,
  defaultAppointmentReasons,
  getAppointmentTicketLabel,
  getSantiagoToday,
  isReasonRestrictedToday,
  RESTRICTED_DAY_MESSAGE,
  type PermissionReason,
} from "@/lib/appointments";
import { type FormEvent, useEffect, useMemo, useState } from "react";

type FormValues = {
  driverName: string;
  vehicleNumber: string;
  appointmentReason: string;
  vacationStartDate: string;
  vacationEndDate: string;
  permitType: string;
  permitStartDate: string;
  permitEndDate: string;
  permitDate: string;
  permitStartTime: string;
  permitEndTime: string;
  email: string;
  phone: string;
};

type FieldName = keyof FormValues;

const initialValues: FormValues = {
  driverName: "",
  vehicleNumber: "",
  appointmentReason: "",
  vacationStartDate: "",
  vacationEndDate: "",
  permitType: "",
  permitStartDate: "",
  permitEndDate: "",
  permitDate: "",
  permitStartTime: "",
  permitEndTime: "",
  email: "",
  phone: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getTodayValue() {
  return getSantiagoToday().date;
}

function validateField(
  name: FieldName,
  value: string,
  today: string,
  reasons: AppointmentReasonConfig[],
) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "Este campo es obligatorio.";
  }

  if (name === "driverName" && trimmedValue.length < 3) {
    return "Ingresa el nombre completo del conductor.";
  }

  if (name === "vehicleNumber" && !/^\d{1,3}$/.test(trimmedValue)) {
    return "Ingresa un móvil numérico de hasta 3 dígitos.";
  }

  if (name === "vacationStartDate" && trimmedValue < today) {
    return "La fecha desde debe ser hoy o posterior.";
  }

  if (
    (name === "permitStartDate" || name === "permitDate") &&
    trimmedValue < today
  ) {
    return "La fecha debe ser hoy o posterior.";
  }

  if (name === "permitType" && !["dias", "horas"].includes(trimmedValue)) {
    return "Selecciona si el permiso es por día o por horas.";
  }

  if (
    name === "appointmentReason" &&
    !reasons.some((reason) => reason.value === trimmedValue && reason.isActive)
  ) {
    return "Selecciona un motivo válido.";
  }

  if (name === "email" && !emailPattern.test(trimmedValue)) {
    return "Ingresa un correo válido.";
  }

  if (name === "phone") {
    const digitCount = trimmedValue.replace(/\D/g, "").length;

    if (digitCount < 8 || digitCount > 12) {
      return "Ingresa un teléfono válido entre 8 y 12 dígitos.";
    }
  }

  return "";
}

function normalizeVehicleNumber(value: string) {
  return value.trim().padStart(3, "0");
}

type AppointmentSubmission = Omit<
  Appointment,
  | "id"
  | "ticketNumber"
  | "appointmentReasonLabel"
  | "reasonAllowsExecutiveAssignment"
  | "reasonUsesDateRange"
  | "reasonUsesPermitDetails"
  | "assignedExecutive"
  | "createdAt"
  | "status"
>;

function createAppointment(
  values: FormValues,
  reasons: AppointmentReasonConfig[],
): AppointmentSubmission {
  const usesDateRange = appointmentReasonUsesDateRange(
    values.appointmentReason,
    reasons,
  );
  const usesPermitDetails = appointmentReasonUsesPermitDetails(
    values.appointmentReason,
    reasons,
  );

  return {
    driverName: values.driverName.trim(),
    vehicleNumber: normalizeVehicleNumber(values.vehicleNumber),
    appointmentDate: getSantiagoToday().date,
    vacationStartDate: usesDateRange ? values.vacationStartDate : "",
    vacationEndDate: usesDateRange ? values.vacationEndDate : "",
    permitType: usesPermitDetails
      ? (values.permitType as Appointment["permitType"])
      : "",
    permitStartDate:
      usesPermitDetails && values.permitType === "dias"
        ? values.permitStartDate
        : "",
    permitEndDate:
      usesPermitDetails && values.permitType === "dias"
        ? values.permitEndDate
        : "",
    permitDate:
      usesPermitDetails && values.permitType === "horas"
        ? values.permitDate
        : "",
    permitStartTime:
      usesPermitDetails && values.permitType === "horas"
        ? values.permitStartTime
        : "",
    permitEndTime:
      usesPermitDetails && values.permitType === "horas"
        ? values.permitEndTime
        : "",
    appointmentReason: values.appointmentReason as PermissionReason,
    email: values.email.trim(),
    phone: values.phone.trim(),
  };
}

async function saveAppointment(newAppointment: AppointmentSubmission) {
  const response = await fetch("/api/appointments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newAppointment),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    if (response.status === 403 && result.message) {
      throw new Error(result.message);
    }

    throw new Error("No se pudo registrar la solicitud.");
  }

  const result = (await response.json()) as { appointment?: Appointment };

  if (!result.appointment) {
    throw new Error("No se pudo obtener el ticket de la solicitud.");
  }

  return result.appointment;
}

async function sendTicketEmail(newAppointment: Appointment) {
  const response = await fetch("/api/send-ticket-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newAppointment),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar el correo de confirmación.");
  }
}

export default function HomePage() {
  const today = useMemo(() => getTodayValue(), []);
  const formStartedAt = useMemo(() => Date.now(), []);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>(
    {},
  );
  const [securityTouched, setSecurityTouched] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [botTrap, setBotTrap] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTicketId, setSuccessTicketId] = useState("");
  const [emailWarning, setEmailWarning] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reasons, setReasons] = useState<AppointmentReasonConfig[]>(
    defaultAppointmentReasons,
  );
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
  const selectedReasonConfig = useMemo(
    () =>
      activeReasons.find((reason) => reason.value === values.appointmentReason),
    [activeReasons, values.appointmentReason],
  );
  const isSelectedReasonRestricted = useMemo(
    () =>
      selectedReasonConfig
        ? isReasonRestrictedToday(selectedReasonConfig.restrictedWeekdays)
        : false,
    [selectedReasonConfig],
  );

  useEffect(() => {
    fetch("/api/appointment-reasons", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("No se pudieron cargar los motivos.");
        }

        return response.json() as Promise<{ reasons?: AppointmentReasonConfig[] }>;
      })
      .then((data) => {
        if (data.reasons?.length) {
          setReasons(data.reasons);
        }
      })
      .catch(() => {
        setReasons(defaultAppointmentReasons);
      });
  }, []);

  const errors = useMemo(() => {
    const vacationStartDate = usesDateRange
      ? validateField("vacationStartDate", values.vacationStartDate, today, reasons)
      : "";
    const vacationEndDate = usesDateRange
      ? validateField("vacationEndDate", values.vacationEndDate, today, reasons)
      : "";
    const permitType = usesPermitDetails
      ? validateField("permitType", values.permitType, today, reasons)
      : "";
    const permitStartDate =
      usesPermitDetails && values.permitType === "dias"
        ? validateField("permitStartDate", values.permitStartDate, today, reasons)
        : "";
    const permitEndDate =
      usesPermitDetails && values.permitType === "dias"
        ? validateField("permitEndDate", values.permitEndDate, today, reasons)
        : "";
    const permitDate =
      usesPermitDetails && values.permitType === "horas"
        ? validateField("permitDate", values.permitDate, today, reasons)
        : "";
    const permitStartTime =
      usesPermitDetails && values.permitType === "horas"
        ? validateField("permitStartTime", values.permitStartTime, today, reasons)
        : "";
    const permitEndTime =
      usesPermitDetails && values.permitType === "horas"
        ? validateField("permitEndTime", values.permitEndTime, today, reasons)
        : "";

    return {
      driverName: validateField("driverName", values.driverName, today, reasons),
      vehicleNumber: validateField(
        "vehicleNumber",
        values.vehicleNumber,
        today,
        reasons,
      ),
      appointmentReason: validateField(
        "appointmentReason",
        values.appointmentReason,
        today,
        reasons,
      ),
      vacationStartDate,
      vacationEndDate:
        !vacationEndDate &&
        usesDateRange &&
        values.vacationStartDate &&
        values.vacationEndDate &&
        values.vacationEndDate < values.vacationStartDate
          ? "La fecha hasta no puede ser anterior a la fecha desde."
          : vacationEndDate,
      permitType,
      permitStartDate,
      permitEndDate:
        !permitEndDate &&
        usesPermitDetails &&
        values.permitType === "dias" &&
        values.permitStartDate &&
        values.permitEndDate &&
        values.permitEndDate < values.permitStartDate
          ? "La fecha hasta no puede ser anterior a la fecha desde."
          : permitEndDate,
      permitDate,
      permitStartTime,
      permitEndTime:
        !permitEndTime &&
        usesPermitDetails &&
        values.permitType === "horas" &&
        values.permitStartTime &&
        values.permitEndTime &&
        values.permitEndTime <= values.permitStartTime
          ? "La hora hasta debe ser posterior a la hora desde."
          : permitEndTime,
      email: validateField("email", values.email, today, reasons),
      phone: validateField("phone", values.phone, today, reasons),
    };
  }, [today, usesDateRange, usesPermitDetails, values, reasons]);

  const securityError =
    botTrap.trim().length > 0 || securityAnswer.trim() !== "7"
      ? "Completa la verificación de seguridad."
      : "";
  const isFormValid =
    Object.values(errors).every((error) => !error) &&
    !securityError &&
    !isSelectedReasonRestricted;

  function updateField(name: FieldName, value: string) {
    setValues((currentValues) => ({
      ...currentValues,
      [name]: name === "vehicleNumber" ? value.replace(/\D/g, "").slice(0, 3) : value,
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
      ...(name === "permitType" && value === "dias"
        ? { permitDate: "", permitStartTime: "", permitEndTime: "" }
        : {}),
      ...(name === "permitType" && value === "horas"
        ? { permitStartDate: "", permitEndDate: "" }
        : {}),
    }));
    setShowSuccess(false);
    setSuccessTicketId("");
    setEmailWarning("");
    setSubmitError("");
  }

  function formatVehicleNumber() {
    setValues((currentValues) => ({
      ...currentValues,
      vehicleNumber: currentValues.vehicleNumber
        ? normalizeVehicleNumber(currentValues.vehicleNumber)
        : "",
    }));
    markFieldAsTouched("vehicleNumber");
  }

  function markFieldAsTouched(name: FieldName) {
    setTouched((currentTouched) => ({
      ...currentTouched,
      [name]: true,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setTouched({
      driverName: true,
      vehicleNumber: true,
      appointmentReason: true,
      vacationStartDate: usesDateRange,
      vacationEndDate: usesDateRange,
      permitType: usesPermitDetails,
      permitStartDate: usesPermitDetails && values.permitType === "dias",
      permitEndDate: usesPermitDetails && values.permitType === "dias",
      permitDate: usesPermitDetails && values.permitType === "horas",
      permitStartTime: usesPermitDetails && values.permitType === "horas",
      permitEndTime: usesPermitDetails && values.permitType === "horas",
      email: true,
      phone: true,
    });
    setSecurityTouched(true);

    const submittedTooFast = Date.now() - formStartedAt < 2000;

    if (isSelectedReasonRestricted) {
      setSubmitError(RESTRICTED_DAY_MESSAGE);
      setShowSuccess(false);
      return;
    }

    const canSubmit = isFormValid && !submittedTooFast;

    if (canSubmit) {
      setIsSubmitting(true);
      const appointment = createAppointment(values, reasons);

      try {
        const savedAppointment = await saveAppointment(appointment);

        try {
          await sendTicketEmail(savedAppointment);
          setEmailWarning("");
        } catch {
          setEmailWarning(
            "La solicitud fue registrada, pero no se pudo enviar el correo de confirmación.",
          );
        }

        setSuccessTicketId(getAppointmentTicketLabel(savedAppointment));
        setValues(initialValues);
        setSecurityAnswer("");
        setTouched({});
        setSecurityTouched(false);
        setShowSuccess(true);
      } catch (error) {
        setShowSuccess(false);
        setSubmitError(
          error instanceof Error && error.message
            ? error.message
            : "No se pudo registrar la solicitud. Intenta nuevamente.",
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setShowSuccess(canSubmit);
  }

  function fieldStatus(name: FieldName) {
    return touched[name] && errors[name] ? "border-red-400" : "border-[#d8e2ef]";
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#eef3f9] px-4 py-6 text-[#0f2747] sm:px-6 sm:py-10 lg:px-10">
      <section className="grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)] lg:items-stretch">
        <aside className="flex flex-col rounded-[24px] bg-[#062b5f] p-5 text-white shadow-xl shadow-slate-300/60 sm:rounded-[28px] sm:p-8 lg:p-9">
          <div className="mb-8 rounded-[20px] bg-white p-4 shadow-lg shadow-blue-950/20 sm:mb-12">
            <img
              src="/logo-apoquindo.png"
              alt="Transportes Apoquindo"
              className="h-auto w-full object-contain"
            />
          </div>

          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9ec5ff]">
              Solicitud de cita
            </p>
            <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Registra citas de forma segura
            </h1>
            <p className="text-base leading-7 text-blue-50/85">
              Completa los datos del conductor, móvil y motivo para validar la
              solicitud antes de continuar.
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-[22px] border border-white/15 bg-white/5 shadow-2xl shadow-blue-950/30 lg:mt-auto">
            <img
              src="/agendamiento-citas-apoquindo.png"
              alt="Agendamiento de citas de transporte ejecutivo"
              className="aspect-[16/10] w-full object-cover"
            />
          </div>
        </aside>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="rounded-[24px] border border-[#d8e2ef] bg-white p-5 shadow-xl shadow-slate-200/80 sm:rounded-[28px] sm:p-8"
        >
          <div className="mb-7 border-b border-[#e3ebf5] pb-6">
            <h2 className="font-heading text-2xl font-semibold text-[#0f2747]">
              Datos de la cita
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Completa todos los campos para validar la solicitud.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Nombre del conductor
              </span>
              <input
                type="text"
                name="driverName"
                required
                value={values.driverName}
                onBlur={() => markFieldAsTouched("driverName")}
                onChange={(event) => updateField("driverName", event.target.value)}
                placeholder="Ej: Juan Pérez"
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("driverName")}`}
              />
              {touched.driverName && errors.driverName ? (
                <span className="text-sm text-red-600">{errors.driverName}</span>
              ) : null}
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Número de móvil
              </span>
              <input
                type="text"
                inputMode="numeric"
                name="vehicleNumber"
                required
                value={values.vehicleNumber}
                onBlur={formatVehicleNumber}
                onChange={(event) =>
                  updateField("vehicleNumber", event.target.value)
                }
                placeholder="Ej: 001"
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("vehicleNumber")}`}
              />
              {touched.vehicleNumber && errors.vehicleNumber ? (
                <span className="text-sm text-red-600">
                  {errors.vehicleNumber}
                </span>
              ) : null}
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Correo electrónico
              </span>
              <input
                type="email"
                name="email"
                required
                value={values.email}
                onBlur={() => markFieldAsTouched("email")}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="correo@ejemplo.com"
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("email")}`}
              />
              {touched.email && errors.email ? (
                <span className="text-sm text-red-600">{errors.email}</span>
              ) : null}
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Número telefónico
              </span>
              <input
                type="tel"
                name="phone"
                required
                value={values.phone}
                onBlur={() => markFieldAsTouched("phone")}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="Ej: +56 9 1234 5678"
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("phone")}`}
              />
              {touched.phone && errors.phone ? (
                <span className="text-sm text-red-600">{errors.phone}</span>
              ) : null}
            </label>

            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Motivo de la cita
              </span>
              <select
                name="appointmentReason"
                required
                value={values.appointmentReason}
                onBlur={() => markFieldAsTouched("appointmentReason")}
                onChange={(event) =>
                  updateField("appointmentReason", event.target.value)
                }
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("appointmentReason")}`}
              >
                <option value="">Selecciona una opción</option>
                {activeReasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
              {touched.appointmentReason && errors.appointmentReason ? (
                <span className="text-sm text-red-600">
                  {errors.appointmentReason}
                </span>
              ) : null}
              {isSelectedReasonRestricted ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-900">
                  {RESTRICTED_DAY_MESSAGE}
                </div>
              ) : null}
            </label>

            {usesDateRange ? (
              <div className="grid gap-4 rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] p-4 sm:col-span-2 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#173b68]">
                    Fecha desde
                  </span>
                  <input
                    type="date"
                    name="vacationStartDate"
                    required
                    value={values.vacationStartDate}
                    min={today}
                    onBlur={() => markFieldAsTouched("vacationStartDate")}
                    onChange={(event) =>
                      updateField("vacationStartDate", event.target.value)
                    }
                    className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("vacationStartDate")}`}
                  />
                  {touched.vacationStartDate && errors.vacationStartDate ? (
                    <span className="text-sm text-red-600">
                      {errors.vacationStartDate}
                    </span>
                  ) : null}
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#173b68]">
                    Fecha hasta
                  </span>
                  <input
                    type="date"
                    name="vacationEndDate"
                    required
                    value={values.vacationEndDate}
                    min={values.vacationStartDate || today}
                    onBlur={() => markFieldAsTouched("vacationEndDate")}
                    onChange={(event) =>
                      updateField("vacationEndDate", event.target.value)
                    }
                    className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("vacationEndDate")}`}
                  />
                  {touched.vacationEndDate && errors.vacationEndDate ? (
                    <span className="text-sm text-red-600">
                      {errors.vacationEndDate}
                    </span>
                  ) : null}
                </label>
              </div>
            ) : null}

            {usesPermitDetails ? (
              <div className="grid gap-4 rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] p-4 sm:col-span-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#173b68]">
                    Tipo de permiso
                  </span>
                  <select
                    name="permitType"
                    required
                    value={values.permitType}
                    onBlur={() => markFieldAsTouched("permitType")}
                    onChange={(event) =>
                      updateField("permitType", event.target.value)
                    }
                    className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("permitType")}`}
                  >
                    <option value="">Selecciona una opción</option>
                    <option value="dias">Por día</option>
                    <option value="horas">Por horas</option>
                  </select>
                  {touched.permitType && errors.permitType ? (
                    <span className="text-sm text-red-600">
                      {errors.permitType}
                    </span>
                  ) : null}
                </label>

                {values.permitType === "dias" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-semibold text-[#173b68]">
                        Fecha desde
                      </span>
                      <input
                        type="date"
                        name="permitStartDate"
                        required
                        value={values.permitStartDate}
                        min={today}
                        onBlur={() => markFieldAsTouched("permitStartDate")}
                        onChange={(event) =>
                          updateField("permitStartDate", event.target.value)
                        }
                        className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("permitStartDate")}`}
                      />
                      {touched.permitStartDate && errors.permitStartDate ? (
                        <span className="text-sm text-red-600">
                          {errors.permitStartDate}
                        </span>
                      ) : null}
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-semibold text-[#173b68]">
                        Fecha hasta
                      </span>
                      <input
                        type="date"
                        name="permitEndDate"
                        required
                        value={values.permitEndDate}
                        min={values.permitStartDate || today}
                        onBlur={() => markFieldAsTouched("permitEndDate")}
                        onChange={(event) =>
                          updateField("permitEndDate", event.target.value)
                        }
                        className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("permitEndDate")}`}
                      />
                      {touched.permitEndDate && errors.permitEndDate ? (
                        <span className="text-sm text-red-600">
                          {errors.permitEndDate}
                        </span>
                      ) : null}
                    </label>
                  </div>
                ) : null}

                {values.permitType === "horas" ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-semibold text-[#173b68]">
                        Fecha del permiso
                      </span>
                      <input
                        type="date"
                        name="permitDate"
                        required
                        value={values.permitDate}
                        min={today}
                        onBlur={() => markFieldAsTouched("permitDate")}
                        onChange={(event) =>
                          updateField("permitDate", event.target.value)
                        }
                        className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("permitDate")}`}
                      />
                      {touched.permitDate && errors.permitDate ? (
                        <span className="text-sm text-red-600">
                          {errors.permitDate}
                        </span>
                      ) : null}
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-semibold text-[#173b68]">
                        Hora desde
                      </span>
                      <input
                        type="time"
                        name="permitStartTime"
                        required
                        value={values.permitStartTime}
                        onBlur={() => markFieldAsTouched("permitStartTime")}
                        onChange={(event) =>
                          updateField("permitStartTime", event.target.value)
                        }
                        className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("permitStartTime")}`}
                      />
                      {touched.permitStartTime && errors.permitStartTime ? (
                        <span className="text-sm text-red-600">
                          {errors.permitStartTime}
                        </span>
                      ) : null}
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-semibold text-[#173b68]">
                        Hora hasta
                      </span>
                      <input
                        type="time"
                        name="permitEndTime"
                        required
                        value={values.permitEndTime}
                        onBlur={() => markFieldAsTouched("permitEndTime")}
                        onChange={(event) =>
                          updateField("permitEndTime", event.target.value)
                        }
                        className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${fieldStatus("permitEndTime")}`}
                      />
                      {touched.permitEndTime && errors.permitEndTime ? (
                        <span className="text-sm text-red-600">
                          {errors.permitEndTime}
                        </span>
                      ) : null}
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <input
            type="text"
            name="companyWebsite"
            value={botTrap}
            onChange={(event) => setBotTrap(event.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          <div className="mt-6 rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] p-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Verificación de seguridad
              </span>
              <span className="text-sm leading-6 text-slate-600">
                Para evitar spam, escribe el resultado de 3 + 4.
              </span>
              <input
                type="text"
                inputMode="numeric"
                required
                value={securityAnswer}
                onBlur={() => setSecurityTouched(true)}
                onChange={(event) => {
                  setSecurityAnswer(event.target.value);
                  setShowSuccess(false);
                }}
                className={`h-12 rounded-2xl border bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100 ${
                  securityTouched && securityError
                    ? "border-red-400"
                    : "border-[#d8e2ef]"
                }`}
                placeholder="Respuesta"
              />
              {securityTouched && securityError ? (
                <span className="text-sm text-red-600">{securityError}</span>
              ) : null}
            </label>
          </div>

          {showSuccess ? (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
              Solicitud registrada correctamente. Tu número de ticket es{" "}
              <strong>{successTicketId}</strong>. Puedes usarlo para hacer
              seguimiento de tu solicitud.
            </div>
          ) : null}

          {emailWarning ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {emailWarning}
            </div>
          ) : null}

          {submitError ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-4 border-t border-[#e3ebf5] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Este botón valida los campos y la verificación de seguridad.
            </p>
            <button
              type="submit"
              disabled={isSubmitting || isSelectedReasonRestricted}
              className="flex h-12 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto sm:min-w-44"
            >
              {isSubmitting ? "Registrando..." : "Validar cita"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
