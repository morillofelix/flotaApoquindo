import {
  getPermissionReasonLabel,
  type AppointmentStatus,
} from "@/lib/appointments";
import { resolveAppointmentSchedule } from "@/lib/appointment-scheduling";
import { parseRestrictedWeekdays } from "@/lib/appointment-reason-weekdays";
import { readDriverSession } from "@/lib/driver-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export type PublicAppointmentSummary = {
  ticketLabel: string;
  appointmentReasonLabel: string;
  status: AppointmentStatus;
  assignedExecutive: string;
  allowsExecutiveAssignment: boolean;
  scheduledSummary: string;
  createdAt: string;
};

const validStatuses: AppointmentStatus[] = [
  "pendiente",
  "revisado",
  "aprobado",
  "rechazado",
  "cancelado",
];

function formatTicketLabel(ticketNumber: number) {
  return ticketNumber > 0
    ? `APQ-${ticketNumber.toString().padStart(6, "0")}`
    : "";
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function matchesVehicleNumber(stored: string, query: string) {
  if (stored === query) {
    return true;
  }

  const storedDigits = stored.replace(/\D/g, "");
  const queryDigits = query.replace(/\D/g, "");

  if (!queryDigits) {
    return false;
  }

  return storedDigits === queryDigits;
}

export async function GET(request: NextRequest) {
  const session = readDriverSession(request);

  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const vehicleNumber = session.vehicleNumber;

  try {
    const reasons = await prisma.appointmentReason.findMany();
    const executives = await prisma.executive.findMany();
    const reasonByValue = new Map(reasons.map((reason) => [reason.value, reason]));
    const executiveByName = new Map(
      executives.map((executive) => [executive.name, executive]),
    );

    const candidates = await prisma.appointment.findMany({
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        ticketNumber: true,
        vehicleNumber: true,
        appointmentDate: true,
        appointmentReason: true,
        assignedExecutive: true,
        status: true,
        createdAt: true,
      },
    });

    const appointments = candidates
      .filter((appointment) =>
        matchesVehicleNumber(appointment.vehicleNumber, vehicleNumber),
      )
      .slice(0, 3)
      .map((appointment) => {
        const reason = reasonByValue.get(appointment.appointmentReason);
        const status = validStatuses.includes(
          appointment.status as AppointmentStatus,
        )
          ? (appointment.status as AppointmentStatus)
          : "pendiente";
        const reasonConfig = reason
          ? {
              value: reason.value,
              label: reason.label,
              allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
              usesAppointmentDuration: reason.usesAppointmentDuration,
              appointmentDurationMinutes: reason.appointmentDurationMinutes,
              usesDateRange: reason.usesDateRange,
              usesPermitDetails: reason.usesPermitDetails,
              isActive: reason.isActive,
              restrictedWeekdays: parseRestrictedWeekdays(
                reason.restrictedWeekdays,
              ),
              requiresBusinessDayAdvance: reason.requiresBusinessDayAdvance,
              businessDaysAdvance: reason.businessDaysAdvance,
              sortOrder: reason.sortOrder,
            }
          : undefined;
        const assignedExecutive = appointment.assignedExecutive.trim();
        const executive = executiveByName.get(assignedExecutive);
        const schedule =
          assignedExecutive &&
          (status === "revisado" || status === "aprobado") &&
          reasonConfig?.allowsExecutiveAssignment
            ? resolveAppointmentSchedule({
                appointmentDate: formatDateOnly(appointment.appointmentDate),
                reasonAllowsExecutiveAssignment:
                  reasonConfig.allowsExecutiveAssignment,
                reasonUsesAppointmentDuration:
                  reasonConfig.usesAppointmentDuration,
                reasonAppointmentDurationMinutes:
                  reasonConfig.appointmentDurationMinutes,
                executiveLunchBreak: executive
                  ? {
                      lunchBreakEnabled: executive.lunchBreakEnabled,
                      lunchBreakStart: executive.lunchBreakStart,
                      lunchBreakEnd: executive.lunchBreakEnd,
                    }
                  : null,
              })
            : null;

        return {
          ticketLabel: formatTicketLabel(appointment.ticketNumber),
          appointmentReasonLabel: getPermissionReasonLabel(
            appointment.appointmentReason,
            reasonConfig ? [reasonConfig] : undefined,
          ),
          status,
          assignedExecutive,
          allowsExecutiveAssignment: Boolean(
            reason?.allowsExecutiveAssignment,
          ),
          scheduledSummary: schedule?.summaryLabel ?? "",
          createdAt: appointment.createdAt.toISOString(),
        } satisfies PublicAppointmentSummary;
      });

    return NextResponse.json({ appointments });
  } catch {
    return NextResponse.json(
      { message: "No se pudieron cargar las solicitudes." },
      { status: 500 },
    );
  }
}
