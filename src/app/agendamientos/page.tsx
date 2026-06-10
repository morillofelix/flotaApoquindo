"use client";

import {
  type Appointment,
  type AppointmentStatus,
  type Executive,
  type PermissionReason,
  appointmentReasonUsesPermitDetails,
  appointmentReasonUsesDateRange,
  executives,
  getAppointmentTicketLabel,
  getExecutiveEmail,
  getPermissionReasonLabel,
  permissionReasons,
} from "@/lib/appointments";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const statusLabels: Record<AppointmentStatus, string> = {
  pendiente: "Pendiente",
  revisado: "Agendado",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

const statusStyles: Record<AppointmentStatus, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-800",
  revisado: "border-green-200 bg-green-50 text-green-800",
  aprobado: "border-blue-200 bg-blue-50 text-blue-800",
  rechazado: "border-red-200 bg-red-50 text-red-800",
};

type DateFilter =
  | "todos"
  | "ultimos7"
  | "ultimos15"
  | "ultimos30"
  | "personalizado";

type EmailNotice =
  | {
      status: "sending" | "sent";
      message: string;
    }
  | null;

async function loadAppointments() {
  const response = await fetch("/api/appointments", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar las solicitudes.");
  }

  const data = (await response.json()) as { appointments?: Appointment[] };
  return data.appointments ?? [];
}

function formatDate(value: string) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getAppointmentDateRange(appointment: Appointment) {
  if (
    !appointmentReasonUsesDateRange(appointment.appointmentReason) ||
    !appointment.vacationStartDate ||
    !appointment.vacationEndDate
  ) {
    return "";
  }

  return `${formatDate(appointment.vacationStartDate)} al ${formatDate(
    appointment.vacationEndDate,
  )}`;
}

function getPermitDetail(appointment: Appointment) {
  if (!appointmentReasonUsesPermitDetails(appointment.appointmentReason)) {
    return "";
  }

  if (
    appointment.permitType === "dias" &&
    appointment.permitStartDate &&
    appointment.permitEndDate
  ) {
    return `Por día: ${formatDate(appointment.permitStartDate)} al ${formatDate(
      appointment.permitEndDate,
    )}`;
  }

  if (
    appointment.permitType === "horas" &&
    appointment.permitDate &&
    appointment.permitStartTime &&
    appointment.permitEndTime
  ) {
    return `Por horas: ${formatDate(appointment.permitDate)}, ${
      appointment.permitStartTime
    } a ${appointment.permitEndTime}`;
  }

  return "";
}

function getRequestDateDetail(appointment: Appointment) {
  return getPermitDetail(appointment) || getAppointmentDateRange(appointment);
}

