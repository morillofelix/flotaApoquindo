"use client";

import {
  type Appointment,
  type AppointmentReasonConfig,
  type AppointmentStatus,
  type Executive,
  type ExecutiveConfig,
  type PermissionReason,
  defaultAppointmentReasons,
  defaultExecutives,
  getAppointmentTicketLabel,
} from "@/lib/appointments";
import {
  loadAppointmentReasons,
  loadAppointments,
  loadExecutives,
} from "@/lib/agendamientos-admin";
import { adminFetchInit } from "@/lib/admin-fetch";
import { matchesVehicleNumberSearch } from "@/lib/maintainer-search";
import {
  type DateFilter,
  type EmailNotice,
  appointmentAllowsExecutive,
  downloadExcel,
  formatCreatedAt,
  formatDate,
  getRequestDateDetail,
  isWithinDateFilter,
  sendExecutiveAssignmentEmails,
  sendCalendarCancelToExecutive,
  sendCancellationToRequester,
  sendDecisionEmail,
  sendAppointmentDateChangeEmails,
  shouldSendCalendarInvite,
  shouldSendCancellationEmails,
  shouldSendDecisionEmail,
  statusStyles,
} from "@/lib/agendamientos-appointments";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import AppointmentsCalendar from "@/components/agendamientos/AppointmentsCalendar";
import DataRefreshButton from "@/components/agendamientos/DataRefreshButton";
import ExecutiveDailyLimitAlert from "@/components/agendamientos/ExecutiveDailyLimitAlert";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { getExecutiveDailyLimitStatus } from "@/lib/executive-daily-limit";
import {
  buildDatePatchFromFieldChange,
  buildDateChangePreviewLabel,
  canEditAppointmentDates,
  getAdminDateChangeWarning,
  type AppointmentDatePatch,
} from "@/lib/appointment-date-edit";

