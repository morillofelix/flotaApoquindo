import {
  type Appointment,
  type AppointmentReasonConfig,
  type AppointmentStatus,
  type PermitType,
  getPermissionReasonLabel,
} from "@/lib/appointments";
import { parseRestrictedWeekdays, parseWeekdayBusinessAdvance } from "@/lib/appointment-reason-weekdays";

const validStatuses: AppointmentStatus[] = [
  "pendiente",
  "revisado",
  "aprobado",
  "rechazado",
  "cancelado",
];

function isValidPermitType(value: string): value is PermitType {
  return value === "dias" || value === "horas";
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function toReasonConfig(
  reason: {
    value: string;
    label: string;
    allowsExecutiveAssignment: boolean;
    usesAppointmentDuration: boolean;
    appointmentDurationMinutes: number;
    usesServiceStartTime: boolean;
    serviceStartTime: string;
    usesDateRange: boolean;
    usesPermitDetails: boolean;
    isActive: boolean;
    restrictedWeekdays: string;
    weekdayBusinessAdvance: string;
    requiresBusinessDayAdvance: boolean;
    businessDaysAdvance: number;
    sortOrder: number;
  } | null,
): AppointmentReasonConfig | null {
  if (!reason) {
    return null;
  }

  return {
    value: reason.value,
    label: reason.label,
    allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
    usesAppointmentDuration: reason.usesAppointmentDuration,
    appointmentDurationMinutes: reason.appointmentDurationMinutes,
    usesServiceStartTime: reason.usesServiceStartTime,
    serviceStartTime: reason.serviceStartTime,
    usesDateRange: reason.usesDateRange,
    usesPermitDetails: reason.usesPermitDetails,
    isActive: reason.isActive,
    restrictedWeekdays: parseRestrictedWeekdays(reason.restrictedWeekdays),
    weekdayBusinessAdvance: parseWeekdayBusinessAdvance(
      reason.weekdayBusinessAdvance,
      {
        requiresBusinessDayAdvance: reason.requiresBusinessDayAdvance,
        businessDaysAdvance: reason.businessDaysAdvance,
      },
    ),
    requiresBusinessDayAdvance: reason.requiresBusinessDayAdvance,
    businessDaysAdvance: reason.businessDaysAdvance,
    sortOrder: reason.sortOrder,
  };
}

export function toAppointment(
  value: {
    id: string;
    ticketNumber: number;
    driverName: string;
    vehicleNumber: string;
    appointmentDate: Date;
    vacationStartDate: Date | null;
    vacationEndDate: Date | null;
    permitType: string;
    permitStartDate: Date | null;
    permitEndDate: Date | null;
    permitDate: Date | null;
    permitStartTime: string;
    permitEndTime: string;
    appointmentReason: string;
    email: string;
    phone: string;
    assignedExecutive: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    status: string;
    createdAt: Date;
  },
  reasonConfig?: AppointmentReasonConfig,
): Appointment {
  const status = validStatuses.includes(value.status as AppointmentStatus)
    ? (value.status as AppointmentStatus)
    : "pendiente";

  return {
    id: value.id,
    ticketNumber: value.ticketNumber,
    driverName: value.driverName,
    vehicleNumber: value.vehicleNumber,
    appointmentDate: formatDateOnly(value.appointmentDate),
    vacationStartDate: value.vacationStartDate
      ? formatDateOnly(value.vacationStartDate)
      : "",
    vacationEndDate: value.vacationEndDate
      ? formatDateOnly(value.vacationEndDate)
      : "",
    permitType: isValidPermitType(value.permitType) ? value.permitType : "",
    permitStartDate: value.permitStartDate
      ? formatDateOnly(value.permitStartDate)
      : "",
    permitEndDate: value.permitEndDate ? formatDateOnly(value.permitEndDate) : "",
    permitDate: value.permitDate ? formatDateOnly(value.permitDate) : "",
    permitStartTime: value.permitStartTime,
    permitEndTime: value.permitEndTime,
    appointmentReason: value.appointmentReason,
    appointmentReasonLabel: getPermissionReasonLabel(
      value.appointmentReason,
      reasonConfig ? [reasonConfig] : undefined,
    ),
    reasonAllowsExecutiveAssignment: Boolean(
      reasonConfig?.allowsExecutiveAssignment,
    ),
    reasonUsesAppointmentDuration: Boolean(
      reasonConfig?.usesAppointmentDuration,
    ),
    reasonAppointmentDurationMinutes:
      reasonConfig?.appointmentDurationMinutes ?? 30,
    reasonUsesServiceStartTime: Boolean(reasonConfig?.usesServiceStartTime),
    reasonServiceStartTime: reasonConfig?.serviceStartTime ?? "",
    reasonUsesDateRange: Boolean(reasonConfig?.usesDateRange),
    reasonUsesPermitDetails: Boolean(reasonConfig?.usesPermitDetails),
    email: value.email,
    phone: value.phone,
    assignedExecutive: value.assignedExecutive,
    scheduledStartTime: value.scheduledStartTime,
    scheduledEndTime: value.scheduledEndTime,
    status,
    createdAt: value.createdAt.toISOString(),
  };
}
