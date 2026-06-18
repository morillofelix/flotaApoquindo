import {
  type Appointment,
  type AppointmentReasonConfig,
  type ExecutiveConfig,
  defaultAppointmentReasons,
  defaultExecutives,
} from "@/lib/appointments";
import { type DriverOwnerConfig } from "@/lib/driver-owners";

export async function loadAppointments() {
  const response = await fetch("/api/appointments", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar las solicitudes.");
  }

  const data = (await response.json()) as { appointments?: Appointment[] };
  return data.appointments ?? [];
}

export async function loadAppointmentReasons() {
  const response = await fetch("/api/appointment-reasons", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los motivos.");
  }

  const data = (await response.json()) as {
    reasons?: AppointmentReasonConfig[];
  };

  return data.reasons ?? defaultAppointmentReasons;
}

export async function loadExecutives() {
  const response = await fetch("/api/executives", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los ejecutivos.");
  }

  const data = (await response.json()) as {
    executives?: ExecutiveConfig[];
  };

  return data.executives ?? defaultExecutives;
}

export async function loadDriverOwners() {
  const response = await fetch("/api/driver-owners", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los conductores y propietarios.");
  }

  const data = (await response.json()) as {
    driverOwners?: DriverOwnerConfig[];
  };

  return data.driverOwners ?? [];
}
