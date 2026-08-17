"use client";

import {
  type Appointment,
  type AppointmentReasonConfig,
  type AppointmentStatus,
  type ExecutiveConfig,
  type PermissionReason,
  defaultAppointmentReasons,
  defaultExecutives,
  getAppointmentTicketLabel,
  matchesAppointmentTicketSearch,
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
  getRequiredDateSummary,
  isWithinDateFilter,
  sendExecutiveAssignmentEmails,
  sendCalendarCancelToExecutive,
  sendCancellationToRequester,
  sendDecisionEmail,
  sendAppointmentDateChangeEmails,
  shouldSendCalendarInvite,
  shouldSendCancellationEmails,
  shouldSendDecisionEmail,
} from "@/lib/agendamientos-appointments";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import AppointmentsCalendar from "@/components/agendamientos/AppointmentsCalendar";
import DataRefreshButton from "@/components/agendamientos/DataRefreshButton";
import ExecutiveAppointmentCreateModal from "@/components/agendamientos/ExecutiveAppointmentCreateModal";
import ExecutiveAppointmentEditModal from "@/components/agendamientos/ExecutiveAppointmentEditModal";
import ExecutiveAssignmentConfirmModal from "@/components/agendamientos/ExecutiveAssignmentConfirmModal";
import DriverApprovalAckBadge from "@/components/agendamientos/DriverApprovalAckBadge";
import AppointmentRowActions, {
  canResendAppointmentReminder,
} from "@/components/agendamientos/AppointmentRowActions";
import AppointmentStatusControl from "@/components/agendamientos/AppointmentStatusControl";
import NotePeekButton from "@/components/agendamientos/NotePeekButton";
import ExecutiveDailyLimitAlert from "@/components/agendamientos/ExecutiveDailyLimitAlert";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { getExecutiveDailyLimitStatus } from "@/lib/executive-daily-limit";
import {
  getVehicleShiftLabel,
  getVehicleShifts,
  shiftOptions,
  type ShiftType,
} from "@/lib/driver-owners";
import {
  getAppointmentOriginBadge,
} from "@/lib/appointment-origin";

