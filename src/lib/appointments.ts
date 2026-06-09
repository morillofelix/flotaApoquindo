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
  "permisos",
] as const;

export const executives = [
  "Verónica Díaz",
  "Juan Pablo González",
  "Margot Lozada",
  "Carlos Rojas",
  "Gonzalo Domingez",
] as const;

export type PermissionReason = (typeof permissionReasons)[number]["value"];
export type Executive = (typeof executives)[number];

export type AppointmentStatus = "pendiente" | "revisado" | "rechazado";

export type Appointment = {
  id: string;
  driverName: string;
  vehicleNumber: string;
  appointmentDate: string;
  vacationStartDate: string;
  vacationEndDate: string;
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
  Partial<Pick<Appointment, "vacationStartDate" | "vacationEndDate">>;

export function getPermissionReasonLabel(value: string) {
  return (
    permissionReasons.find((reason) => reason.value === value)?.label ??
    "Sin motivo"
  );
}

export function appointmentReasonUsesDateRange(value: string) {
  return dateRangePermissionReasons.some((reason) => reason === value);
}
