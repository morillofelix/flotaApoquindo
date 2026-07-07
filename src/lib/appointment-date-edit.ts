import {
  type Appointment,
  type AppointmentReasonConfig,
  type AppointmentStatus,
} from "@/lib/appointments";
import { formatDate } from "@/lib/agendamientos-appointments";

export const DATE_EDITABLE_STATUSES: AppointmentStatus[] = [
  "pendiente",
  "revisado",
  "aprobado",
];

export type AppointmentDatePatch = {
  appointmentDate?: string;
  vacationStartDate?: string;
  vacationEndDate?: string;
  permitStartDate?: string;
  permitEndDate?: string;
  permitDate?: string;
  permitStartTime?: string;
  permitEndTime?: string;
};

function parseDateOnly(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year || 0, (month || 1) - 1, day || 1);
}

function formatDateOnlyValue(dateValue: Date) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = parseDateOnly(value);
  return !Number.isNaN(date.getTime());
}

export function countInclusiveDays(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const diffMs = end.getTime() - start.getTime();

  if (diffMs < 0) {
    return 0;
  }

  return Math.floor(diffMs / 86_400_000) + 1;
}

export function addCalendarDays(dateValue: string, days: number) {
  const date = parseDateOnly(dateValue);
  date.setDate(date.getDate() + days);
  return formatDateOnlyValue(date);
}

export function shiftRangePreservingDuration(
  originalStart: string,
  originalEnd: string,
  newStart: string,
) {
  const durationDays = countInclusiveDays(originalStart, originalEnd);

  if (durationDays < 1) {
    return { start: newStart, end: newStart };
  }

  return {
    start: newStart,
    end: addCalendarDays(newStart, durationDays - 1),
  };
}

export function canEditAppointmentDates(status: AppointmentStatus) {
  return DATE_EDITABLE_STATUSES.includes(status);
}

export function isValidClockTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function formatPermitHorasSummary(
  permitDate: string,
  permitStartTime: string,
  permitEndTime: string,
) {
  return `${formatDate(permitDate)}, ${permitStartTime} a ${permitEndTime}`;
}

function buildPermitHorasPatch(
  appointment: Appointment,
  changes: Partial<
    Pick<
      AppointmentDatePatch,
      "permitDate" | "permitStartTime" | "permitEndTime"
    >
  >,
): AppointmentDatePatch | null {
  const permitDate = changes.permitDate ?? appointment.permitDate;
  const permitStartTime = changes.permitStartTime ?? appointment.permitStartTime;
  const permitEndTime = changes.permitEndTime ?? appointment.permitEndTime;

  if (
    !isValidDateOnly(permitDate) ||
    !isValidClockTime(permitStartTime) ||
    !isValidClockTime(permitEndTime) ||
    permitEndTime <= permitStartTime
  ) {
    return null;
  }

  if (
    permitDate === appointment.permitDate &&
    permitStartTime === appointment.permitStartTime &&
    permitEndTime === appointment.permitEndTime
  ) {
    return null;
  }

  return { permitDate, permitStartTime, permitEndTime };
}

export function buildDateChangePreviewLabel(patch: AppointmentDatePatch) {
  if (patch.appointmentDate) {
    return `Nueva fecha requerida: ${formatDate(patch.appointmentDate)}`;
  }

  if (patch.vacationStartDate && patch.vacationEndDate) {
    return `Nuevo rango: ${formatDate(patch.vacationStartDate)} al ${formatDate(patch.vacationEndDate)}`;
  }

  if (patch.permitStartDate && patch.permitEndDate) {
    return `Nuevo rango: ${formatDate(patch.permitStartDate)} al ${formatDate(patch.permitEndDate)}`;
  }

  if (
    patch.permitDate &&
    patch.permitStartTime &&
    patch.permitEndTime
  ) {
    return `Nuevo horario: ${formatPermitHorasSummary(
      patch.permitDate,
      patch.permitStartTime,
      patch.permitEndTime,
    )}`;
  }

  if (patch.permitDate) {
    return `Nueva fecha: ${formatDate(patch.permitDate)}`;
  }

  return "Se actualizarán las fechas de la solicitud.";
}

export function buildDatePatchFromFieldChange(
  appointment: Appointment,
  reason: AppointmentReasonConfig | undefined,
  field:
    | "appointmentDate"
    | "vacationStartDate"
    | "permitStartDate"
    | "permitDate"
    | "permitStartTime"
    | "permitEndTime",
  value: string,
): AppointmentDatePatch | null {
  if (!isValidDateOnly(value)) {
    return null;
  }

  if (field === "appointmentDate" && reason?.allowsExecutiveAssignment) {
    if (value === appointment.appointmentDate) {
      return null;
    }

    return { appointmentDate: value };
  }

  if (field === "vacationStartDate" && reason?.usesDateRange) {
    if (
      !appointment.vacationStartDate ||
      !appointment.vacationEndDate ||
      value === appointment.vacationStartDate
    ) {
      return null;
    }

    const shifted = shiftRangePreservingDuration(
      appointment.vacationStartDate,
      appointment.vacationEndDate,
      value,
    );

    return {
      vacationStartDate: shifted.start,
      vacationEndDate: shifted.end,
    };
  }

  if (field === "permitStartDate" && reason?.usesPermitDetails) {
    if (
      appointment.permitType !== "dias" ||
      !appointment.permitStartDate ||
      !appointment.permitEndDate ||
      value === appointment.permitStartDate
    ) {
      return null;
    }

    const shifted = shiftRangePreservingDuration(
      appointment.permitStartDate,
      appointment.permitEndDate,
      value,
    );

    return {
      permitStartDate: shifted.start,
      permitEndDate: shifted.end,
    };
  }

  if (field === "permitDate" && reason?.usesPermitDetails) {
    if (appointment.permitType !== "horas") {
      return null;
    }

    return buildPermitHorasPatch(appointment, { permitDate: value });
  }

  if (field === "permitStartTime" && reason?.usesPermitDetails) {
    if (appointment.permitType !== "horas") {
      return null;
    }

    return buildPermitHorasPatch(appointment, { permitStartTime: value });
  }

  if (field === "permitEndTime" && reason?.usesPermitDetails) {
    if (appointment.permitType !== "horas") {
      return null;
    }

    return buildPermitHorasPatch(appointment, { permitEndTime: value });
  }

  return null;
}

