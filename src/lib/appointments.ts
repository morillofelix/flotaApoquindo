export const APPOINTMENTS_STORAGE_KEY = "apoquindo-permission-appointments";

import { type WeekdayKey } from "@/lib/appointment-reason-weekdays";

export type { WeekdayKey };
export {
  weekdayOptions,
  RESTRICTED_DAY_MESSAGE,
  formatRestrictedWeekdays,
  getSantiagoToday,
  isReasonRestrictedToday,
  parseRestrictedWeekdays,
  serializeRestrictedWeekdays,
} from "@/lib/appointment-reason-weekdays";

export type AppointmentReasonConfig = {
  id?: string;
  value: string;
  label: string;
  allowsExecutiveAssignment: boolean;
  usesDateRange: boolean;
  usesPermitDetails: boolean;
  isActive: boolean;
  restrictedWeekdays: WeekdayKey[];
  sortOrder: number;
};

export const defaultAppointmentReasons: AppointmentReasonConfig[] = [
  {
    value: "vacaciones",
    label: "Vacaciones",
    allowsExecutiveAssignment: false,
    usesDateRange: true,
    usesPermitDetails: false,
    isActive: true,
    restrictedWeekdays: [],
    sortOrder: 10,
  },
  {
    value: "licencia-medica",
    label: "Licencias médicas",
    allowsExecutiveAssignment: false,
    usesDateRange: true,
    usesPermitDetails: false,
    isActive: true,
    restrictedWeekdays: [],
    sortOrder: 20,
  },
  {
    value: "permisos",
    label: "Permisos",
    allowsExecutiveAssignment: false,
    usesDateRange: false,
    usesPermitDetails: true,
    isActive: true,
    restrictedWeekdays: [],
    sortOrder: 30,
  },
  {
    value: "otros",
    label: "Otros",
    allowsExecutiveAssignment: true,
    usesDateRange: false,
    usesPermitDetails: false,
    isActive: true,
    restrictedWeekdays: [],
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
  sortOrder: number;
};

export const defaultExecutives: ExecutiveConfig[] = [
  {
    name: "Félix Morillo",
    email: "fmorillo@transportesapoquindo.cl",
    isActive: true,
    sortOrder: 10,
  },
  {
    name: "Verónica Díaz",
    email: "",
    isActive: true,
    sortOrder: 20,
  },
  {
    name: "Juan Pablo González",
    email: "",
    isActive: true,
    sortOrder: 30,
  },
  {
    name: "Margot Lozada",
    email: "",
    isActive: true,
    sortOrder: 40,
  },
  {
    name: "Carlos Rojas",
    email: "",
    isActive: true,
    sortOrder: 50,
  },
  {
    name: "Gonzalo Domingez",
    email: "",
    isActive: true,
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
  reasonUsesDateRange: boolean;
  reasonUsesPermitDetails: boolean;
  email: string;
  phone: string;
  assignedExecutive: Executive | "";
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
