export const APPOINTMENTS_STORAGE_KEY = "apoquindo-permission-appointments";

import { type WeekdayKey } from "@/lib/appointment-reason-weekdays";

export type { WeekdayKey };
export {
  weekdayOptions,
  RESTRICTED_DAY_MESSAGE,
  formatRestrictedWeekdays,
  formatBusinessDayAdvanceSummary,
  getBusinessDayAdvanceMessage,
  getSantiagoToday,
  isReasonRestrictedToday,
  checkBusinessDayAdvance,
  parseRestrictedWeekdays,
  serializeRestrictedWeekdays,
} from "@/lib/appointment-reason-weekdays";

export type AppointmentReasonConfig = {
  id?: string;
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
  restrictedWeekdays: WeekdayKey[];
  requiresBusinessDayAdvance: boolean;
  businessDaysAdvance: number;
  sortOrder: number;
};

export const defaultAppointmentReasons: AppointmentReasonConfig[] = [
  {
    value: "vacaciones",
    label: "Vacaciones",
    allowsExecutiveAssignment: false,
    usesAppointmentDuration: false,
    appointmentDurationMinutes: 30,
    usesServiceStartTime: false,
    serviceStartTime: "",
    usesDateRange: true,
    usesPermitDetails: false,
    isActive: true,
    restrictedWeekdays: [],
    requiresBusinessDayAdvance: false,
    businessDaysAdvance: 0,
    sortOrder: 10,
  },
  {
    value: "licencia-medica",
    label: "Licencias médicas",
    allowsExecutiveAssignment: false,
    usesAppointmentDuration: false,
    appointmentDurationMinutes: 30,
    usesServiceStartTime: false,
    serviceStartTime: "",
    usesDateRange: true,
    usesPermitDetails: false,
    isActive: true,
    restrictedWeekdays: [],
    requiresBusinessDayAdvance: false,
    businessDaysAdvance: 0,
    sortOrder: 20,
  },
  {
    value: "permisos",
    label: "Permisos",
    allowsExecutiveAssignment: false,
    usesAppointmentDuration: false,
    appointmentDurationMinutes: 30,
    usesServiceStartTime: false,
    serviceStartTime: "",
    usesDateRange: false,
    usesPermitDetails: true,
    isActive: true,
    restrictedWeekdays: [],
    requiresBusinessDayAdvance: false,
    businessDaysAdvance: 0,
    sortOrder: 30,
  },
  {
    value: "otros",
    label: "Otros",
    allowsExecutiveAssignment: true,
    usesAppointmentDuration: true,
    appointmentDurationMinutes: 30,
    usesServiceStartTime: false,
    serviceStartTime: "",
    usesDateRange: false,
    usesPermitDetails: false,
    isActive: true,
    restrictedWeekdays: [],
    requiresBusinessDayAdvance: false,
    businessDaysAdvance: 0,
    sortOrder: 40,
  },
];

export const permissionReasons = defaultAppointmentReasons.map(
  ({ value, label }) => ({ value, label }),
);

export type ExecutiveConfig = {
  id?: string;
  name: string;
  email: string;
  isActive: boolean;
  dailyLimitEnabled: boolean;
  dailyLimitMax: number | null;
  lunchBreakEnabled: boolean;
  lunchBreakStart: string;
  lunchBreakEnd: string;
  sortOrder: number;
};

