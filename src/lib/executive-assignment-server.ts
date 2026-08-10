import { computeExecutiveAppointmentSlot } from "@/lib/executive-appointment-slot";
import { type AppointmentReasonConfig } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export type ExecutiveAssignmentValidation =
  | {
      ok: true;
      slot: {
        startTime: string;
        endTime: string;
      };
    }
  | {
      ok: false;
      message: string;
      limitReached?: boolean;
      executiveName?: string;
      appointmentDate?: string;
      currentCount?: number;
      max?: number;
    };

export async function validateExecutiveAssignmentForDate(
  assignedExecutiveName: string,
  appointmentDate: string,
  reason: AppointmentReasonConfig,
  excludeAppointmentId?: string,
): Promise<ExecutiveAssignmentValidation> {
  if (!reason.allowsExecutiveAssignment) {
    return { ok: false, message: "Este motivo no permite derivación." };
  }

  const executive = await prisma.executive.findUnique({
    where: { name: assignedExecutiveName },
  });

  if (!executive?.isActive) {
    return { ok: false, message: "Selecciona un ejecutivo activo." };
  }

  const appointmentDateValue = toDateOnly(appointmentDate);
  const assignmentFilter = {
    assignedExecutive: assignedExecutiveName,
    appointmentDate: appointmentDateValue,
    ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
  };

  if (executive.dailyLimitEnabled && executive.dailyLimitMax && executive.dailyLimitMax > 0) {
    const currentCount = await prisma.appointment.count({
      where: assignmentFilter,
    });

    if (currentCount >= executive.dailyLimitMax) {
      return {
        ok: false,
        message: `${assignedExecutiveName} ya llegó al tope de ${executive.dailyLimitMax} solicitudes para ese día.`,
        limitReached: true,
        executiveName: assignedExecutiveName,
        appointmentDate,
        currentCount,
        max: executive.dailyLimitMax,
      };
    }
  }

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      ...assignmentFilter,
      scheduledStartTime: { not: "" },
      scheduledEndTime: { not: "" },
    },
    select: {
      scheduledStartTime: true,
      scheduledEndTime: true,
    },
  });

  const slot = computeExecutiveAppointmentSlot({
    reason,
    executiveLunchBreak: {
      lunchBreakEnabled: executive.lunchBreakEnabled,
      lunchBreakStart: executive.lunchBreakStart,
      lunchBreakEnd: executive.lunchBreakEnd,
    },
    existingSlots: existingAppointments.map((appointment) => ({
      startTime: appointment.scheduledStartTime,
      endTime: appointment.scheduledEndTime,
    })),
  });

  if (!slot) {
    return { ok: false, message: "No se pudo calcular el horario de la cita." };
  }

  return {
    ok: true,
    slot: {
      startTime: slot.startTime,
      endTime: slot.endTime,
    },
  };
}
