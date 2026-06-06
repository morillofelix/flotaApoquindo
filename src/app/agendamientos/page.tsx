"use client";

import {
  APPOINTMENTS_STORAGE_KEY,
  type Appointment,
  type AppointmentStatus,
  getPermissionReasonLabel,
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

const adminCredentials = {
  user: "ejecutivo",
  password: "Apoquindo2026",
};

function loadAppointments() {
  try {
    const storedValue = window.localStorage.getItem(APPOINTMENTS_STORAGE_KEY);
    return storedValue ? (JSON.parse(storedValue) as Appointment[]) : [];
  } catch {
    return [];
  }
}

function persistAppointments(appointments: Appointment[]) {
  window.localStorage.setItem(
    APPOINTMENTS_STORAGE_KEY,
    JSON.stringify(appointments),
  );
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginValues, setLoginValues] = useState({ user: "", password: "" });
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    setAppointments(loadAppointments());
    setIsAuthenticated(
      window.sessionStorage.getItem("apoquindo-admin-auth") === "true",
    );
  }, []);

  const filteredAppointments = useMemo(() => {
    if (statusFilter === "todos") {
      return appointments;
    }

    return appointments.filter(
      (appointment) => appointment.status === statusFilter,
    );
  }, [appointments, statusFilter]);

  const pendingCount = appointments.filter(
    (appointment) => appointment.status === "pendiente",
  ).length;

  function updateStatus(id: string, status: AppointmentStatus) {
    const updatedAppointments = appointments.map((appointment) =>
      appointment.id === id ? { ...appointment, status } : appointment,
    );

    setAppointments(updatedAppointments);
    persistAppointments(updatedAppointments);
  }

  function removeAppointment(id: string) {
    const updatedAppointments = appointments.filter(
      (appointment) => appointment.id !== id,
    );

    setAppointments(updatedAppointments);
    persistAppointments(updatedAppointments);
  }

  function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      loginValues.user.trim() === adminCredentials.user &&
      loginValues.password === adminCredentials.password
    ) {
      window.sessionStorage.setItem("apoquindo-admin-auth", "true");
      setIsAuthenticated(true);
      setLoginError("");
      setLoginValues({ user: "", password: "" });
      return;
    }

    setLoginError("Usuario o clave incorrectos.");
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
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
            >
              Ingresar
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

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex flex-col gap-2 sm:min-w-64">
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

            <div className="rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] px-4 py-3 text-sm text-slate-600">
              Mostrando {filteredAppointments.length} de {appointments.length}
            </div>
          </div>

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
            <div className="grid gap-4">
              {filteredAppointments.map((appointment) => (
                <article
                  key={appointment.id}
                  className="rounded-2xl border border-[#d8e2ef] bg-white p-4 shadow-sm shadow-slate-100 sm:p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-heading text-xl font-semibold text-[#0f2747]">
                          {appointment.driverName}
                        </h3>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[appointment.status]}`}
                        >
                          {statusLabels[appointment.status]}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        Móvil {appointment.vehicleNumber} registrado el{" "}
                        {formatCreatedAt(appointment.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <select
                        value={appointment.status}
                        onChange={(event) =>
                          updateStatus(
                            appointment.id,
                            event.target.value as AppointmentStatus,
                          )
                        }
                        className="h-11 rounded-2xl border border-[#d8e2ef] bg-white px-4 text-sm font-semibold text-[#173b68] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="revisado">Revisado</option>
                        <option value="rechazado">Rechazado</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeAppointment(appointment.id)}
                        className="h-11 rounded-2xl border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 active:translate-y-px"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  <dl className="mt-5 grid gap-3 border-t border-[#e3ebf5] pt-5 sm:grid-cols-2">
                    <div className="rounded-2xl bg-[#f8fbff] p-4">
                      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Fecha requerida
                      </dt>
                      <dd className="mt-1 font-semibold text-[#0f2747]">
                        {formatDate(appointment.appointmentDate)}
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-[#f8fbff] p-4">
                      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Motivo
                      </dt>
                      <dd className="mt-1 font-semibold text-[#0f2747]">
                        {getPermissionReasonLabel(
                          appointment.appointmentReason,
                        )}
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-[#f8fbff] p-4">
                      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Correo
                      </dt>
                      <dd className="mt-1 break-words font-semibold text-[#0f2747]">
                        {appointment.email}
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-[#f8fbff] p-4">
                      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Teléfono
                      </dt>
                      <dd className="mt-1 font-semibold text-[#0f2747]">
                        {appointment.phone}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#b9c9dd] bg-[#f8fbff] px-5 py-10 text-center">
              <h3 className="font-heading text-xl font-semibold text-[#0f2747]">
                No hay solicitudes para mostrar
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Cuando se registre un permiso desde la primera vista, aparecerá
                en este panel administrable.
              </p>
              <a
                href="/"
                className="mt-5 inline-flex h-12 items-center justify-center rounded-2xl bg-[#0b5cab] px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084a8c] active:translate-y-px"
              >
                Crear solicitud
              </a>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