export const defaultExecutives: ExecutiveConfig[] = [
  {
    name: "Félix Morillo",
    email: "fmorillo@transportesapoquindo.cl",
    isActive: true,
    dailyLimitEnabled: false,
    dailyLimitMax: null,
    lunchBreakEnabled: false,
    lunchBreakStart: "",
    lunchBreakEnd: "",
    sortOrder: 10,
  },
  {
    name: "Verónica Díaz",
    email: "",
    isActive: true,
    dailyLimitEnabled: false,
    dailyLimitMax: null,
    lunchBreakEnabled: false,
    lunchBreakStart: "",
    lunchBreakEnd: "",
    sortOrder: 20,
  },
  {
    name: "Juan Pablo González",
    email: "",
    isActive: true,
    dailyLimitEnabled: false,
    dailyLimitMax: null,
    lunchBreakEnabled: false,
    lunchBreakStart: "",
    lunchBreakEnd: "",
    sortOrder: 30,
  },
  {
    name: "Margot Lozada",
    email: "",
    isActive: true,
    dailyLimitEnabled: false,
    dailyLimitMax: null,
    lunchBreakEnabled: false,
    lunchBreakStart: "",
    lunchBreakEnd: "",
    sortOrder: 40,
  },
  {
    name: "Carlos Rojas",
    email: "",
    isActive: true,
    dailyLimitEnabled: false,
    dailyLimitMax: null,
    lunchBreakEnabled: false,
    lunchBreakStart: "",
    lunchBreakEnd: "",
    sortOrder: 50,
  },
  {
    name: "Gonzalo Domingez",
    email: "",
    isActive: true,
    dailyLimitEnabled: false,
    dailyLimitMax: null,
    lunchBreakEnabled: false,
    lunchBreakStart: "",
    lunchBreakEnd: "",
    sortOrder: 60,
  },
];

export type PermissionReason = string;
export type Executive = string;
export type PermitType = "dias" | "horas";

export type AppointmentStatus =
  | "pendiente"
  | "revisado"
  | "aprobado"
  | "rechazado"
  | "cancelado";

export type Appointment = {
  id: string;
  ticketNumber: number;
  driverName: string;
  vehicleNumber: string;
  appointmentDate: string;
  vacationStartDate: string;
  vacationEndDate: string;
  permitType: PermitType | "";
  permitStartDate: string;
  permitEndDate: string;
  permitDate: string;
  permitStartTime: string;
  permitEndTime: string;
  appointmentReason: PermissionReason;
  appointmentReasonLabel: string;
  reasonAllowsExecutiveAssignment: boolean;
  reasonUsesAppointmentDuration: boolean;
  reasonAppointmentDurationMinutes: number;
  reasonUsesServiceStartTime: boolean;
  reasonServiceStartTime: string;
  reasonUsesDateRange: boolean;
  reasonUsesPermitDetails: boolean;
  email: string;
  phone: string;
  assignedExecutive: Executive | "";
  scheduledStartTime: string;
  scheduledEndTime: string;
  createdAt: string;
  status: AppointmentStatus;
};

export type AppointmentEmailPayload = Pick<
  Appointment,
  | "id"
  | "ticketNumber"
  | "driverName"
  | "vehicleNumber"
  | "appointmentDate"
  | "appointmentReason"
  | "appointmentReasonLabel"
  | "reasonUsesDateRange"
  | "reasonUsesPermitDetails"
  | "email"
  | "phone"
  | "createdAt"
> &
  Partial<
    Pick<
      Appointment,
      | "vacationStartDate"
      | "vacationEndDate"
      | "permitType"
      | "permitStartDate"
      | "permitEndDate"
      | "permitDate"
      | "permitStartTime"
      | "permitEndTime"
    >
  >;

function getReasonConfig(value: string, reasons = defaultAppointmentReasons) {
  return reasons.find((reason) => reason.value === value);
}

export function getPermissionReasonLabel(
  value: string,
  reasons = defaultAppointmentReasons,
) {
  return (
    getReasonConfig(value, reasons)?.label ??
    "Sin motivo"
  );
}

export function getAppointmentTicketLabel(
  appointment: Pick<Appointment, "id"> & Partial<Pick<Appointment, "ticketNumber">>,
) {
  return typeof appointment.ticketNumber === "number" && appointment.ticketNumber > 0
    ? `APQ-${appointment.ticketNumber.toString().padStart(6, "0")}`
    : appointment.id;
}

export function appointmentReasonAllowsExecutive(
  value: string,
  reasons = defaultAppointmentReasons,
) {
  return Boolean(getReasonConfig(value, reasons)?.allowsExecutiveAssignment);
}

export function appointmentReasonUsesDateRange(
  value: string,
  reasons = defaultAppointmentReasons,
) {
  return Boolean(getReasonConfig(value, reasons)?.usesDateRange);
}

export function appointmentReasonUsesPermitDetails(
  value: string,
  reasons = defaultAppointmentReasons,
) {
  return Boolean(getReasonConfig(value, reasons)?.usesPermitDetails);
}
