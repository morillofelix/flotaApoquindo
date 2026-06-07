"use client";

import {
  type Appointment,
  type AppointmentStatus,
  type PermissionReason,
  getPermissionReasonLabel,
  permissionReasons,
} from "@/lib/appointments";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const statusLabels: Record<AppointmentStatus, string> = {
  pendiente: "Pendiente",
  revisado: "Revisado",
  rechazado: "Rechazado",
};

const statusStyles: Record<AppointmentStatus, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-800",
  revisado: "border-green-200 bg-green-50 text-green-800",
  rechazado: "border-red-200 bg-red-50 text-red-800",
};

type DateFilter =
  | "todos"
  | "ultimos7"
  | "ultimos15"
  | "ultimos30"
  | "personalizado";

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
    .map(
      (appointment) => `
        <tr>
          <td>${escapeHtml(appointment.id)}</td>
          <td>${escapeHtml(appointment.driverName)}</td>
          <td>${escapeHtml(appointment.vehicleNumber)}</td>
          <td>${escapeHtml(formatDate(appointment.appointmentDate))}</td>
          <td>${escapeHtml(getPermissionReasonLabel(appointment.appointmentReason))}</td>
          <td>${escapeHtml(appointment.email)}</td>
          <td>${escapeHtml(appointment.phone)}</td>
          <td>${escapeHtml(statusLabels[appointment.status])}</td>
          <td>${escapeHtml(formatCreatedAt(appointment.createdAt))}</td>
        </tr>`,
    )
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
              <th>Correo</th>
              <th>Teléfono</th>
              <th>Estado</th>
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

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [statusFilter, setStatusFilter] = useState<"todos" | AppointmentStatus>(
    "todos",
  );
  const [reasonFilter, setReasonFilter] = useState<"todos" | PermissionReason>(
    "todos",
  );
  const [dateFilter, setDateFilter] = useState<DateFilter>("todos");
  const [customDateRange, setCustomDateRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginValues, setLoginValues] = useState({ user: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");

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

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      const matchesStatus =
        statusFilter === "todos" || appointment.status === statusFilter;
      const matchesReason =
        reasonFilter === "todos" ||
        appointment.appointmentReason === reasonFilter;
      const matchesDate = isWithinDateFilter(
        appointment.createdAt,
        dateFilter,
        customDateRange.startDate,
        customDateRange.endDate,
      );

      return matchesStatus && matchesReason && matchesDate;
    });
  }, [appointments, customDateRange, dateFilter, reasonFilter, statusFilter]);

  const pendingCount = appointments.filter(
    (appointment) => appointment.status === "pendiente",
  ).length;

  async function updateStatus(id: string, status: AppointmentStatus) {
    const previousAppointments = appointments;
    const updatedAppointments = appointments.map((appointment) =>
      appointment.id === id ? { ...appointment, status } : appointment,
    );

    setAppointments(updatedAppointments);

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
    } catch {
      setAppointments(previousAppointments);
      setAppointmentsError("No se pudo actualizar el estado.");
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
              <input
                type="password"
                value={loginValues.password}
                onChange={(event) =>
                  setLoginValues((currentValues) => ({
                    ...currentValues,
                    password: event.target.value,
                  }))
                }
                className="h-12 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                placeholder="Clave de acceso"
              />
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
    <main className="min-h-[100dvh] bg-[#eef3f9] px-4 py-6 text-[#0f2747] sm:px-6 sm:py-10 lg:px-10">
      <section className="mx-auto w-full max-w-6xl">
        <header className="mb-5 rounded-[24px] border border-[#d8e2ef] bg-white p-5 shadow-xl shadow-slate-200/80 sm:rounded-[28px] sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0b5cab]">
                Administración de citas
              </p>
              <h1 className="mt-3 font-heading text-3xl font-semibold leading-tight tracking-tight text-[#0f2747] sm:text-4xl">
                Agendamientos recibidos
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Vista para que el ejecutivo revise, atienda y actualice el
                estado de las solicitudes enviadas desde el formulario.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px sm:w-auto"
              >
                Nueva solicitud
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-[#d8e2ef] px-6 text-sm font-semibold text-[#173b68] transition hover:bg-[#f8fbff] active:translate-y-px sm:w-auto"
              >
                Cerrar sesión
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 border-t border-[#e3ebf5] pt-6 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#f8fbff] p-4">
              <p className="text-sm font-semibold text-slate-500">
                Total registrados
              </p>
              <p className="mt-1 font-heading text-3xl font-semibold text-[#0f2747]">
                {appointments.length}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f8fbff] p-4">
              <p className="text-sm font-semibold text-slate-500">
                Pendientes
              </p>
              <p className="mt-1 font-heading text-3xl font-semibold text-[#0f2747]">
                {pendingCount}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f8fbff] p-4">
              <p className="text-sm font-semibold text-slate-500">
                En pantalla
              </p>
              <p className="mt-1 font-heading text-3xl font-semibold text-[#0f2747]">
                {filteredAppointments.length}
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-[24px] border border-[#d8e2ef] bg-white p-5 shadow-xl shadow-slate-200/80 sm:rounded-[28px] sm:p-8">
          <div className="mb-7 border-b border-[#e3ebf5] pb-6">
            <h2 className="font-heading text-2xl font-semibold text-[#0f2747]">
              Panel de solicitudes
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Filtra por estado y administra cada registro recibido.
            </p>
          </div>

          <div className="mb-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Filtrar por estado
              </span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as "todos" | AppointmentStatus,
                  )
                }
                className="h-12 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
              >
                <option value="todos">Todos</option>
                <option value="pendiente">Pendientes</option>
                <option value="revisado">Revisados</option>
                <option value="rechazado">Rechazados</option>
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#173b68]">
                Filtrar por motivo
              </span>
              <select
                value={reasonFilter}
                onChange={(event) =>
                  setReasonFilter(event.target.value as "todos" | PermissionReason)
                }
                className="h-12 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
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
              <span className="text-sm font-semibold text-[#173b68]">
                Filtrar por fecha de registro
              </span>
              <select
                value={dateFilter}
                onChange={(event) =>
                  setDateFilter(event.target.value as DateFilter)
                }
                className="h-12 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
              >
                <option value="todos">Todas las fechas</option>
                <option value="ultimos7">Últimos 7 días</option>
                <option value="ultimos15">Últimos 15 días</option>
                <option value="ultimos30">Últimos 30 días</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </label>

            <div className="rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] px-4 py-3 text-sm text-slate-600">
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

          {appointmentsError ? (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {appointmentsError}
            </div>
          ) : null}

          <div className="mb-6 flex flex-col gap-3 border-b border-[#e3ebf5] pb-6 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                downloadExcel(
                  filteredAppointments,
                  "agendamientos-filtrados.xls",
                )
              }
              disabled={filteredAppointments.length === 0}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              Descargar lo mostrado
            </button>
            <button
              type="button"
              onClick={() =>
                downloadExcel(appointments, "agendamientos-totales.xls")
              }
              disabled={appointments.length === 0}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#d8e2ef] px-6 text-sm font-semibold text-[#173b68] transition hover:bg-[#f8fbff] active:translate-y-px disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Descargar todo
            </button>
          </div>

          {filteredAppointments.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[#d8e2ef]">
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
                  <thead className="bg-[#f8fbff] text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Ticket</th>
                      <th className="px-4 py-3 font-semibold">Conductor</th>
                      <th className="px-4 py-3 font-semibold">Móvil</th>
                      <th className="px-4 py-3 font-semibold">
                        Fecha requerida
                      </th>
                      <th className="px-4 py-3 font-semibold">Motivo</th>
                      <th className="px-4 py-3 font-semibold">Correo</th>
                      <th className="px-4 py-3 font-semibold">Teléfono</th>
                      <th className="px-4 py-3 font-semibold">Registro</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 font-semibold">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e3ebf5]">
                    {filteredAppointments.map((appointment) => (
                      <tr
                        key={appointment.id}
                        className="align-top transition hover:bg-[#f8fbff]"
                      >
                        <td className="px-4 py-4 font-semibold text-[#0b5cab]">
                          {appointment.id}
                        </td>
                        <td className="px-4 py-4 font-semibold text-[#0f2747]">
                          {appointment.driverName}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {appointment.vehicleNumber}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {formatDate(appointment.appointmentDate)}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {getPermissionReasonLabel(
                            appointment.appointmentReason,
                          )}
                        </td>
                        <td className="max-w-[220px] break-words px-4 py-4 text-slate-700">
                          {appointment.email}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {appointment.phone}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {formatCreatedAt(appointment.createdAt)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            <span
                              className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[appointment.status]}`}
                            >
                              {statusLabels[appointment.status]}
                            </span>
                            <select
                              value={appointment.status}
                              onChange={(event) =>
                                updateStatus(
                                  appointment.id,
                                  event.target.value as AppointmentStatus,
                                )
                              }
                              className="h-10 rounded-2xl border border-[#d8e2ef] bg-white px-3 text-sm font-semibold text-[#173b68] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                            >
                              <option value="pendiente">Pendiente</option>
                              <option value="revisado">Revisado</option>
                              <option value="rechazado">Rechazado</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => removeAppointment(appointment.id)}
                            className="h-10 rounded-2xl border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 active:translate-y-px"
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
