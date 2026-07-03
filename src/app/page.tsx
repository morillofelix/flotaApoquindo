"use client";

import {
  type Appointment,
  type AppointmentReasonConfig,
  appointmentReasonUsesPermitDetails,
  appointmentReasonUsesDateRange,
  appointmentReasonAllowsExecutive,
  defaultAppointmentReasons,
  getAppointmentTicketLabel,
  getSantiagoToday,
  isReasonRestrictedToday,
  checkBusinessDayAdvance,
  RESTRICTED_DAY_MESSAGE,
  type PermissionReason,
} from "@/lib/appointments";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import DriverAccessLoginScreen, {
  type PublicDriverOwner,
} from "@/components/DriverAccessLoginScreen";
import DriverChangePasswordScreen from "@/components/DriverChangePasswordScreen";
import PwaInstallLanding from "@/components/PwaInstallLanding";
import PublicPageBanner from "@/components/PublicPageBanner";
import { clearDriverSession, restoreDriverSession } from "@/lib/driver-auth-client";
import {
  clearInstallQueryParam,
  shouldShowPwaInstallLanding,
} from "@/lib/pwa-utils";
import { normalizeVehicleNumber } from "@/lib/driver-owners";
import PublicAppointmentHistory, {
  type PublicAppointmentSummary,
} from "@/components/PublicAppointmentHistory";
import {
  UI_DIVIDER_BORDER,
  UI_FIELD_BORDER,
  UI_PANEL_BORDER,
} from "@/lib/ui-borders";

