export const APPOINTMENTS_STORAGE_KEY = "apoquindo-permission-appointments";

export const permissionReasons = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "licencia-medica", label: "Licencias médicas" },
  { value: "permisos", label: "Permisos" },
  { value: "otros", label: "Otros" },
] as const;

export const dateRangePermissionReasons = [
  "vacaciones",
  "licencia-medica",
] as const;

export const executives = [
  "Félix Morillo",
  "Verónica Díaz",
  "Juan Pablo González",
  "Margot Lozada",
  "Carlos Rojas",
  "Gonzalo Domingez",
] as const;

export const executiveEmails: Partial<Record<Executive, string>> = {
  "Félix Morillo": "fmorillo@transportesapoquindo.cl",
};

export type PermissionReason = (typeof permissionReasons)[number]["value"];
export type Executive = (typeof executives)[number];
export type PermitType = "dias" | "horas";

export type AppointmentStatus =
  | "pendiente"
  | "revisado"
  | "aprobado"
  | "rechazado";

export type Appointment = {
  id: string;
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
  email: string;
  phone: string;
  assignedExecutive: Executive | "";
  createdAt: string;
  status: AppointmentStatus;
};

export type AppointmentEmailPayload = Pick<
  Appointment,
  | "id"
  | "driverName"
  | "vehicleNumber"
  | "appointmentDate"
  | "appointmentReason"
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

export function getPermissionReasonLabel(value: string) {
  return (
    permissionReasons.find((reason) => reason.value === value)?.label ??
    "Sin motivo"
  );
}

export function appointmentReasonUsesDateRange(value: string) {
  return dateRangePermissionReasons.some((reason) => reason === value);
}

export function appointmentReasonUsesPermitDetails(value: string) {
  return value === "permisos";
}

export function getExecutiveEmail(value: string) {
  return executives.some((executive) => executive === value)
    ? executiveEmails[value as Executive] ?? ""
    : "";
}