function parseDateOnly(value: string) {
  if (!value) {
    return null;
  }

  const date = value.includes("T")
    ? new Date(value)
    : new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getTodayDateOnly() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function getDateDaysAgo(days: number) {
  const date = getTodayDateOnly();
  date.setDate(date.getDate() - (days - 1));
  return date;
}

function isWithinDateFilter(
  dateValue: string,
  dateFilter: DateFilter,
  customStartDate: string,
  customEndDate: string,
) {
  if (dateFilter === "todos") {
    return true;
  }

  const date = parseDateOnly(dateValue);

  if (!date) {
    return false;
  }

  if (dateFilter === "personalizado") {
    const startDate = parseDateOnly(customStartDate);
    const endDate = parseDateOnly(customEndDate);

    if (startDate && date < startDate) {
      return false;
    }

    if (endDate && date > endDate) {
      return false;
    }

    return true;
  }

  const daysByFilter: Record<
    Exclude<DateFilter, "todos" | "personalizado">,
    number
  > = {
    ultimos7: 7,
    ultimos15: 15,
    ultimos30: 30,
  };
  const startDate = getDateDaysAgo(daysByFilter[dateFilter]);
  const endDate = getTodayDateOnly();

  return date >= startDate && date <= endDate;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createExcelTable(appointments: Appointment[]) {
  const rows = appointments
    .map((appointment) => {
      const dateFrom =
        appointment.permitType === "dias"
          ? appointment.permitStartDate
          : appointment.vacationStartDate;
      const dateTo =
        appointment.permitType === "dias"
          ? appointment.permitEndDate
          : appointment.vacationEndDate;
      const permitTypeLabel =
        appointment.permitType === "dias"
          ? "Por día"
          : appointment.permitType === "horas"
            ? "Por horas"
            : "";

      return `
        <tr>
          <td>${escapeHtml(getAppointmentTicketLabel(appointment))}</td>
          <td>${escapeHtml(appointment.driverName)}</td>
          <td>${escapeHtml(appointment.vehicleNumber)}</td>
          <td>${escapeHtml(formatDate(appointment.appointmentDate))}</td>
          <td>${escapeHtml(getPermissionReasonLabel(appointment.appointmentReason))}</td>
          <td>${escapeHtml(appointment.permitDate || "No aplica")}</td>
          <td>${escapeHtml(permitTypeLabel || "No aplica")}</td>
          <td>${escapeHtml(dateFrom || "No aplica")}</td>
          <td>${escapeHtml(dateTo || "No aplica")}</td>
          <td>${escapeHtml(appointment.permitStartTime || "No aplica")}</td>
          <td>${escapeHtml(appointment.permitEndTime || "No aplica")}</td>
          <td>${escapeHtml(statusLabels[appointment.status])}</td>
          <td>${escapeHtml(appointment.email)}</td>
          <td>${escapeHtml(appointment.phone)}</td>
          <td>${escapeHtml(appointment.assignedExecutive || "Sin asignar")}</td>
          <td>${escapeHtml(formatCreatedAt(appointment.createdAt))}</td>
        </tr>`;
    })
    .join("");

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
      </head>
      <body>
        <table border="1">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Conductor</th>
              <th>Móvil</th>
              <th>Fecha requerida</th>
              <th>Motivo</th>
              <th>Fecha permiso</th>
              <th>Tipo permiso</th>
              <th>Fecha desde</th>
              <th>Fecha hasta</th>
              <th>Hora desde</th>
              <th>Hora hasta</th>
              <th>Estado</th>
              <th>Correo</th>
              <th>Teléfono</th>
              <th>Ejecutivo</th>
              <th>Fecha de registro</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>`;
}

function downloadExcel(appointments: Appointment[], fileName: string) {
  const htmlTable = createExcelTable(appointments);
  const blob = new Blob([htmlTable], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function shouldSendCalendarInvite(appointment: Appointment) {
  return (
    appointment.status === "revisado" &&
    appointment.appointmentReason === "otros" &&
    appointment.assignedExecutive !== "" &&
    Boolean(getExecutiveEmail(appointment.assignedExecutive))
  );
}

function appointmentAllowsExecutive(appointment: Appointment) {
  return appointment.appointmentReason === "otros";
}

function shouldSendDecisionEmail(appointment: Appointment) {
  return (
    (appointment.status === "aprobado" || appointment.status === "rechazado") &&
    (appointmentReasonUsesDateRange(appointment.appointmentReason) ||
      appointmentReasonUsesPermitDetails(appointment.appointmentReason))
  );
}

async function sendCalendarInvite(appointment: Appointment) {
  const response = await fetch("/api/send-calendar-invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(appointment),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar la cita al ejecutivo.");
  }
}

async function sendDecisionEmail(appointment: Appointment) {
  const response = await fetch("/api/send-approval-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(appointment),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar el correo de respuesta.");
  }
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [statusFilter, setStatusFilter] = useState<"todos" | AppointmentStatus>(
    "todos",
  );
  const [reasonFilter, setReasonFilter] = useState<"todos" | PermissionReason>(
    "todos",
  );
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("todos");
  const [customDateRange, setCustomDateRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginValues, setLoginValues] = useState({ user: "", password: "" });
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [emailNotice, setEmailNotice] = useState<EmailNotice>(null);

  useEffect(() => {
    setIsAuthenticated(
      window.sessionStorage.getItem("apoquindo-admin-auth") === "true",
    );
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    setIsLoadingAppointments(true);
    setAppointmentsError("");

    loadAppointments()
      .then((loadedAppointments) => setAppointments(loadedAppointments))
      .catch(() =>
        setAppointmentsError("No se pudieron cargar las solicitudes."),
      )
      .finally(() => setIsLoadingAppointments(false));
  }, [isAuthenticated]);

  useEffect(() => {
    if (emailNotice?.status !== "sent") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setEmailNotice(null);
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [emailNotice]);

  const filteredAppointments = useMemo(() => {
    const normalizedVehicleFilter = vehicleFilter.trim().toLowerCase();

    return appointments.filter((appointment) => {
      const matchesStatus =
        statusFilter === "todos" || appointment.status === statusFilter;
      const matchesReason =
        reasonFilter === "todos" ||
        appointment.appointmentReason === reasonFilter;
      const matchesVehicle =
        normalizedVehicleFilter === "" ||
        appointment.vehicleNumber
          .toLowerCase()
          .includes(normalizedVehicleFilter);
      const matchesDate = isWithinDateFilter(
        appointment.createdAt,
        dateFilter,
        customDateRange.startDate,
        customDateRange.endDate,
      );

      return matchesStatus && matchesReason && matchesVehicle && matchesDate;
    });
  }, [
    appointments,
    customDateRange,
    dateFilter,
    reasonFilter,
    statusFilter,
    vehicleFilter,
  ]);

  const pendingCount = appointments.filter(
    (appointment) => appointment.status === "pendiente",
  ).length;
  const scheduledCount = appointments.filter(
    (appointment) => appointment.status === "revisado",
  ).length;
  const approvedCount = appointments.filter(
    (appointment) => appointment.status === "aprobado",
  ).length;
  const rejectedCount = appointments.filter(
    (appointment) => appointment.status === "rechazado",
  ).length;

  async function updateStatus(id: string, status: AppointmentStatus) {
    const previousAppointments = appointments;
    let appointmentToInvite: Appointment | null = null;
    const updatedAppointments = appointments.map((appointment) => {
      if (appointment.id !== id) {
        return appointment;
      }

      appointmentToInvite = { ...appointment, status };
      return appointmentToInvite;
    });

    setAppointments(updatedAppointments);
    setAppointmentsError("");
    setEmailNotice(null);

    try {
      const response = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("No se pudo actualizar la solicitud.");
      }

      if (appointmentToInvite && shouldSendCalendarInvite(appointmentToInvite)) {
        try {
          setEmailNotice({
            status: "sending",
            message: "Enviando cita Outlook al ejecutivo...",
          });
          await sendCalendarInvite(appointmentToInvite);
          setEmailNotice({
            status: "sent",
            message: "Correo enviado.",
          });
        } catch {
          setEmailNotice(null);
          setAppointmentsError(
            "La solicitud quedó agendada, pero no se pudo enviar la cita al ejecutivo.",
          );
        }
      }

      const decisionAppointment: Appointment | null = appointmentToInvite;

      if (decisionAppointment && shouldSendDecisionEmail(decisionAppointment)) {
        try {
          setEmailNotice({
            status: "sending",
            message:
              status === "aprobado"
                ? "Enviando correo de aprobación..."
                : "Enviando correo de rechazo...",
          });
          await sendDecisionEmail(decisionAppointment);
          setEmailNotice({
            status: "sent",
            message: "Correo enviado.",
          });
        } catch {
          setEmailNotice(null);
          setAppointmentsError(
            "La solicitud cambió de estado, pero no se pudo enviar el correo al solicitante.",
          );
        }
      }
    } catch {
      setAppointments(previousAppointments);
      setAppointmentsError("No se pudo actualizar el estado.");
    }
  }

  async function updateAssignedExecutive(
    id: string,
    assignedExecutive: Executive | "",
  ) {
    const previousAppointments = appointments;
    let appointmentToInvite: Appointment | null = null;
    const updatedAppointments = appointments.map((appointment) => {
      if (appointment.id !== id) {
        return appointment;
      }

      appointmentToInvite = { ...appointment, assignedExecutive };
      return appointmentToInvite;
    });

    setAppointments(updatedAppointments);
    setAppointmentsError("");
    setEmailNotice(null);

    try {
      const response = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assignedExecutive }),
      });

      if (!response.ok) {
        throw new Error("No se pudo asignar el ejecutivo.");
      }

      if (appointmentToInvite && shouldSendCalendarInvite(appointmentToInvite)) {
        try {
          setEmailNotice({
            status: "sending",
            message: "Enviando cita Outlook al ejecutivo...",
          });
          await sendCalendarInvite(appointmentToInvite);
          setEmailNotice({
            status: "sent",
            message: "Correo enviado.",
          });
        } catch {
          setEmailNotice(null);
          setAppointmentsError(
            "El ejecutivo quedó asignado, pero no se pudo enviar la cita.",
          );
        }
      }
    } catch {
      setAppointments(previousAppointments);
      setAppointmentsError("No se pudo asignar el ejecutivo.");
    }
  }

  async function removeAppointment(id: string) {
    const previousAppointments = appointments;
    const updatedAppointments = appointments.filter(
      (appointment) => appointment.id !== id,
    );

    setAppointments(updatedAppointments);

    try {
      const response = await fetch(`/api/appointments/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar la solicitud.");
      }
    } catch {
      setAppointments(previousAppointments);
      setAppointmentsError("No se pudo eliminar la solicitud.");
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: loginValues.user.trim(),
          password: loginValues.password,
        }),
      });

      if (response.ok) {
        window.sessionStorage.setItem("apoquindo-admin-auth", "true");
        setIsAuthenticated(true);
        setLoginValues({ user: "", password: "" });
        setIsPasswordVisible(false);
        return;
      }

      setLoginError("Usuario o clave incorrectos.");
    } catch {
      setLoginError("No se pudo validar el acceso. Intenta nuevamente.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleLogout() {
    window.sessionStorage.removeItem("apoquindo-admin-auth");
    setIsAuthenticated(false);
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#eef3f9] px-4 py-6 text-[#0f2747] sm:px-6 sm:py-10 lg:px-10">
        <section className="w-full max-w-md rounded-[24px] border border-[#d8e2ef] bg-white p-5 shadow-xl shadow-slate-200/80 sm:rounded-[28px] sm:p-8">
          <div className="mb-7 border-b border-[#e3ebf5] pb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0b5cab]">
              Acceso ejecutivo
            </p>
            <h1 className="mt-3 font-heading text-3xl font-semibold leading-tight tracking-tight text-[#0f2747]">
              Administración de citas
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Ingresa usuario y clave para revisar las solicitudes enviadas.
            </p>
          </div>

          <form noValidate onSubmit={handleLogin} className="grid gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Usuario
              </span>
              <input
                type="text"
                value={loginValues.user}
                onChange={(event) =>
                  setLoginValues((currentValues) => ({
                    ...currentValues,
                    user: event.target.value,
                  }))
                }
                className="h-12 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                placeholder="Usuario ejecutivo"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Clave
              </span>
              <div className="relative">
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  value={loginValues.password}
                  onChange={(event) =>
                    setLoginValues((currentValues) => ({
                      ...currentValues,
                      password: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-[#d8e2ef] bg-white px-4 pr-12 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                  placeholder="Clave de acceso"
                />
                <button
                  type="button"
                  onClick={() =>
                    setIsPasswordVisible((currentValue) => !currentValue)
                  }
                  aria-label={
                    isPasswordVisible ? "Ocultar clave" : "Mostrar clave"
                  }
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#f8fbff] hover:text-[#0b5cab] focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  {isPasswordVisible ? (
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path d="m3 3 18 18" />
                      <path d="M10.7 5.1A10.8 10.8 0 0 1 12 5c6 0 9 7 9 7a13.2 13.2 0 0 1-2.1 3.2" />
                      <path d="M6.6 6.6C4.1 8.3 3 12 3 12s3 7 9 7a9.7 9.7 0 0 0 4.1-.9" />
                      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                      <path d="M14.1 9.9A3 3 0 0 0 9.9 14.1" />
                    </svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {loginError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {loginError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
            >
              {isLoggingIn ? "Validando..." : "Ingresar"}
            </button>
          </form>

          <p className="mt-5 rounded-2xl bg-[#f8fbff] px-4 py-3 text-xs leading-5 text-slate-500">
            Acceso temporal: usuario <strong>ejecutivo</strong>, clave{" "}
            <strong>Apoquindo2026</strong>.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#eef3f9] px-3 py-4 text-[#0f2747] sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        <header className="mb-3 rounded-[22px] border border-[#d8e2ef] bg-white p-4 shadow-lg shadow-slate-200/70 sm:rounded-[24px]">
          <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_auto_auto] xl:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b5cab]">
                Administración de citas
              </p>
              <h1 className="mt-1 font-heading text-2xl font-semibold leading-tight tracking-tight text-[#0f2747]">
                Agendamientos recibidos
              </h1>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:min-w-[600px]">
              <div className="rounded-2xl bg-[#f8fbff] px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">
                  Total
                </p>
                <p className="font-heading text-xl font-semibold text-[#0f2747]">
                  {appointments.length}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-amber-800">
                  Pendientes
                </p>
                <p className="font-heading text-xl font-semibold text-amber-800">
                  {pendingCount}
                </p>
              </div>
              <div className="rounded-2xl border border-green-200 bg-green-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-green-800">
                  Agendados
                </p>
                <p className="font-heading text-xl font-semibold text-green-800">
                  {scheduledCount}
                </p>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-blue-800">
                  Aprobados
                </p>
                <p className="font-heading text-xl font-semibold text-blue-800">
                  {approvedCount}
                </p>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-red-800">
                  Rechazados
                </p>
                <p className="font-heading text-xl font-semibold text-red-800">
                  {rejectedCount}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/"
                className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px sm:w-auto"
              >
                Nueva solicitud
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px sm:w-auto"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-[22px] border border-[#d8e2ef] bg-white p-4 shadow-lg shadow-slate-200/70 sm:rounded-[24px]">
          <div className="mb-4 flex flex-col gap-1 border-b border-[#e3ebf5] pb-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-heading text-lg font-semibold text-[#0f2747]">
              Panel de solicitudes
            </h2>
            <p className="text-xs leading-5 text-slate-500">
              Filtra y administra cada registro recibido.
            </p>
          </div>

          <div className="mb-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-[#173b68]">
                Filtrar por estado
              </span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as "todos" | AppointmentStatus,
                  )
                }
                className="h-10 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
              >
                <option value="todos">Todos</option>
                <option value="pendiente">Pendientes</option>
                <option value="revisado">Agendados</option>
                <option value="aprobado">Aprobados</option>
                <option value="rechazado">Rechazados</option>
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-[#173b68]">
                Filtrar por motivo
              </span>
              <select
                value={reasonFilter}
                onChange={(event) =>
                  setReasonFilter(event.target.value as "todos" | PermissionReason)
                }
                className="h-10 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
              >
                <option value="todos">Todos los motivos</option>
                {permissionReasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-[#173b68]">
                Filtrar por móvil
              </span>
              <input
                type="search"
                value={vehicleFilter}
                onChange={(event) => setVehicleFilter(event.target.value)}
                className="h-10 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-sm text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                placeholder="Número de móvil"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-[#173b68]">
                Filtrar por fecha de registro
              </span>
              <select
                value={dateFilter}
                onChange={(event) =>
                  setDateFilter(event.target.value as DateFilter)
                }
                className="h-10 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
              >
                <option value="todos">Todas las fechas</option>
                <option value="ultimos7">Últimos 7 días</option>
                <option value="ultimos15">Últimos 15 días</option>
                <option value="ultimos30">Últimos 30 días</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </label>

            <div className="flex h-10 items-center rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] px-4 text-xs font-semibold text-slate-600">
              Mostrando {filteredAppointments.length} de {appointments.length}
            </div>
          </div>

          {dateFilter === "personalizado" ? (
            <div className="mb-6 grid gap-3 rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] p-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#173b68]">
                  Desde
                </span>
                <input
                  type="date"
                  value={customDateRange.startDate}
                  onChange={(event) =>
                    setCustomDateRange((currentRange) => ({
                      ...currentRange,
                      startDate: event.target.value,
                    }))
                  }
                  className="h-12 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#173b68]">
                  Hasta
                </span>
                <input
                  type="date"
                  value={customDateRange.endDate}
                  onChange={(event) =>
                    setCustomDateRange((currentRange) => ({
                      ...currentRange,
                      endDate: event.target.value,
                    }))
                  }
                  className="h-12 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                />
              </label>
            </div>
          ) : null}

          {isLoadingAppointments ? (
            <div className="mb-6 rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] px-4 py-3 text-sm font-medium text-[#173b68]">
              Cargando solicitudes desde la base de datos...
            </div>
          ) : null}

          {emailNotice ? (
            <div
              className={`mb-6 flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm font-semibold shadow-lg ${
                emailNotice.status === "sending"
                  ? "border-blue-200 bg-blue-100 text-blue-900 shadow-blue-900/10"
                  : "border-green-300 bg-green-100 text-green-900 shadow-green-900/10"
              }`}
            >
              {emailNotice.status === "sending" ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-700 text-xs font-bold text-white">
                  ✓
                </span>
              )}
              <span>{emailNotice.message}</span>
            </div>
          ) : null}

          {appointmentsError ? (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {appointmentsError}
            </div>
          ) : null}

          <div className="mb-3 flex flex-col gap-2 border-b border-[#e3ebf5] pb-3 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                downloadExcel(
                  filteredAppointments,
                  "agendamientos-filtrados.xls",
                )
              }
              disabled={filteredAppointments.length === 0}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-emerald-500 bg-white px-4 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50 active:translate-y-px disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
            >
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-emerald-500 text-[9px] font-bold leading-none text-white">
                X
              </span>
              Exportar lo mostrado
            </button>
            <button
              type="button"
              onClick={() =>
                downloadExcel(appointments, "agendamientos-totales.xls")
              }
              disabled={appointments.length === 0}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-emerald-500 bg-white px-4 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50 active:translate-y-px disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
            >
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-emerald-500 text-[9px] font-bold leading-none text-white">
                X
              </span>
              Exportar todo
            </button>
          </div>

          {filteredAppointments.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[#d8e2ef]">
              <div className="max-h-[62dvh] overflow-auto">
                <table className="min-w-[1040px] w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-[#d7e7f8] text-[10px] uppercase tracking-[0.12em] text-[#0f2747] shadow-[0_2px_0_#b7cce4]">
                    <tr>
                      <th className="min-w-28 px-2.5 py-2 font-semibold">Ticket</th>
                      <th className="min-w-36 px-2.5 py-2 font-semibold">Conductor</th>
                      <th className="min-w-14 px-2.5 py-2 font-semibold">Móvil</th>
                      <th className="min-w-24 px-2.5 py-2 font-semibold">
                        Fecha requerida
                      </th>
                      <th className="min-w-24 px-2.5 py-2 font-semibold">Motivo</th>
                      <th className="min-w-40 px-2.5 py-2 font-semibold">Detalle fechas</th>
                      <th className="min-w-44 px-2.5 py-2 font-semibold">Correo</th>
                      <th className="min-w-28 px-2.5 py-2 font-semibold">Teléfono</th>
                      <th className="min-w-28 px-2.5 py-2 font-semibold">Registro</th>
                      <th className="min-w-36 px-2.5 py-2 font-semibold">Ejecutivo</th>
                      <th className="min-w-32 px-2.5 py-2 font-semibold">Estado</th>
                      <th className="min-w-20 px-2.5 py-2 font-semibold">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e3ebf5]">
                    {filteredAppointments.map((appointment) => (
                      <tr
                        key={appointment.id}
                        className="align-top transition hover:bg-[#f8fbff]"
                      >
                        <td className="px-2.5 py-2 font-semibold text-[#0b5cab]">
                          {getAppointmentTicketLabel(appointment)}
                        </td>
                        <td className="px-2.5 py-2 font-semibold text-[#0f2747]">
                          {appointment.driverName}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          {appointment.vehicleNumber}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          {formatDate(appointment.appointmentDate)}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          {getPermissionReasonLabel(
                            appointment.appointmentReason,
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          {getRequestDateDetail(appointment) ? (
                            <div className="max-w-40 rounded-xl border border-[#d8e2ef] bg-[#f8fbff] px-2 py-1">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Detalle
                              </p>
                              <p className="text-[11px] font-semibold leading-3.5 text-[#173b68]">
                                {getRequestDateDetail(appointment)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400">No aplica</span>
                          )}
                        </td>
                        <td className="max-w-[170px] break-words px-2.5 py-2 text-slate-700">
                          {appointment.email}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          {appointment.phone}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          {formatCreatedAt(appointment.createdAt)}
                        </td>
                        <td className="px-2.5 py-2">
                          {appointmentAllowsExecutive(appointment) ? (
                            <select
                              value={appointment.assignedExecutive}
                              onChange={(event) =>
                                updateAssignedExecutive(
                                  appointment.id,
                                  event.target.value as Executive | "",
                                )
                              }
                              className="h-8 min-w-32 rounded-2xl border border-[#d8e2ef] bg-white px-2.5 text-xs font-semibold text-[#173b68] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                            >
                              <option value="">Sin asignar</option>
                              {executives.map((executive) => (
                                <option key={executive} value={executive}>
                                  {executive}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-flex h-8 min-w-32 items-center rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] px-2.5 text-xs font-semibold text-slate-400">
                              No aplica
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2">
                          <select
                            value={appointment.status}
                            onChange={(event) =>
                              updateStatus(
                                appointment.id,
                                event.target.value as AppointmentStatus,
                              )
                            }
                            className={`h-8 min-w-28 rounded-full border px-2.5 text-xs font-semibold outline-none transition focus:ring-4 focus:ring-blue-100 ${statusStyles[appointment.status]}`}
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="revisado">Agendado</option>
                            <option value="aprobado">Aprobado</option>
                            <option value="rechazado">Rechazado</option>
                          </select>
                        </td>
                        <td className="px-2.5 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              const shouldDelete = window.confirm(
                                "¿Estás seguro de que deseas eliminar esta solicitud?",
                              );

                              if (shouldDelete) {
                                removeAppointment(appointment.id);
                              }
                            }}
                            className="h-8 rounded-2xl border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 active:translate-y-px"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#b9c9dd] bg-[#f8fbff] px-5 py-10 text-center">
              <h3 className="font-heading text-xl font-semibold text-[#0f2747]">
                No hay solicitudes para mostrar
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Cuando se registre una cita desde la primera vista, aparecerá
                en este panel administrable.
              </p>
              <Link
                href="/"
                className="mt-5 inline-flex h-12 items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
              >
                Crear solicitud
              </Link>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