type FormValues = {
  driverName: string;
  vehicleNumber: string;
  appointmentReason: string;
  appointmentDate: string;
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
  appointmentDate: "",
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
const formPanelBorderClass = UI_PANEL_BORDER;
const formFieldBorderClass = UI_FIELD_BORDER;
const formDividerBorderClass = UI_DIVIDER_BORDER;

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

  if (name === "vehicleNumber" && !/^\d{1,4}$/.test(trimmedValue)) {
    return "Ingresa un móvil numérico de hasta 4 dígitos.";
  }

  if (name === "vacationStartDate" && trimmedValue < today) {
    return "La fecha desde debe ser hoy o posterior.";
  }

  if (
    (name === "permitStartDate" || name === "permitDate" || name === "appointmentDate") &&
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

type AppointmentSubmission = Omit<
  Appointment,
  | "id"
  | "ticketNumber"
  | "appointmentReasonLabel"
  | "reasonAllowsExecutiveAssignment"
  | "reasonUsesAppointmentDuration"
  | "reasonAppointmentDurationMinutes"
  | "reasonUsesServiceStartTime"
  | "reasonServiceStartTime"
  | "reasonUsesDateRange"
  | "reasonUsesPermitDetails"
  | "assignedExecutive"
  | "scheduledStartTime"
  | "scheduledEndTime"
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
  const allowsExecutiveAssignment = appointmentReasonAllowsExecutive(
    values.appointmentReason,
    reasons,
  );

  return {
    driverName: values.driverName.trim(),
    vehicleNumber: normalizeVehicleNumber(values.vehicleNumber),
    appointmentDate: allowsExecutiveAssignment
      ? values.appointmentDate
      : getSantiagoToday().date,
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

type AuthView = "bootstrapping" | "pwa-install" | "login" | "change-password" | "form";

type PendingPasswordChange = {
  driverOwner: PublicDriverOwner;
  currentPassword: string;
};

export default function HomePage() {
  const [authView, setAuthView] = useState<AuthView>("bootstrapping");
  const [driverOwner, setDriverOwner] = useState<PublicDriverOwner | null>(null);
  const [pendingPasswordChange, setPendingPasswordChange] =
    useState<PendingPasswordChange | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const restored = await restoreDriverSession();

      if (cancelled) {
        return;
      }

      if (
        restored.authenticated &&
        restored.driverOwner &&
        !restored.driverOwner.mustChangePassword
      ) {
        setDriverOwner(restored.driverOwner);
        setPendingPasswordChange(null);
        setAuthView("form");
        return;
      }

      setDriverOwner(null);
      setPendingPasswordChange(null);
      setAuthView(
        shouldShowPwaInstallLanding() ? "pwa-install" : "login",
      );
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  if (authView === "bootstrapping") {
    return null;
  }

  if (authView === "pwa-install") {
    return (
      <PwaInstallLanding
        onContinueInBrowser={() => {
          clearInstallQueryParam();
          setAuthView("login");
        }}
      />
    );
  }

  if (authView === "login") {
    return (
      <DriverAccessLoginScreen
        onAuthenticated={(nextDriverOwner) => {
          setDriverOwner(nextDriverOwner);
          setAuthView("form");
        }}
        onMustChangePassword={(nextDriverOwner, currentPassword) => {
          setPendingPasswordChange({
            driverOwner: nextDriverOwner,
            currentPassword,
          });
          setAuthView("change-password");
        }}
      />
    );
  }

  if (authView === "change-password" && pendingPasswordChange) {
    return (
      <DriverChangePasswordScreen
        driverOwner={pendingPasswordChange.driverOwner}
        currentPassword={pendingPasswordChange.currentPassword}
        onCompleted={(nextDriverOwner) => {
          setDriverOwner(nextDriverOwner);
          setPendingPasswordChange(null);
          setAuthView("form");
        }}
        onCancel={() => {
          setPendingPasswordChange(null);
          setAuthView("login");
        }}
      />
    );
  }

  if (!driverOwner) {
    return null;
  }

  return (
    <AppointmentRequestForm
      driverOwner={driverOwner}
      onLogout={() => {
        setDriverOwner(null);
        setPendingPasswordChange(null);
        setAuthView("login");
      }}
    />
  );
}

function AppointmentRequestForm({
  driverOwner,
  onLogout,
}: {
  driverOwner: PublicDriverOwner;
  onLogout: () => void;
}) {
  const today = useMemo(() => getTodayValue(), []);
  const formStartedAt = useMemo(() => Date.now(), []);
  const [values, setValues] = useState<FormValues>(() => ({
    ...initialValues,
    driverName: driverOwner.fullName,
    vehicleNumber: driverOwner.vehicleNumber.replace(/^0+/, "") || driverOwner.vehicleNumber,
    email: driverOwner.email,
    phone: driverOwner.phone,
  }));
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>(
    {},
  );
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTicketId, setSuccessTicketId] = useState("");
  const [emailWarning, setEmailWarning] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reasons, setReasons] = useState<AppointmentReasonConfig[]>(
    defaultAppointmentReasons,
  );
  const linkedVehicleNumber = driverOwner.vehicleNumber;
  const [recentAppointments, setRecentAppointments] = useState<
    PublicAppointmentSummary[]
  >([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
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
  const businessDayAdvanceMessage = useMemo(() => {
    if (!selectedReasonConfig) {
      return "";
    }

    return checkBusinessDayAdvance(selectedReasonConfig, today, {
      usesDateRange: selectedReasonConfig.usesDateRange,
      usesPermitDetails: selectedReasonConfig.usesPermitDetails,
      allowsExecutiveAssignment: selectedReasonConfig.allowsExecutiveAssignment,
      vacationStartDate: values.vacationStartDate,
      permitType: values.permitType,
      permitStartDate: values.permitStartDate,
      permitDate: values.permitDate,
      appointmentDate: values.appointmentDate,
    }).message;
  }, [selectedReasonConfig, today, values]);

  useEffect(() => {
    if (!linkedVehicleNumber) {
      setRecentAppointments([]);
      setIsLoadingRecent(false);
      return;
    }

    let cancelled = false;
    setIsLoadingRecent(true);

    fetch("/api/appointments/by-vehicle", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("No se pudieron cargar las solicitudes.");
        }

        return response.json() as Promise<{
          appointments?: PublicAppointmentSummary[];
        }>;
      })
      .then((data) => {
        if (!cancelled) {
          setRecentAppointments(data.appointments ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecentAppointments([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRecent(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [linkedVehicleNumber]);

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
    const appointmentDate = allowsExecutiveAssignment
      ? validateField("appointmentDate", values.appointmentDate, today, reasons)
      : "";

    return {
      driverName: linkedVehicleNumber
        ? validateField("driverName", values.driverName, today, reasons)
        : "",
      vehicleNumber: (() => {
        const baseError = validateField(
          "vehicleNumber",
          values.vehicleNumber,
          today,
          reasons,
        );

        if (baseError) {
          return baseError;
        }

        if (values.vehicleNumber.trim() && !linkedVehicleNumber) {
          return "Móvil no registrado o no activo.";
        }

        return "";
      })(),
      appointmentReason: validateField(
        "appointmentReason",
        values.appointmentReason,
        today,
        reasons,
      ),
      appointmentDate,
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
      email: linkedVehicleNumber
        ? validateField("email", values.email, today, reasons)
        : "",
      phone: linkedVehicleNumber
        ? validateField("phone", values.phone, today, reasons)
        : "",
    };
  }, [today, usesDateRange, usesPermitDetails, allowsExecutiveAssignment, values, reasons, linkedVehicleNumber]);

  const isFormValid =
    Object.values(errors).every((error) => !error) &&
    !isSelectedReasonRestricted &&
    !businessDayAdvanceMessage;

  async function handleLogout() {
    await clearDriverSession();
    onLogout();
  }

  function resetSubmissionState() {
    setShowSuccess(false);
    setSuccessTicketId("");
    setEmailWarning("");
    setSubmitError("");
  }

  function updateField(name: FieldName, value: string) {
    if (name === "vehicleNumber" || name === "driverName" || name === "email" || name === "phone") {
      return;
    }

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
        ? { appointmentDate: "" }
        : {}),
      ...(name === "permitType" && value === "dias"
        ? { permitDate: "", permitStartTime: "", permitEndTime: "" }
        : {}),
      ...(name === "permitType" && value === "horas"
        ? { permitStartDate: "", permitEndDate: "" }
        : {}),
    }));
    resetSubmissionState();
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
      appointmentDate: allowsExecutiveAssignment,
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
    const submittedTooFast = Date.now() - formStartedAt < 2000;

    if (isSelectedReasonRestricted) {
      setSubmitError(RESTRICTED_DAY_MESSAGE);
      setShowSuccess(false);
      return;
    }

    if (businessDayAdvanceMessage) {
      setSubmitError(businessDayAdvanceMessage);
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

        if (linkedVehicleNumber) {
          fetch(
            `/api/appointments/by-vehicle?vehicleNumber=${encodeURIComponent(linkedVehicleNumber)}`,
            { cache: "no-store" },
          )
            .then((response) =>
              response.ok ? response.json() : Promise.reject(),
            )
            .then((data: { appointments?: PublicAppointmentSummary[] }) => {
              setRecentAppointments(data.appointments ?? []);
            })
            .catch(() => {});
        }

        setValues(initialValues);
        setTouched({});
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
    return touched[name] && errors[name]
      ? "border-red-500"
      : "border-[#9fb8d9]";
  }

  return (
    <main className="pwa-app-shell flex flex-col bg-[#eef3f9] text-[#0f2747]">
      <div className="sticky top-0 z-10 bg-[#eef3f9]/95 backdrop-blur-sm">
        <PublicPageBanner title="Solicitud de cita" />
        <div className="mx-auto flex w-full max-w-2xl justify-end px-4 pb-2 sm:px-6 md:max-w-3xl md:px-8">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-8 items-center justify-center rounded-xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68] transition hover:border-[#0b5cab] hover:text-[#0b5cab]"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-0 sm:px-6 md:px-8">
        <form
          noValidate
          onSubmit={handleSubmit}
          className={`mx-auto w-full max-w-2xl rounded-[18px] ${formPanelBorderClass} bg-white p-4 shadow-sm shadow-slate-300/25 sm:rounded-[20px] sm:p-5 md:max-w-3xl`}
        >
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Número de móvil
                  </span>
                  <input
                    type="text"
                    readOnly
                    value={driverOwner.vehicleNumber}
                    className={`h-10 rounded-xl ${formFieldBorderClass} bg-[#f8fbff] px-3 text-sm font-semibold text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)]`}
                  />
                </label>
              </div>

              <PublicAppointmentHistory
                appointments={recentAppointments}
                isLoading={isLoadingRecent}
                vehicleNumber={linkedVehicleNumber}
              />
            </div>

            <div className={`rounded-xl ${formPanelBorderClass} bg-[#f8fbff] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]`}>
              <dl className="grid gap-0 text-sm">
                <div className={`grid grid-cols-[7.5rem_1fr] items-start gap-2 border-b ${formDividerBorderClass} py-2.5`}>
                  <dt className="text-xs font-medium text-slate-500">Conductor</dt>
                  <dd className="font-medium text-[#0f2747]">
                    {values.driverName || "—"}
                  </dd>
                </div>
                <div className={`grid grid-cols-[7.5rem_1fr] items-start gap-2 border-b ${formDividerBorderClass} py-2.5`}>
                  <dt className="text-xs font-medium text-slate-500">Correo</dt>
                  <dd className="break-all font-medium text-[#0f2747]">
                    {values.email || "—"}
                  </dd>
                </div>
                <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 py-2.5">
                  <dt className="text-xs font-medium text-slate-500">Teléfono</dt>
                  <dd className="font-medium text-[#0f2747]">{values.phone || "—"}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-xs font-semibold text-[#173b68]">
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
                className={`h-10 rounded-xl ${formFieldBorderClass} bg-white px-3 text-sm text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatus("appointmentReason")}`}
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

            {allowsExecutiveAssignment ? (
              <div className={`rounded-2xl ${formPanelBorderClass} bg-[#f8fbff] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:col-span-2`}>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#173b68]">
                    Fecha requerida para la cita
                  </span>
                  <input
                    type="date"
                    name="appointmentDate"
                    required
                    value={values.appointmentDate}
                    min={today}
                    onBlur={() => markFieldAsTouched("appointmentDate")}
                    onChange={(event) =>
                      updateField("appointmentDate", event.target.value)
                    }
                    className={`h-12 rounded-2xl ${formFieldBorderClass} bg-white px-4 text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatus("appointmentDate")}`}
                  />
                  <p className="text-[11px] leading-5 text-slate-500">
                    Día en que necesitas ir a la empresa para este trámite. La
                    fecha de registro de la solicitud se guarda automáticamente
                    al enviarla.
                  </p>
                  {touched.appointmentDate && errors.appointmentDate ? (
                    <span className="text-sm text-red-600">
                      {errors.appointmentDate}
                    </span>
                  ) : null}
                </label>

                {businessDayAdvanceMessage && !usesDateRange && !usesPermitDetails ? (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-900">
                    {businessDayAdvanceMessage}
                  </div>
                ) : null}
              </div>
            ) : null}

            {usesDateRange ? (
              <div className={`grid gap-4 rounded-2xl ${formPanelBorderClass} bg-[#f8fbff] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:col-span-2 sm:grid-cols-2`}>
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
                    className={`h-12 rounded-2xl ${formFieldBorderClass} bg-white px-4 text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatus("vacationStartDate")}`}
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
                    className={`h-12 rounded-2xl ${formFieldBorderClass} bg-white px-4 text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatus("vacationEndDate")}`}
                  />
                  {touched.vacationEndDate && errors.vacationEndDate ? (
                    <span className="text-sm text-red-600">
                      {errors.vacationEndDate}
                    </span>
                  ) : null}
                </label>

                {businessDayAdvanceMessage ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-900 sm:col-span-2">
                    {businessDayAdvanceMessage}
                  </div>
                ) : null}
              </div>
            ) : null}

            {usesPermitDetails ? (
              <div className={`grid gap-4 rounded-2xl ${formPanelBorderClass} bg-[#f8fbff] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:col-span-2`}>
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
                    className={`h-12 rounded-2xl ${formFieldBorderClass} bg-white px-4 text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatus("permitType")}`}
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
                        className={`h-12 rounded-2xl ${formFieldBorderClass} bg-white px-4 text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatus("permitStartDate")}`}
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
                        className={`h-12 rounded-2xl ${formFieldBorderClass} bg-white px-4 text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatus("permitEndDate")}`}
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
                        className={`h-12 rounded-2xl ${formFieldBorderClass} bg-white px-4 text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatus("permitDate")}`}
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
                        className={`h-12 rounded-2xl ${formFieldBorderClass} bg-white px-4 text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatus("permitStartTime")}`}
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
                        className={`h-12 rounded-2xl ${formFieldBorderClass} bg-white px-4 text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 ${fieldStatus("permitEndTime")}`}
                      />
                      {touched.permitEndTime && errors.permitEndTime ? (
                        <span className="text-sm text-red-600">
                          {errors.permitEndTime}
                        </span>
                      ) : null}
                    </label>
                  </div>
                ) : null}

                {businessDayAdvanceMessage ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-900">
                    {businessDayAdvanceMessage}
                  </div>
                ) : null}
              </div>
            ) : null}
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

          <div className={`mt-8 flex flex-col gap-4 border-t ${formDividerBorderClass} pt-6 sm:flex-row sm:items-center sm:justify-between`}>
            <p className="text-sm text-slate-600">
              Este botón valida los campos de la solicitud.
            </p>
            <button
              type="submit"
              disabled={isSubmitting || isSelectedReasonRestricted || Boolean(businessDayAdvanceMessage)}
              className="flex h-12 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto sm:min-w-44"
            >
              {isSubmitting ? "Registrando..." : "Validar cita"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