function AppointmentsPageContent() {
  const { confirm, promptNote, dialog } = useConfirmAction();
  const searchParams = useSearchParams();
  const isCalendarView = searchParams.get("vista") === "calendario";
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reasons, setReasons] = useState<AppointmentReasonConfig[]>(
    defaultAppointmentReasons,
  );
  const [executiveOptions, setExecutiveOptions] =
    useState<ExecutiveConfig[]>(defaultExecutives);
  const [vehicleShiftByNumber, setVehicleShiftByNumber] = useState<
    Record<string, string>
  >({});
  const [vehicleShiftsByNumber, setVehicleShiftsByNumber] = useState<
    Record<string, ShiftType[]>
  >({});
  const [statusFilter, setStatusFilter] = useState<
    "todos" | AppointmentStatus | "rechazado_conductor"
  >("todos");
  const [reasonFilter, setReasonFilter] = useState<"todos" | PermissionReason>(
    "todos",
  );
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [ticketFilter, setTicketFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState<"todos" | ShiftType>("todos");
  const [dateFilter, setDateFilter] = useState<DateFilter>("todos");
  const [customDateRange, setCustomDateRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [emailNotice, setEmailNotice] = useState<EmailNotice>(null);
  const [firstAssignmentPrompt, setFirstAssignmentPrompt] = useState<{
    appointmentId: string;
    assignedExecutive: string;
    willSendEmail: boolean;
  } | null>(null);
  const [isConfirmingFirstAssignment, setIsConfirmingFirstAssignment] =
    useState(false);
  const [dailyLimitAlert, setDailyLimitAlert] = useState<{
    executiveName: string;
    appointmentDate: string;
    currentCount: number;
    max: number;
  } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(
    null,
  );
  const [resendingAppointmentId, setResendingAppointmentId] = useState("");

  const reloadAppointmentsData = useCallback(async () => {
    const [loadedAppointmentsData, loadedReasons, loadedExecutives] =
      await Promise.all([
        loadAppointments(),
        loadAppointmentReasons(),
        loadExecutives(),
      ]);

    setAppointments(loadedAppointmentsData.appointments);
    setVehicleShiftByNumber(loadedAppointmentsData.vehicleShiftByNumber);
    setVehicleShiftsByNumber(loadedAppointmentsData.vehicleShiftsByNumber);
    setReasons(loadedReasons);
    setExecutiveOptions(loadedExecutives);
    setAppointmentsError("");
  }, []);

  const shouldPauseAutoRefresh =
    isLoadingAppointments ||
    isCreateModalOpen ||
    editingAppointment !== null ||
    firstAssignmentPrompt !== null ||
    isConfirmingFirstAssignment ||
    resendingAppointmentId !== "";

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
    if (!emailNotice) {
      return;
    }

    const timeoutMs = emailNotice.status === "sent" ? 4500 : 8000;
    const timeoutId = window.setTimeout(() => {
      setEmailNotice((current) => {
        if (!current) {
          return null;
        }

        if (current.status === "sending") {
          return {
            status: "sent",
            message:
              current.message.includes("Solicitud creada")
                ? "Solicitud creada. Los correos de cita se enviaron o quedaron en cola."
                : "Proceso de correos finalizado.",
          };
        }

        return null;
      });
    }, timeoutMs);

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
    const normalizedTicketFilter = ticketFilter.trim();

    return appointments.filter((appointment) => {
      const matchesStatus =
        statusFilter === "todos" ||
        (statusFilter === "rechazado_conductor"
          ? appointment.driverApprovalRejected
          : appointment.status === statusFilter);
      const matchesReason =
        reasonFilter === "todos" ||
        appointment.appointmentReason === reasonFilter;
      const matchesTicket =
        normalizedTicketFilter === "" ||
        matchesAppointmentTicketSearch(appointment, normalizedTicketFilter);
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
      const matchesShift =
        shiftFilter === "todos" ||
        getVehicleShifts(
          appointment.vehicleNumber,
          vehicleShiftsByNumber,
        ).includes(shiftFilter);

      return (
        matchesStatus &&
        matchesReason &&
        matchesTicket &&
        matchesVehicle &&
        matchesDate &&
        matchesShift
      );
    });
  }, [
    appointments,
    customDateRange,
    dateFilter,
    reasonFilter,
    shiftFilter,
    statusFilter,
    ticketFilter,
    vehicleFilter,
    vehicleShiftsByNumber,
  ]);

  const vehicleShiftLookup = useMemo(
    () => new Map(Object.entries(vehicleShiftByNumber)),
    [vehicleShiftByNumber],
  );

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
  const driverRejectedCount = appointments.filter(
    (appointment) => appointment.driverApprovalRejected,
  ).length;

  function setStatusFilterFromIndicator(
    nextFilter: "todos" | AppointmentStatus | "rechazado_conductor",
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

  async function updateStatus(
    id: string,
    status: AppointmentStatus,
    extra?: { rejectionMessage?: string },
  ) {
    const previousAppointments = appointments;
    const currentAppointment = appointments.find(
      (appointment) => appointment.id === id,
    );

    if (!currentAppointment) {
      return;
    }

    const updatedAppointment: Appointment = {
      ...currentAppointment,
      status,
      rejectionMessage:
        extra?.rejectionMessage ??
        (status === "rechazado" ? currentAppointment.rejectionMessage : ""),
    };
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
        body: JSON.stringify({
          status,
          ...(extra && "rejectionMessage" in extra
            ? { rejectionMessage: extra.rejectionMessage ?? "" }
            : {}),
        }),
      });

      if (!response.ok) {
        throw new Error("No se pudo actualizar la solicitud.");
      }

      const patchData = (await response.json().catch(() => ({}))) as {
        appointment?: Appointment;
      };

      const savedAppointment = patchData.appointment ?? updatedAppointment;

      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === id ? savedAppointment : appointment,
        ),
      );

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
            "La solicitud quedó agendada, pero no se pudieron enviar todos los correos.",
          );
        }
      }

      if (shouldSendCancellationEmails(savedAppointment)) {
        try {
          setEmailNotice({
            status: "sending",
            message: "Enviando correos de cancelación...",
          });
          const cancellationTasks = [
            sendCancellationToRequester(savedAppointment),
          ];

          if (savedAppointment.assignedExecutive) {
            cancellationTasks.push(
              sendCalendarCancelToExecutive(savedAppointment),
            );
          }

          await Promise.all(cancellationTasks);

          setEmailNotice({
            status: "sent",
            message:
              "Cancelación notificada por correo y aviso al conductor en la app.",
          });
        } catch {
          setEmailNotice(null);
          setAppointmentsError(
            "La solicitud quedó cancelada, pero no se pudieron enviar todos los correos.",
          );
        }
      } else if (shouldSendDecisionEmail(savedAppointment)) {
        try {
          setEmailNotice({
            status: "sending",
            message:
              status === "aprobado"
                ? "Enviando correo de aprobación..."
                : "Enviando correo de rechazo...",
          });
          await sendDecisionEmail(savedAppointment);
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

  async function requestStatusChange(
    appointment: Appointment,
    nextStatus: AppointmentStatus,
  ) {
    if (nextStatus === appointment.status) {
      return;
    }

    if (nextStatus === "rechazado") {
      const rejectionPrompt = await promptNote({
        title: "Rechazar solicitud",
        message:
          "Puedes dejar un mensaje para el conductor. No es obligatorio: también puedes rechazar sin texto.",
        detail: `${getAppointmentTicketLabel(appointment)} — Móvil ${appointment.vehicleNumber}, ${appointment.driverName}.`,
        placeholder: "Ej: La fecha no está disponible. Solicite otro día hábil.",
        confirmLabel: "Rechazar solicitud",
        cancelLabel: "Volver",
        minLength: 0,
        maxLength: 400,
      });

      if (!rejectionPrompt) {
        return;
      }

      await updateStatus(appointment.id, nextStatus, {
        rejectionMessage: rejectionPrompt.note,
      });
      return;
    }

    if (nextStatus === "cancelado") {
      const confirmed = await confirm({
        title: "¿Está de acuerdo?",
        message: "¿Está de acuerdo en cancelar esta solicitud?",
        detail: `${getAppointmentTicketLabel(appointment)} — Móvil ${appointment.vehicleNumber}, ${appointment.driverName}.`,
        confirmLabel: "Sí, cancelar",
        cancelLabel: "No",
        tone: "danger",
      });

      if (!confirmed) {
        return;
      }
    } else if (
      nextStatus === "revisado" &&
      appointment.status === "cancelado"
    ) {
      const confirmed = await confirm({
        title: "¿Está seguro?",
        message: "¿Está seguro de cambiar el estado a Agendado?",
        detail: `${getAppointmentTicketLabel(appointment)} — Móvil ${appointment.vehicleNumber}, ${appointment.driverName}.`,
        confirmLabel: "Sí, agendar",
        cancelLabel: "No",
      });

      if (!confirmed) {
        return;
      }
    }

    await updateStatus(appointment.id, nextStatus);
  }

  function getReasonForAppointment(appointment: Appointment) {
    return reasons.find((reason) => reason.value === appointment.appointmentReason);
  }

  function requestFirstExecutiveAssignment(
    id: string,
    assignedExecutive: string,
  ) {
    const currentAppointment = appointments.find(
      (appointment) => appointment.id === id,
    );

    if (!currentAppointment || currentAppointment.assignedExecutive) {
      return;
    }

    if (!assignedExecutive) {
      setFirstAssignmentPrompt(null);
      return;
    }

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
      setFirstAssignmentPrompt(null);
      setDailyLimitAlert({
        executiveName: limitStatus.executiveName,
        appointmentDate: limitStatus.appointmentDate,
        currentCount: limitStatus.currentCount,
        max: limitStatus.max,
      });
      return;
    }

    const previewAppointment: Appointment = {
      ...currentAppointment,
      assignedExecutive,
      status: "revisado",
    };

    setFirstAssignmentPrompt({
      appointmentId: id,
      assignedExecutive,
      willSendEmail: shouldSendCalendarInvite(previewAppointment),
    });
  }

  function cancelFirstExecutiveAssignment() {
    if (isConfirmingFirstAssignment) {
      return;
    }

    setFirstAssignmentPrompt(null);
  }

  async function confirmFirstExecutiveAssignment(selection: {
    assignedExecutive: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
  }) {
    if (!firstAssignmentPrompt) {
      return;
    }

    const id = firstAssignmentPrompt.appointmentId;
    const previousAppointments = appointments;
    const currentAppointment = appointments.find(
      (appointment) => appointment.id === id,
    );

    if (!currentAppointment || currentAppointment.assignedExecutive) {
      setFirstAssignmentPrompt(null);
      return;
    }

    if (!selection.assignedExecutive || !selection.scheduledStartTime) {
      return;
    }

    const executive = executiveOptions.find(
      (option) => option.name === selection.assignedExecutive,
    );
    const limitStatus = getExecutiveDailyLimitStatus(
      executive,
      appointments,
      currentAppointment,
      selection.assignedExecutive,
    );

    if (limitStatus.blocked) {
      setFirstAssignmentPrompt(null);
      setDailyLimitAlert({
        executiveName: limitStatus.executiveName,
        appointmentDate: limitStatus.appointmentDate,
        currentCount: limitStatus.currentCount,
        max: limitStatus.max,
      });
      return;
    }

    const appointmentToInvite: Appointment = {
      ...currentAppointment,
      assignedExecutive: selection.assignedExecutive,
      scheduledStartTime: selection.scheduledStartTime,
      scheduledEndTime: selection.scheduledEndTime ?? "",
      status: "revisado",
    };

    setIsConfirmingFirstAssignment(true);
    setAppointments((current) =>
      current.map((item) => (item.id === id ? appointmentToInvite : item)),
    );
    setAppointmentsError("");
    setEmailNotice(null);

    try {
      const response = await fetch(`/api/appointments/${id}`, {
        ...adminFetchInit,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignedExecutive: selection.assignedExecutive,
          scheduledStartTime: selection.scheduledStartTime,
          scheduledEndTime: selection.scheduledEndTime,
          status: "revisado",
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          errorData.message || "No se pudo asignar el ejecutivo.",
        );
      }

      const patchData = (await response.json()) as { appointment?: Appointment };
      const savedAppointment = patchData.appointment ?? appointmentToInvite;

      setAppointments((current) =>
        current.map((item) => (item.id === id ? savedAppointment : item)),
      );
      setFirstAssignmentPrompt(null);

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
    } catch (error) {
      setAppointments(previousAppointments);
      setAppointmentsError(
        error instanceof Error && error.message
          ? error.message
          : "No se pudo asignar el ejecutivo.",
      );
    } finally {
      setIsConfirmingFirstAssignment(false);
    }
  }

  async function handleAppointmentEdited(
    savedAppointment: Appointment,
    meta: {
      dateChange: {
        occurred: boolean;
        requiresCalendarCancel: boolean;
        requiresCalendarInvite: boolean;
        previousAppointment: Appointment;
      } | null;
      previousAppointment: Appointment;
    },
  ) {
    setAppointments((currentAppointments) =>
      currentAppointments.map((item) =>
        item.id === savedAppointment.id ? savedAppointment : item,
      ),
    );
    setEditingAppointment(null);
    setAppointmentsError("");
    setEmailNotice(null);

    const previous = meta.previousAppointment;
    const executiveChanged =
      previous.assignedExecutive !== savedAppointment.assignedExecutive;
    const newlyAssigned =
      Boolean(savedAppointment.assignedExecutive) &&
      (!previous.assignedExecutive || executiveChanged);

    try {
      if (newlyAssigned && shouldSendCalendarInvite(savedAppointment)) {
        setEmailNotice({
          status: "sending",
          message: "Enviando cita y confirmación...",
        });
        await sendExecutiveAssignmentEmails(savedAppointment);

        if (
          meta.dateChange?.occurred &&
          savedAppointment.dateChangeMessage.trim()
        ) {
          await sendAppointmentDateChangeEmails(
            savedAppointment,
            meta.dateChange.previousAppointment,
            {
              requiresCalendarCancel: meta.dateChange.requiresCalendarCancel,
              requiresCalendarInvite: false,
            },
          );
        }

        setEmailNotice({
          status: "sent",
          message: "Cambios guardados y notificaciones enviadas.",
        });
      } else if (meta.dateChange?.occurred) {
        setEmailNotice({
          status: "sending",
          message: "Actualizando fechas y notificando...",
        });
        await sendAppointmentDateChangeEmails(
          savedAppointment,
          meta.dateChange.previousAppointment,
          {
            requiresCalendarCancel: meta.dateChange.requiresCalendarCancel,
            requiresCalendarInvite: meta.dateChange.requiresCalendarInvite,
          },
        );
        setEmailNotice({
          status: "sent",
          message: "Cambios guardados y notificaciones enviadas.",
        });
      } else {
        setEmailNotice({
          status: "sent",
          message: "Solicitud actualizada correctamente.",
        });
      }
    } catch {
      setEmailNotice(null);
      setAppointmentsError(
        "Los cambios se guardaron, pero no se pudieron enviar todas las notificaciones.",
      );
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

  async function resendAppointment(appointment: Appointment) {
    if (!canResendAppointmentReminder(appointment)) {
      return;
    }

    setResendingAppointmentId(appointment.id);
    setAppointmentsError("");
    setEmailNotice(null);

    try {
      const response = await fetch(`/api/appointments/${appointment.id}/resend`, {
        ...adminFetchInit,
        method: "POST",
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        appointment?: Appointment;
        reminderSent?: boolean;
        emailsSent?: boolean;
      };

      if (!response.ok) {
        throw new Error(result.message || "No se pudo reenviar la solicitud.");
      }

      if (result.appointment) {
        setAppointments((currentAppointments) =>
          currentAppointments.map((currentAppointment) =>
            currentAppointment.id === appointment.id
              ? result.appointment!
              : currentAppointment,
          ),
        );
      }

      if (result.emailsSent && result.reminderSent) {
        setEmailNotice({
          status: "sent",
          message: "Solicitud reenviada al conductor y correos de cita enviados.",
        });
      } else if (result.emailsSent) {
        setEmailNotice({
          status: "sent",
          message: "Correos de cita reenviados.",
        });
      } else if (result.reminderSent) {
        setEmailNotice({
          status: "sent",
          message: "Recordatorio reenviado al conductor.",
        });
      } else {
        setEmailNotice({
          status: "sent",
          message: "Solicitud reenviada.",
        });
      }
    } catch (error) {
      setAppointmentsError(
        error instanceof Error && error.message
          ? error.message
          : "No se pudo reenviar la solicitud.",
      );
    } finally {
      setResendingAppointmentId("");
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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:min-w-[720px] xl:grid-cols-6">
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
                  Rech. ejecutivo
                </p>
                <p className="font-heading text-xl font-semibold text-red-800">
                  {rejectedCount}
                </p>
              </button>
              <button
                type="button"
                onClick={() =>
                  setStatusFilterFromIndicator("rechazado_conductor")
                }
                aria-pressed={statusFilter === "rechazado_conductor"}
                className={indicatorCardClass(
                  statusFilter === "rechazado_conductor",
                  "border border-rose-200 bg-rose-50",
                )}
              >
                <p className="text-[11px] font-semibold text-rose-800">
                  Rech. conductor
                </p>
                <p className="font-heading text-xl font-semibold text-rose-800">
                  {driverRejectedCount}
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

          <div className="mb-3 flex flex-wrap items-end gap-2 lg:flex-nowrap lg:gap-1.5">
            <label className="flex w-[calc(50%-0.25rem)] shrink-0 flex-col gap-1 sm:w-[9rem]">
              <span className="text-[11px] font-semibold text-[#173b68]">Ticket</span>
              <input
                type="search"
                value={ticketFilter}
                onChange={(event) => setTicketFilter(event.target.value)}
                className="h-8 w-full rounded-lg border border-[#9fb8d9] bg-white px-2.5 text-sm text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                placeholder="APQ-000036"
              />
            </label>

            <label className="flex w-[calc(50%-0.25rem)] shrink-0 flex-col gap-1 sm:w-[7.25rem]">
              <span className="text-[11px] font-semibold text-[#173b68]">Estado</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as
                      | "todos"
                      | AppointmentStatus
                      | "rechazado_conductor",
                  )
                }
                className="h-8 w-full rounded-lg border border-[#9fb8d9] bg-white px-2 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              >
                <option value="todos">Todos</option>
                <option value="pendiente">Pendientes</option>
                <option value="revisado">Agendados</option>
                <option value="aprobado">Aprobados</option>
                <option value="rechazado">Rech. ejecutivo</option>
                <option value="rechazado_conductor">Rech. conductor</option>
                <option value="cancelado">Cancelados</option>
              </select>
            </label>

            <label className="flex min-w-[10rem] max-w-[14rem] shrink flex-col gap-1 sm:w-[14rem]">
              <span className="text-[11px] font-semibold text-[#173b68]">Motivo</span>
              <select
                value={reasonFilter}
                onChange={(event) =>
                  setReasonFilter(event.target.value as "todos" | PermissionReason)
                }
                className="h-8 w-full rounded-lg border border-[#9fb8d9] bg-white px-2 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              >
                <option value="todos">Todos</option>
                {activeReasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex w-[calc(50%-0.25rem)] shrink-0 flex-col gap-1 sm:w-[4.75rem]">
              <span className="text-[11px] font-semibold text-[#173b68]">Móvil</span>
              <input
                type="search"
                inputMode="numeric"
                value={vehicleFilter}
                onChange={(event) => setVehicleFilter(event.target.value)}
                className="h-8 w-full rounded-lg border border-[#9fb8d9] bg-white px-2 text-center text-sm text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                placeholder="999"
              />
            </label>

            <label className="flex w-[calc(50%-0.25rem)] shrink-0 flex-col gap-1 sm:w-[7.5rem]">
              <span className="text-[11px] font-semibold text-[#173b68]">Turno</span>
              <select
                value={shiftFilter}
                onChange={(event) =>
                  setShiftFilter(event.target.value as "todos" | ShiftType)
                }
                className="h-8 w-full rounded-lg border border-[#9fb8d9] bg-white px-2 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              >
                <option value="todos">Todos</option>
                {shiftOptions.map((shift) => (
                  <option key={shift.value} value={shift.value}>
                    {shift.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex w-full shrink-0 flex-col gap-1 sm:w-[9.5rem] lg:w-[10.25rem]">
              <span className="text-[11px] font-semibold text-[#173b68]">Fecha registro</span>
              <select
                value={dateFilter}
                onChange={(event) =>
                  setDateFilter(event.target.value as DateFilter)
                }
                className="h-8 w-full rounded-lg border border-[#9fb8d9] bg-white px-2 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              >
                <option value="todos">Todas</option>
                <option value="hoy">Hoy</option>
                <option value="ultimos7">7 días</option>
                <option value="ultimos15">15 días</option>
                <option value="ultimos30">30 días</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </label>
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

          <div className="mb-3 flex flex-col gap-3 border-b border-[#c5d8eb] pb-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() =>
                  downloadExcel(
                    filteredAppointments,
                    "agendamientos-filtrados.xls",
                    vehicleShiftLookup,
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
                  downloadExcel(
                    appointments,
                    "agendamientos-totales.xls",
                    vehicleShiftLookup,
                  )
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="inline-flex h-9 items-center rounded-full border border-[#b7cce4] bg-[#f8fbff] px-4 text-xs font-semibold text-slate-600">
                Mostrando {filteredAppointments.length} de {appointments.length}
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex h-9 items-center justify-center rounded-full bg-[#0b5cab] px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#094a8d] active:translate-y-px"
              >
                Crear solicitud
              </button>
            </div>
          </div>

          {filteredAppointments.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[#b7cce4]">
              <div className="max-h-[min(78dvh,calc(100dvh-11rem))] overflow-auto">
                <table className="min-w-[1160px] w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-[#d7e7f8] text-[10px] uppercase tracking-[0.12em] text-[#0f2747] shadow-[0_2px_0_#b7cce4]">
                    <tr>
                      <th className="min-w-12 px-2.5 py-2 font-semibold">Origen</th>
                      <th className="min-w-28 px-2.5 py-2 font-semibold">Ticket</th>
                      <th className="min-w-36 px-2.5 py-2 font-semibold">Conductor</th>
                      <th className="min-w-14 px-2.5 py-2 font-semibold">Móvil</th>
                      <th className="min-w-20 px-2.5 py-2 font-semibold">Turno</th>
                      <th className="min-w-24 px-2.5 py-2 font-semibold">
                        Fecha de registro
                      </th>
                      <th className="min-w-24 px-2.5 py-2 font-semibold">Motivo</th>
                      <th className="min-w-48 px-2.5 py-2 font-semibold">
                        Fecha / hora requerida
                      </th>
                      <th className="min-w-44 px-2.5 py-2 font-semibold">Correo</th>
                      <th className="min-w-28 px-2.5 py-2 font-semibold">Teléfono</th>
                      <th className="min-w-36 px-2.5 py-2 font-semibold">Ejecutivo</th>
                      <th className="min-w-32 px-2.5 py-2 font-semibold">Estado</th>
                      <th className="w-14 px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[#173b68]">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c5d8eb]">
                    {filteredAppointments.map((appointment) => (
                      <tr
                        key={appointment.id}
                        className="align-top transition hover:bg-[#f8fbff]"
                      >
                        <td className="px-2.5 py-2">
                          {(() => {
                            const originBadge = getAppointmentOriginBadge(
                              appointment.createdByType,
                            );

                            return (
                              <div className="inline-flex items-center gap-1">
                                <span
                                  title={
                                    appointment.createdByType === "ejecutivo" &&
                                    appointment.createdByExecutiveName
                                      ? `${originBadge.title}: ${appointment.createdByExecutiveName}`
                                      : originBadge.title
                                  }
                                  className={`inline-flex size-6 items-center justify-center rounded-full border text-[10px] font-bold ${originBadge.className}`}
                                >
                                  {originBadge.label}
                                </span>
                                <DriverApprovalAckBadge
                                  createdByType={appointment.createdByType}
                                  driverApprovalPending={
                                    appointment.driverApprovalPending
                                  }
                                  driverApprovalRejected={
                                    appointment.driverApprovalRejected
                                  }
                                  driverApprovalMessage={
                                    appointment.driverApprovalMessage
                                  }
                                />
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-2.5 py-2 font-semibold text-[#0b5cab]">
                          {getAppointmentTicketLabel(appointment)}
                        </td>
                        <td className="px-2.5 py-2 font-semibold text-[#0f2747]">
                          {appointment.driverName}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          {appointment.vehicleNumber}
                        </td>
                        <td className="px-2.5 py-2 text-[11px] font-medium text-slate-600">
                          {getVehicleShiftLabel(
                            appointment.vehicleNumber,
                            vehicleShiftLookup,
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          {formatCreatedAt(appointment.createdAt)}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          <span className="inline-flex items-center gap-1.5">
                            {appointment.appointmentReasonLabel}
                            {appointment.observation.trim() ? (
                              <NotePeekButton
                                tone="amber"
                                message={appointment.observation}
                                eyebrow="Solicitud"
                                title="Observación del conductor"
                                ariaLabel="Ver observación del motivo"
                              />
                            ) : null}
                          </span>
                        </td>
                                                <td className="px-2.5 py-2 text-slate-700">
                          {getRequiredDateSummary(appointment) ? (
                            <span className="text-[11px] font-semibold text-[#173b68]">
                              {getRequiredDateSummary(appointment)}
                            </span>
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
                            appointment.assignedExecutive ? (
                              <span className="inline-flex h-8 min-w-32 items-center rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-2.5 text-xs font-semibold text-[#173b68]">
                                {appointment.assignedExecutive}
                              </span>
                            ) : (
                              <select
                                value={
                                  firstAssignmentPrompt?.appointmentId ===
                                  appointment.id
                                    ? firstAssignmentPrompt.assignedExecutive
                                    : ""
                                }
                                onChange={(event) =>
                                  requestFirstExecutiveAssignment(
                                    appointment.id,
                                    event.target.value,
                                  )
                                }
                                className="h-8 w-full min-w-32 rounded-2xl border border-[#9fb8d9] bg-white px-2.5 text-xs font-semibold text-[#173b68] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                              >
                                <option value="">Selecciona ejecutivo</option>
                                {activeExecutives.map((executive) => (
                                  <option
                                    key={executive.name}
                                    value={executive.name}
                                  >
                                    {executive.name}
                                  </option>
                                ))}
                              </select>
                            )
                          ) : (
                            <span className="inline-flex h-8 min-w-32 items-center rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-2.5 text-xs font-semibold text-slate-400">
                              No aplica
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 align-top">
                          <AppointmentStatusControl
                            appointment={appointment}
                            onRequestStatusChange={(currentAppointment, nextStatus) =>
                              void requestStatusChange(
                                currentAppointment,
                                nextStatus,
                              )
                            }
                          />
                        </td>
                        <td className="px-1 py-2 align-top">
                          <div className="flex justify-center">
                            <AppointmentRowActions
                            appointment={appointment}
                            isResending={resendingAppointmentId === appointment.id}
                            onEdit={(currentAppointment) =>
                              setEditingAppointment(currentAppointment)
                            }
                            onResend={(currentAppointment) =>
                              void resendAppointment(currentAppointment)
                            }
                            onDelete={confirmRemoveAppointment}
                          />
                          </div>
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
      <ExecutiveAppointmentCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={async (_createdAppointment, meta) => {
          await refreshAppointmentsData();

          if (meta.emailWarning) {
            setAppointmentsError(meta.emailWarning);
            return;
          }

          if (meta.emailsQueued) {
            setEmailNotice({
              status: "sent",
              message:
                "Solicitud creada. Los correos de cita se están enviando al ejecutivo y al conductor.",
            });
            return;
          }

          if (meta.emailsSent) {
            setEmailNotice({
              status: "sent",
              message: "Correos de cita enviados al ejecutivo y al conductor.",
            });
          } else {
            setEmailNotice({
              status: "sent",
              message: "Solicitud creada correctamente.",
            });
          }
        }}
        executives={activeExecutives}
        appointments={appointments}
      />
      <ExecutiveAppointmentEditModal
        appointment={editingAppointment}
        isOpen={editingAppointment !== null}
        onClose={() => setEditingAppointment(null)}
        onSaved={handleAppointmentEdited}
        executives={activeExecutives}
        appointments={appointments}
        reasons={reasons}
      />
      {firstAssignmentPrompt
        ? (() => {
            const promptAppointment = appointments.find(
              (appointment) =>
                appointment.id === firstAssignmentPrompt.appointmentId,
            );

            if (!promptAppointment || promptAppointment.assignedExecutive) {
              return null;
            }

            return (
              <ExecutiveAssignmentConfirmModal
                appointment={promptAppointment}
                assignedExecutive={firstAssignmentPrompt.assignedExecutive}
                executives={activeExecutives}
                appointments={appointments}
                reason={getReasonForAppointment(promptAppointment)}
                willSendEmail={firstAssignmentPrompt.willSendEmail}
                isConfirming={isConfirmingFirstAssignment}
                onCancel={cancelFirstExecutiveAssignment}
                onConfirm={(selection) => {
                  void confirmFirstExecutiveAssignment(selection);
                }}
              />
            );
          })()
        : null}
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