export function appointmentDatesChanged(
  appointment: Appointment,
  patch: AppointmentDatePatch,
) {
  if (
    patch.appointmentDate !== undefined &&
    patch.appointmentDate !== appointment.appointmentDate
  ) {
    return true;
  }

  if (
    patch.vacationStartDate !== undefined &&
    (patch.vacationStartDate !== appointment.vacationStartDate ||
      patch.vacationEndDate !== appointment.vacationEndDate)
  ) {
    return true;
  }

  if (
    patch.permitStartDate !== undefined &&
    (patch.permitStartDate !== appointment.permitStartDate ||
      patch.permitEndDate !== appointment.permitEndDate)
  ) {
    return true;
  }

  if (
    patch.permitDate !== undefined ||
    patch.permitStartTime !== undefined ||
    patch.permitEndTime !== undefined
  ) {
    const permitDate = patch.permitDate ?? appointment.permitDate;
    const permitStartTime = patch.permitStartTime ?? appointment.permitStartTime;
    const permitEndTime = patch.permitEndTime ?? appointment.permitEndTime;

    if (
      permitDate !== appointment.permitDate ||
      permitStartTime !== appointment.permitStartTime ||
      permitEndTime !== appointment.permitEndTime
    ) {
      return true;
    }
  }

  return false;
}

export function getAdminDateChangeWarning(appointment: Appointment) {
  const isScheduledWithExecutive =
    appointment.assignedExecutive !== "" &&
    (appointment.status === "revisado" || appointment.status === "aprobado");

  if (
    appointment.reasonAllowsExecutiveAssignment &&
    isScheduledWithExecutive
  ) {
    return "Esta solicitud ya fue agendada. Al cambiar la fecha se cancelará la cita del ejecutivo, se enviará una nueva invitación de calendario y se notificará al conductor.";
  }

  if (appointment.reasonAllowsExecutiveAssignment) {
    return "Se actualizará la fecha requerida y se notificará al conductor del cambio.";
  }

  if (appointment.reasonUsesDateRange) {
    return "Se actualizarán las fechas de vacaciones manteniendo la cantidad de días solicitada. El conductor será notificado.";
  }

  if (appointment.reasonUsesPermitDetails && appointment.permitType === "horas") {
    return "Se actualizará la fecha u horario del permiso y se notificará al conductor.";
  }

  if (appointment.reasonUsesPermitDetails) {
    return "Se actualizará la fecha del permiso y se notificará al conductor del cambio.";
  }

  return "Se actualizarán las fechas y se notificará al conductor.";
}

export function buildDateChangeMessage(
  previous: Appointment,
  next: Appointment,
) {
  if (next.reasonAllowsExecutiveAssignment) {
    if (previous.appointmentDate === next.appointmentDate) {
      return "";
    }

    return `Tu solicitud fue actualizada. Fecha anterior: ${formatDate(previous.appointmentDate)}. Nueva fecha: ${formatDate(next.appointmentDate)}.`;
  }

  if (next.reasonUsesDateRange) {
    const previousRange = `${formatDate(previous.vacationStartDate)} al ${formatDate(previous.vacationEndDate)}`;
    const nextRange = `${formatDate(next.vacationStartDate)} al ${formatDate(next.vacationEndDate)}`;

    if (previousRange === nextRange) {
      return "";
    }

    return `Tus vacaciones fueron actualizadas. Antes: ${previousRange}. Ahora: ${nextRange}.`;
  }

  if (next.reasonUsesPermitDetails && next.permitType === "dias") {
    const previousRange = `${formatDate(previous.permitStartDate)} al ${formatDate(previous.permitEndDate)}`;
    const nextRange = `${formatDate(next.permitStartDate)} al ${formatDate(next.permitEndDate)}`;

    if (previousRange === nextRange) {
      return "";
    }

    return `Tu permiso por días fue actualizado. Antes: ${previousRange}. Ahora: ${nextRange}.`;
  }

  if (next.reasonUsesPermitDetails && next.permitType === "horas") {
    const previousSummary = formatPermitHorasSummary(
      previous.permitDate,
      previous.permitStartTime,
      previous.permitEndTime,
    );
    const nextSummary = formatPermitHorasSummary(
      next.permitDate,
      next.permitStartTime,
      next.permitEndTime,
    );

    if (previousSummary === nextSummary) {
      return "";
    }

    return `Tu permiso por horas fue actualizado. Antes: ${previousSummary}. Ahora: ${nextSummary}.`;
  }

  return "Tu solicitud fue actualizada con nuevas fechas.";
}

export function shouldRescheduleExecutiveCalendar(appointment: Appointment) {
  return (
    appointment.reasonAllowsExecutiveAssignment &&
    appointment.assignedExecutive !== "" &&
    (appointment.status === "revisado" || appointment.status === "aprobado") &&
    appointment.scheduledStartTime !== "" &&
    appointment.scheduledEndTime !== ""
  );
}
