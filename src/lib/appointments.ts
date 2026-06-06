export const APPOINTMENTS_STORAGE_KEY = "apoquindo-permission-appointments";

export const permissionReasons = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "licencia-medica", label: "Licencias médicas" },
  { value: "otros", label: "Otros" },
] as const;

export type PermissionReason = (typeof permissionReasons)[number]["value"];

export type AppointmentStatus = "pendiente" | "revisado" | "rechazado";

export type Appointment = {
  id: string;
  driverName: string;
  vehicleNumber: string;
  appointmentDate: string;
  appointmentReason: PermissionReason;
  email: string;
  phone: string;
  createdAt: string;
  status: AppointmentStatus;
};

export function getPermissionReasonLabel(value: string) {
  return (
    permissionReasons.find((reason) => reason.value === value)?.label ??
    "Sin motivo"
  );
}