function AppointmentsPageContent() {
  const { confirm, dialog } = useConfirmAction();
  const searchParams = useSearchParams();
  const isCalendarView = searchParams.get("vista") === "calendario";
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reasons, setReasons] = useState<AppointmentReasonConfig[]>(
    defaultAppointmentReasons,
  );
  const [executiveOptions, setExecutiveOptions] =
    useState<ExecutiveConfig[]>(defaultExecutives);
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
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [emailNotice, setEmailNotice] = useState<EmailNotice>(null);
  const [executiveAssignmentPrompt, setExecutiveAssignmentPrompt] = useState<{
    appointmentId: string;
    assignedExecutive: Executive | "";
    willSendEmail: boolean;
  } | null>(null);
  const [isConfirmingExecutive, setIsConfirmingExecutive] = useState(false);
  const [dailyLimitAlert, setDailyLimitAlert] = useState<{
    executiveName: string;
    appointmentDate: string;
    currentCount: number;
    max: number;
  } | null>(null);
  const [dateEditPrompt, setDateEditPrompt] = useState<{
    appointment: Appointment;
    patch: AppointmentDatePatch;
    previewLabel: string;
  } | null>(null);
  const [isSavingDateChange, setIsSavingDateChange] = useState(false);

  const reloadAppointmentsData = useCallback(async () => {
    const [loadedAppointments, loadedReasons, loadedExecutives] =
      await Promise.all([
        loadAppointments(),
        loadAppointmentReasons(),
        loadExecutives(),
      ]);

    setAppointments(loadedAppointments);
    setReasons(loadedReasons);
    setExecutiveOptions(loadedExecutives);
    setAppointmentsError("");
  }, []);

  const shouldPauseAutoRefresh =
    isConfirmingExecutive ||
    executiveAssignmentPrompt !== null ||
    isLoadingAppointments ||
    dateEditPrompt !== null ||
    isSavingDateChange;

  const {
    refresh: refreshAppointmentsData,
    isRefreshing: isRefreshingAppointments,
    lastUpdatedAt: appointmentsLastUpdatedAt,
  } = useAutoRefresh({
    onRefresh: reloadAppointmentsData,
    pause: shouldPauseAutoRefresh,
  });

  useEffect(() => {
    setIsLoadingAppointments(true);
    setAppointmentsError("");

    reloadAppointmentsData()
      .catch(() =>
        setAppointmentsError("No se pudieron cargar las solicitudes."),
      )
      .finally(() => setIsLoadingAppointments(false));
  }, [reloadAppointmentsData]);

  const activeReasons = useMemo(
    () => reasons.filter((reason) => reason.isActive),
    [reasons],
  );
  const activeExecutives = useMemo(
    () =>
      executiveOptions.filter(
        (executive) => executive.isActive && executive.email.trim().length > 0,
      ),
    [executiveOptions],
  );

  useEffect(() => {
    if (emailNotice?.status !== "sent") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setEmailNotice(null);
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [emailNotice]);

  useEffect(() => {
    if (!dailyLimitAlert) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDailyLimitAlert(null);
    }, 7000);

    return () => window.clearTimeout(timeoutId);
  }, [dailyLimitAlert]);

  const filteredAppointments = useMemo(() => {
    const normalizedVehicleFilter = vehicleFilter.trim();

    return appointments.filter((appointment) => {
      const matchesStatus =
        statusFilter === "todos" || appointment.status === statusFilter;
      const matchesReason =
        reasonFilter === "todos" ||
        appointment.appointmentReason === reasonFilter;
      const matchesVehicle =
        normalizedVehicleFilter === "" ||
        matchesVehicleNumberSearch(
          appointment.vehicleNumber,
          normalizedVehicleFilter,
        );
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

  function setStatusFilterFromIndicator(
    nextFilter: "todos" | AppointmentStatus,
  ) {
    setStatusFilter(nextFilter);
  }

  function indicatorCardClass(isActive: boolean, baseClass: string) {
    return `${baseClass} rounded-2xl px-3 py-2 text-left transition hover:-translate-y-px active:translate-y-0 ${
      isActive
        ? "ring-2 ring-[#0b5cab] ring-offset-2 shadow-md"
        : "hover:shadow-md"
    }`;
  }

  async function updateStatus(id: string, status: AppointmentStatus) {
    const previousAppointments = appointments;
    const currentAppointment = appointments.find(
      (appointment) => appointment.id === id,
    );

    if (!currentAppointment) {
      return;
    }

    const updatedAppointment: Appointment = { ...currentAppointment, status };
    const updatedAppointments = appointments.map((appointment) =>
      appointment.id === id ? updatedAppointment : appointment,
    );

    setAppointments(updatedAppointments);
    setAppointmentsError("");
    setEmailNotice(null);

    try {
      const response = await fetch(`/api/appointments/${id}`, {
        ...adminFetchInit,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("No se pudo actualizar la solicitud.");
      }

      if (shouldSendCalendarInvite(updatedAppointment)) {
        try {
          setEmailNotice({
            status: "sending",
            message: "Enviando cita y confirmación...",
          });
          await sendExecutiveAssignmentEmails(updatedAppointment);
          setEmailNotice({
            status: "sent",
            message: "Correos enviados.",
          });
        } catch {
          setEmailNotice(null);
          setAppointmentsError(
            "La solicitud quedó agendada, pero no se pudieron enviar todos los correos.",
          );
        }
      }

      if (shouldSendCancellationEmails(updatedAppointment)) {
        try {
          setEmailNotice({
            status: "sending",
            message: "Enviando correos de cancelación...",
          });
          await sendCancellationToRequester(updatedAppointment);

          if (updatedAppointment.assignedExecutive) {
            await sendCalendarCancelToExecutive(updatedAppointment);
          }

          setEmailNotice({
            status: "sent",
            message: "Cancelación notificada por correo.",
          });
        } catch {
          setEmailNotice(null);
          setAppointmentsError(
            "La solicitud quedó cancelada, pero no se pudieron enviar todos los correos.",
          );
        }
      } else if (shouldSendDecisionEmail(updatedAppointment)) {
        try {
          setEmailNotice({
            status: "sending",
            message:
              status === "aprobado"
                ? "Enviando correo de aprobación..."
                : "Enviando correo de rechazo...",
          });
          await sendDecisionEmail(updatedAppointment);
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

  function requestExecutiveAssignment(
    id: string,
    assignedExecutive: Executive | "",
  ) {
    const currentAppointment = appointments.find(
      (appointment) => appointment.id === id,
    );

    if (!currentAppointment) {
      return;
    }

    if (currentAppointment.assignedExecutive === assignedExecutive) {
      setExecutiveAssignmentPrompt(null);
      return;
    }

    if (assignedExecutive !== "") {
      const executive = executiveOptions.find(
        (option) => option.name === assignedExecutive,
      );
      const limitStatus = getExecutiveDailyLimitStatus(
        executive,
        appointments,
        currentAppointment,
        assignedExecutive,
      );

      if (limitStatus.blocked) {
        setExecutiveAssignmentPrompt(null);
        setDailyLimitAlert({
          executiveName: limitStatus.executiveName,
          appointmentDate: limitStatus.appointmentDate,
          currentCount: limitStatus.currentCount,
          max: limitStatus.max,
        });
        return;
      }
    }

    const nextStatusForPreview =
      assignedExecutive !== ""
        ? ("revisado" as const)
        : currentAppointment.status;

    const appointmentWithSelection: Appointment = {
      ...currentAppointment,
      assignedExecutive,
      status: nextStatusForPreview,
    };

    setExecutiveAssignmentPrompt({
      appointmentId: id,
      assignedExecutive,
      willSendEmail: shouldSendCalendarInvite(appointmentWithSelection),
    });
  }

  function cancelExecutiveAssignment() {
    if (isConfirmingExecutive) {
      return;
    }

    setExecutiveAssignmentPrompt(null);
  }

  async function confirmExecutiveAssignment() {
    if (!executiveAssignmentPrompt) {
      return;
    }

    const { appointmentId: id, assignedExecutive } = executiveAssignmentPrompt;
    const previousAppointments = appointments;
    const currentAppointment = appointments.find(
      (appointment) => appointment.id === id,
    );

    if (!currentAppointment) {
      return;
    }

    if (assignedExecutive !== "") {
      const executive = executiveOptions.find(
        (option) => option.name === assignedExecutive,
      );
      const limitStatus = getExecutiveDailyLimitStatus(
        executive,
        appointments,
        currentAppointment,
        assignedExecutive,
      );

      if (limitStatus.blocked) {
        setExecutiveAssignmentPrompt(null);
        setDailyLimitAlert({
          executiveName: limitStatus.executiveName,
          appointmentDate: limitStatus.appointmentDate,
          currentCount: limitStatus.currentCount,
          max: limitStatus.max,
        });
        return;
      }
    }

    const nextStatus: AppointmentStatus =
      assignedExecutive !== ""
        ? "revisado"
        : currentAppointment.status === "revisado"
          ? "pendiente"
          : currentAppointment.status;

    const appointmentToInvite: Appointment = {
      ...currentAppointment,
      assignedExecutive,
      status: nextStatus,
    };

    const updatedAppointments = appointments.map((appointment) =>
      appointment.id === id ? appointmentToInvite : appointment,
    );

    setIsConfirmingExecutive(true);
    setAppointments(updatedAppointments);
    setAppointmentsError("");
    setEmailNotice(null);

    try {
      const patchBody = {
        assignedExecutive,
        status: appointmentToInvite.status,
      };

      const response = await fetch(`/api/appointments/${id}`, {
        ...adminFetchInit,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patchBody),
      });

      if (!response.ok) {
        throw new Error("No se pudo asignar el ejecutivo.");
      }

      const patchData = (await response.json()) as { appointment?: Appointment };
      const savedAppointment = patchData.appointment ?? appointmentToInvite;

      setAppointments((currentAppointments) =>
        currentAppointments.map((appointment) =>
          appointment.id === id ? savedAppointment : appointment,
        ),
      );
      setExecutiveAssignmentPrompt(null);

      if (shouldSendCalendarInvite(savedAppointment)) {
        try {
          setEmailNotice({
            status: "sending",
            message: "Enviando cita y confirmación...",
          });
          await sendExecutiveAssignmentEmails(savedAppointment);
          setEmailNotice({
            status: "sent",
            message: "Correos enviados.",
          });
        } catch {
          setEmailNotice(null);
          setAppointmentsError(
            "El ejecutivo quedó asignado, pero no se pudieron enviar todos los correos.",
          );
        }
      }
    } catch {
      setAppointments(previousAppointments);
      setAppointmentsError("No se pudo asignar el ejecutivo.");
    } finally {
      setIsConfirmingExecutive(false);
    }
  }

  function getReasonForAppointment(appointment: Appointment) {
    return reasons.find((reason) => reason.value === appointment.appointmentReason);
  }

  function requestDateFieldChange(
    appointment: Appointment,
    field:
      | "appointmentDate"
      | "vacationStartDate"
      | "permitStartDate"
      | "permitDate"
      | "permitStartTime"
      | "permitEndTime",
    value: string,
  ) {
    const patch = buildDatePatchFromFieldChange(
      appointment,
      getReasonForAppointment(appointment),
      field,
      value,
    );

    if (!patch) {
      return;
    }

    setDateEditPrompt({
      appointment,
      patch,
      previewLabel: buildDateChangePreviewLabel(patch),
    });
  }

  function cancelDateChange() {
    if (isSavingDateChange) {
      return;
    }

    setDateEditPrompt(null);
  }

  async function confirmDateChange() {
    if (!dateEditPrompt) {
      return;
    }

    const { appointment, patch } = dateEditPrompt;
    const previousAppointments = appointments;
    setIsSavingDateChange(true);
    setAppointmentsError("");
    setEmailNotice(null);

    try {
      const response = await fetch(`/api/appointments/${appointment.id}`, {
        ...adminFetchInit,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        throw new Error("No se pudo actualizar las fechas.");
      }

      const data = (await response.json()) as {
        appointment?: Appointment;
        dateChange?: {
          occurred: boolean;
          requiresCalendarCancel: boolean;
          requiresCalendarInvite: boolean;
          previousAppointment: Appointment;
        } | null;
      };

      const savedAppointment = data.appointment;

      if (!savedAppointment) {
        throw new Error("No se pudo actualizar las fechas.");
      }

      setAppointments((currentAppointments) =>
        currentAppointments.map((item) =>
          item.id === savedAppointment.id ? savedAppointment : item,
        ),
      );
      setDateEditPrompt(null);

      if (data.dateChange?.occurred) {
        try {
          setEmailNotice({
            status: "sending",
            message: "Actualizando fechas y notificando...",
          });
          await sendAppointmentDateChangeEmails(
            savedAppointment,
            data.dateChange.previousAppointment,
            {
              requiresCalendarCancel: data.dateChange.requiresCalendarCancel,
              requiresCalendarInvite: data.dateChange.requiresCalendarInvite,
            },
          );
          setEmailNotice({
            status: "sent",
            message: "Fechas actualizadas y notificaciones enviadas.",
          });
        } catch {
          setEmailNotice(null);
          setAppointmentsError(
            "Las fechas se guardaron, pero no se pudieron enviar todas las notificaciones.",
          );
        }
      }
    } catch {
      setAppointments(previousAppointments);
      setAppointmentsError("No se pudo actualizar las fechas.");
    } finally {
      setIsSavingDateChange(false);
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
        ...adminFetchInit,
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

  async function confirmRemoveAppointment(appointment: Appointment) {
    const confirmed = await confirm({
      title: "Eliminar solicitud",
      message: "¿Estás seguro de que deseas eliminar esta solicitud?",
      detail: `${getAppointmentTicketLabel(appointment)} — Móvil ${appointment.vehicleNumber}, ${appointment.driverName}. Esta acción no se puede deshacer.`,
      confirmLabel: "Sí, eliminar",
      tone: "danger",
    });

    if (confirmed) {
      await removeAppointment(appointment.id);
    }
  }

  if (isCalendarView) {
    return (
      <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
        <section className="mx-auto w-full max-w-[1540px]">
          {appointmentsError ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {appointmentsError}
            </div>
          ) : null}

          <AppointmentsCalendar
            appointments={appointments}
            executives={executiveOptions}
            reasons={reasons}
            isLoading={isLoadingAppointments}
            onRefresh={() => void refreshAppointmentsData()}
            isRefreshing={isRefreshingAppointments}
            lastUpdatedAt={appointmentsLastUpdatedAt}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      {dailyLimitAlert ? (
        <ExecutiveDailyLimitAlert
          executiveName={dailyLimitAlert.executiveName}
          appointmentDate={dailyLimitAlert.appointmentDate}
          currentCount={dailyLimitAlert.currentCount}
          max={dailyLimitAlert.max}
          onClose={() => setDailyLimitAlert(null)}
        />
      ) : null}
      <section className="mx-auto w-full max-w-[1540px]">
        <header className="relative mb-3 rounded-[22px] border border-[#b7cce4] bg-white p-4 shadow-lg shadow-slate-300/25 sm:rounded-[24px]">
          <div className="absolute right-4 top-4 z-10">
            <DataRefreshButton
              onRefresh={() => void refreshAppointmentsData()}
              isRefreshing={isRefreshingAppointments}
              lastUpdatedAt={appointmentsLastUpdatedAt}
              variant="toolbar"
            />
          </div>
          <div className="grid gap-4 pr-10 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b5cab]">
                Administración de citas
              </p>
              <h1 className="mt-1 font-heading text-2xl font-semibold leading-tight tracking-tight text-[#0f2747]">
                Agendamientos recibidos
              </h1>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:min-w-[600px]">
              <button
                type="button"
                onClick={() => setStatusFilterFromIndicator("todos")}
                aria-pressed={statusFilter === "todos"}
                className={indicatorCardClass(
                  statusFilter === "todos",
                  "bg-[#f8fbff]",
                )}
              >
                <p className="text-[11px] font-semibold text-slate-500">Total</p>
                <p className="font-heading text-xl font-semibold text-[#0f2747]">
                  {appointments.length}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilterFromIndicator("pendiente")}
                aria-pressed={statusFilter === "pendiente"}
                className={indicatorCardClass(
                  statusFilter === "pendiente",
                  "border border-amber-200 bg-amber-50",
                )}
              >
                <p className="text-[11px] font-semibold text-amber-800">
                  Pendientes
                </p>
                <p className="font-heading text-xl font-semibold text-amber-800">
                  {pendingCount}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilterFromIndicator("revisado")}
                aria-pressed={statusFilter === "revisado"}
                className={indicatorCardClass(
                  statusFilter === "revisado",
                  "border border-green-200 bg-green-50",
                )}
              >
                <p className="text-[11px] font-semibold text-green-800">
                  Agendados
                </p>
                <p className="font-heading text-xl font-semibold text-green-800">
                  {scheduledCount}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilterFromIndicator("aprobado")}
                aria-pressed={statusFilter === "aprobado"}
                className={indicatorCardClass(
                  statusFilter === "aprobado",
                  "border border-blue-200 bg-blue-50",
                )}
              >
                <p className="text-[11px] font-semibold text-blue-800">
                  Aprobados
                </p>
                <p className="font-heading text-xl font-semibold text-blue-800">
                  {approvedCount}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilterFromIndicator("rechazado")}
                aria-pressed={statusFilter === "rechazado"}
                className={indicatorCardClass(
                  statusFilter === "rechazado",
                  "border border-red-200 bg-red-50",
                )}
              >
                <p className="text-[11px] font-semibold text-red-800">
                  Rechazados
                </p>
                <p className="font-heading text-xl font-semibold text-red-800">
                  {rejectedCount}
                </p>
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-[22px] border border-[#b7cce4] bg-white p-4 shadow-lg shadow-slate-300/25 sm:rounded-[24px]">
          <div className="-m-4 mb-3 flex flex-col gap-1 rounded-t-[22px] border-b border-[#b7cce4] bg-[#d7e7f8] px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:rounded-t-[24px]">
            <h2 className="font-heading text-base font-semibold text-[#0f2747]">
              Panel de solicitudes
            </h2>
            <p className="text-[11px] leading-4 text-[#173b68]">
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
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              >
                <option value="todos">Todos</option>
                <option value="pendiente">Pendientes</option>
                <option value="revisado">Agendados</option>
                <option value="aprobado">Aprobados</option>
                <option value="rechazado">Rechazados</option>
                <option value="cancelado">Cancelados</option>
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
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              >
                <option value="todos">Todos los motivos</option>
                {activeReasons.map((reason) => (
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
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-4 text-sm text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
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
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-4 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              >
                <option value="todos">Todas las fechas</option>
                <option value="hoy">Hoy</option>
                <option value="ultimos7">Últimos 7 días</option>
                <option value="ultimos15">Últimos 15 días</option>
                <option value="ultimos30">Últimos 30 días</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </label>

            <div className="flex h-10 items-center rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-4 text-xs font-semibold text-slate-600">
              Mostrando {filteredAppointments.length} de {appointments.length}
            </div>
          </div>

          {dateFilter === "personalizado" ? (
            <div className="mb-6 grid gap-3 rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-4 sm:grid-cols-2">
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
                  className="h-12 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
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
                  className="h-12 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-4 text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                />
              </label>
            </div>
          ) : null}

          {isLoadingAppointments ? (
            <div className="mb-6 rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-4 py-3 text-sm font-medium text-[#173b68]">
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

          {dateEditPrompt ? (
            <div className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-900">
                Confirmar cambio de fecha
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-950">
                {getAdminDateChangeWarning(dateEditPrompt.appointment)}
              </p>
              <p className="mt-2 text-sm font-semibold text-amber-950">
                {dateEditPrompt.previewLabel}
              </p>
              <p className="mt-1 text-xs text-amber-900">
                Ticket {getAppointmentTicketLabel(dateEditPrompt.appointment)} ·
                Móvil {dateEditPrompt.appointment.vehicleNumber}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelDateChange}
                  disabled={isSavingDateChange}
                  className="inline-flex h-9 items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDateChange()}
                  disabled={isSavingDateChange}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-amber-600 px-4 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingDateChange ? "Guardando..." : "Confirmar cambio"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mb-3 flex flex-col gap-2 border-b border-[#c5d8eb] pb-3 sm:flex-row">
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
            <div className="overflow-hidden rounded-2xl border border-[#b7cce4]">
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
                      <th className="min-w-36 px-2.5 py-2 font-semibold">Ejecutivo</th>
                      <th className="min-w-32 px-2.5 py-2 font-semibold">Estado</th>
                      <th className="min-w-20 px-2.5 py-2 font-semibold">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c5d8eb]">
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
                          {formatCreatedAt(appointment.createdAt)}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          {appointment.appointmentReasonLabel}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          {appointment.reasonAllowsExecutiveAssignment &&
                          canEditAppointmentDates(appointment.status) ? (
                            <div className="max-w-40 rounded-xl border border-[#b7cce4] bg-[#f8fbff] px-2 py-2">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Fecha de atención
                              </p>
                              <input
                                key={`${appointment.id}-${appointment.appointmentDate}`}
                                type="date"
                                defaultValue={appointment.appointmentDate}
                                onChange={(event) =>
                                  requestDateFieldChange(
                                    appointment,
                                    "appointmentDate",
                                    event.target.value,
                                  )
                                }
                                className="mt-1 h-8 w-full rounded-xl border border-[#9fb8d9] bg-white px-2 text-xs text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                              />
                            </div>
                          ) : appointment.reasonUsesDateRange &&
                          canEditAppointmentDates(appointment.status) ? (
                            <div className="max-w-44 rounded-xl border border-[#b7cce4] bg-[#f8fbff] px-2 py-2">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Inicio (fin se ajusta)
                              </p>
                              <input
                                key={`${appointment.id}-${appointment.vacationStartDate}`}
                                type="date"
                                defaultValue={appointment.vacationStartDate}
                                onChange={(event) =>
                                  requestDateFieldChange(
                                    appointment,
                                    "vacationStartDate",
                                    event.target.value,
                                  )
                                }
                                className="mt-1 h-8 w-full rounded-xl border border-[#9fb8d9] bg-white px-2 text-xs text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                              />
                              <p className="mt-1 text-[11px] font-semibold text-[#173b68]">
                                Hasta {formatDate(appointment.vacationEndDate)}
                              </p>
                            </div>
                          ) : appointment.reasonUsesPermitDetails &&
                            appointment.permitType === "dias" &&
                            canEditAppointmentDates(appointment.status) ? (
                            <div className="max-w-44 rounded-xl border border-[#b7cce4] bg-[#f8fbff] px-2 py-2">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Inicio (fin se ajusta)
                              </p>
                              <input
                                key={`${appointment.id}-${appointment.permitStartDate}`}
                                type="date"
                                defaultValue={appointment.permitStartDate}
                                onChange={(event) =>
                                  requestDateFieldChange(
                                    appointment,
                                    "permitStartDate",
                                    event.target.value,
                                  )
                                }
                                className="mt-1 h-8 w-full rounded-xl border border-[#9fb8d9] bg-white px-2 text-xs text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                              />
                              <p className="mt-1 text-[11px] font-semibold text-[#173b68]">
                                Hasta {formatDate(appointment.permitEndDate)}
                              </p>
                            </div>
                          ) : appointment.reasonUsesPermitDetails &&
                            appointment.permitType === "horas" &&
                            canEditAppointmentDates(appointment.status) ? (
                            <div className="max-w-48 rounded-xl border border-[#b7cce4] bg-[#f8fbff] px-2 py-2">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Permiso por horas
                              </p>
                              <input
                                key={`${appointment.id}-${appointment.permitDate}`}
                                type="date"
                                defaultValue={appointment.permitDate}
                                onChange={(event) =>
                                  requestDateFieldChange(
                                    appointment,
                                    "permitDate",
                                    event.target.value,
                                  )
                                }
                                className="mt-1 h-8 w-full rounded-xl border border-[#9fb8d9] bg-white px-2 text-xs text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                              />
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <label className="flex flex-col gap-1">
                                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    Desde
                                  </span>
                                  <input
                                    key={`${appointment.id}-${appointment.permitStartTime}`}
                                    type="time"
                                    defaultValue={appointment.permitStartTime}
                                    onChange={(event) =>
                                      requestDateFieldChange(
                                        appointment,
                                        "permitStartTime",
                                        event.target.value,
                                      )
                                    }
                                    className="h-8 w-full rounded-xl border border-[#9fb8d9] bg-white px-2 text-xs text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    Hasta
                                  </span>
                                  <input
                                    key={`${appointment.id}-${appointment.permitEndTime}`}
                                    type="time"
                                    defaultValue={appointment.permitEndTime}
                                    onChange={(event) =>
                                      requestDateFieldChange(
                                        appointment,
                                        "permitEndTime",
                                        event.target.value,
                                      )
                                    }
                                    className="h-8 w-full rounded-xl border border-[#9fb8d9] bg-white px-2 text-xs text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                                  />
                                </label>
                              </div>
                            </div>
                          ) : appointment.reasonAllowsExecutiveAssignment ? (
                            <div className="max-w-40 rounded-xl border border-[#b7cce4] bg-[#f8fbff] px-2 py-1">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Cita
                              </p>
                              <p className="text-[11px] font-semibold leading-3.5 text-[#173b68]">
                                {formatDate(appointment.appointmentDate)}
                              </p>
                            </div>
                          ) : getRequestDateDetail(appointment) ? (
                            <div className="max-w-40 rounded-xl border border-[#b7cce4] bg-[#f8fbff] px-2 py-1">
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
                        <td className="px-2.5 py-2 align-top">
                          {appointmentAllowsExecutive(appointment) ? (
                            <div className="flex min-w-32 flex-col gap-2">
                              <select
                                value={appointment.assignedExecutive}
                                onChange={(event) =>
                                  requestExecutiveAssignment(
                                    appointment.id,
                                    event.target.value as Executive | "",
                                  )
                                }
                                className="h-8 w-full rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-2.5 text-xs font-semibold text-[#173b68] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                              >
                                <option value="">Sin asignar</option>
                                {activeExecutives.map((executive) => (
                                  <option key={executive.name} value={executive.name}>
                                    {executive.name}
                                  </option>
                                ))}
                              </select>

                              {executiveAssignmentPrompt?.appointmentId ===
                              appointment.id ? (
                                <div className="rounded-2xl border border-[#b7cce4] bg-white p-3 shadow-lg shadow-slate-300/25">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0b5cab]">
                                    Confirmar ejecutivo
                                  </p>
                                  <p className="mt-2 text-xs leading-5 text-[#173b68]">
                                    {executiveAssignmentPrompt.assignedExecutive ===
                                    "" ? (
                                      "¿Desea quitar el ejecutivo asignado a esta solicitud?"
                                    ) : executiveAssignmentPrompt.willSendEmail ? (
                                      <>
                                        ¿Está seguro que{" "}
                                        <strong>
                                          {
                                            executiveAssignmentPrompt.assignedExecutive
                                          }
                                        </strong>{" "}
                                        es el ejecutivo correcto? Se enviará un
                                        correo con la cita.
                                      </>
                                    ) : (
                                      <>
                                        ¿Está seguro que desea asignar a{" "}
                                        <strong>
                                          {
                                            executiveAssignmentPrompt.assignedExecutive
                                          }
                                        </strong>{" "}
                                        como ejecutivo?
                                      </>
                                    )}
                                  </p>
                                  <div className="mt-3 flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={cancelExecutiveAssignment}
                                      disabled={isConfirmingExecutive}
                                      className="inline-flex h-8 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-xs font-semibold text-[#173b68] transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={confirmExecutiveAssignment}
                                      disabled={isConfirmingExecutive}
                                      className="inline-flex h-8 items-center justify-center rounded-2xl bg-[#0b5cab] px-3 text-xs font-semibold text-white transition hover:bg-[#084a8c] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {isConfirmingExecutive
                                        ? "Guardando..."
                                        : "Confirmar"}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="inline-flex h-8 min-w-32 items-center rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-2.5 text-xs font-semibold text-slate-400">
                              No aplica
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 align-top">
                          {appointment.status === "revisado" ? (
                            <div className="flex min-w-28 flex-col gap-1.5">
                              <span
                                className={`inline-flex h-8 items-center justify-center rounded-full border px-2.5 text-xs font-semibold ${statusStyles.revisado}`}
                              >
                                Agendado
                              </span>
                              <select
                                defaultValue=""
                                onChange={(event) => {
                                  const nextStatus = event.target
                                    .value as AppointmentStatus;

                                  if (!nextStatus) {
                                    return;
                                  }

                                  updateStatus(appointment.id, nextStatus);
                                  event.target.value = "";
                                }}
                                className="h-8 rounded-full border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-2.5 text-xs font-semibold text-[#173b68] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                              >
                                <option value="">Cambiar estado</option>
                                {appointmentAllowsExecutive(appointment) ? (
                                  <option value="cancelado">Cancelado</option>
                                ) : (
                                  <>
                                    <option value="pendiente">Pendiente</option>
                                    <option value="aprobado">Aprobado</option>
                                    <option value="rechazado">Rechazado</option>
                                  </>
                                )}
                              </select>
                            </div>
                          ) : appointment.status === "cancelado" ? (
                            <span
                              className={`inline-flex h-8 min-w-28 items-center justify-center rounded-full border px-2.5 text-xs font-semibold ${statusStyles.cancelado}`}
                            >
                              Cancelado
                            </span>
                          ) : (
                            <select
                              value={appointment.status}
                              onChange={(event) =>
                                updateStatus(
                                  appointment.id,
                                  event.target.value as AppointmentStatus,
                                )
                              }
                              className={`h-8 min-w-28 rounded-full border px-2.5 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-[#0b5cab]/15 ${statusStyles[appointment.status]}`}
                            >
                              <option value="pendiente">Pendiente</option>
                              <option value="aprobado">Aprobado</option>
                              <option value="rechazado">Rechazado</option>
                            </select>
                          )}
                        </td>
                        <td className="px-2.5 py-2">
                          <button
                            type="button"
                            onClick={() => confirmRemoveAppointment(appointment)}
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
            <div className="rounded-2xl border border-dashed border-[#a8bdd6] bg-[#f8fbff] px-5 py-10 text-center">
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
      {dialog}
    </main>
  );
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={null}>
      <AppointmentsPageContent />
    </Suspense>
  );
}
