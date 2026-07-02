import {
  type Appointment,
  type ExecutiveConfig,
} from "@/lib/appointments";

export function countExecutiveAssignmentsForDate(
  appointments: Appointment[],
  executiveName: string,
  appointmentDate: string,
  excludeAppointmentId?: string,
) {
  return appointments.filter((appointment) => {
    if (excludeAppointmentId && appointment.id === excludeAppointmentId) {
      return false;
    }

    return (
      appointment.assignedExecutive === executiveName &&
      appointment.appointmentDate === appointmentDate
    );
  }).length;
}

export function getExecutiveDailyLimitStatus(
  executive: ExecutiveConfig | undefined,
  appointments: Appointment[],
  targetAppointment: Appointment,
  assignedExecutive: string,
) {
  if (!assignedExecutive || !executive?.dailyLimitEnabled) {
    return { blocked: false as const };
  }

  const max = executive.dailyLimitMax ?? 0;

  if (max <= 0) {
    return { blocked: false as const };
  }

  const currentCount = countExecutiveAssignmentsForDate(
    appointments,
    assignedExecutive,
    targetAppointment.appointmentDate,
    targetAppointment.id,
  );

  if (currentCount >= max) {
    return {
      blocked: true as const,
      executiveName: assignedExecutive,
      appointmentDate: targetAppointment.appointmentDate,
      currentCount,
      max,
    };
  }

  return { blocked: false as const };
}
