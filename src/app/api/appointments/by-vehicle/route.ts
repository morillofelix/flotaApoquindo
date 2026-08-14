import {
  getPermissionReasonLabel,
  type AppointmentStatus,
} from "@/lib/appointments";
import { resolveAppointmentSchedule } from "@/lib/appointment-scheduling";
import { readDriverSession } from "@/lib/driver-auth";
import { toReasonConfig } from "@/lib/appointments-mapper";
import { normalizeAppointmentCreatedByType } from "@/lib/appointment-origin";
import { normalizeVehicleNumber } from "@/lib/driver-owners";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export type PublicAppointmentSummary = {
  id: string;
  ticketLabel: string;
  appointmentReasonLabel: string;
  status: AppointmentStatus;
  assignedExecutive: string;
  allowsExecutiveAssignment: boolean;
  scheduledSummary: string;
  dateChangePending: boolean;
  dateChangeMessage: string;
  driverApprovalPending: boolean;
  driverApprovalRejected: boolean;
  driverApprovalMessage: string;
  rejectionMessage: string;
  createdByType: string;
  createdByExecutiveName: string;
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

function vehicleNumberMatchCandidates(raw: string) {
  const normalized = normalizeVehicleNumber(raw);
  const digits = raw.replace(/\D/g, "");
  const candidates = new Set<string>();

  if (raw.trim()) {
    candidates.add(raw.trim());
  }
  if (normalized) {
    candidates.add(normalized);
  }
  if (digits) {
    candidates.add(digits);
    candidates.add(digits.replace(/^0+/, "") || digits);
    candidates.add(digits.padStart(3, "0"));
  }

  return [...candidates].filter(Boolean);
}

function mapAppointmentRow(
  appointment: {
    id: string;
    ticketNumber: number;
    vehicleNumber: string;
    appointmentDate: Date;
    appointmentReason: string;
    assignedExecutive: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    status: string;
    dateChangePending: boolean;
    dateChangeMessage: string;
    driverApprovalPending: boolean;
    driverApprovalRejected: boolean;
    driverApprovalMessage: string;
    rejectionMessage?: string;
    createdByType: string;
    createdByExecutiveName: string;
    createdAt: Date;
  },
  reasonByValue: Map<string, Parameters<typeof toReasonConfig>[0] & object>,
  executiveByName: Map<
    string,
    {
      lunchBreakEnabled: boolean;
      lunchBreakStart: string;
      lunchBreakEnd: string;
    }
  >,
): PublicAppointmentSummary {
  const reason = reasonByValue.get(appointment.appointmentReason) ?? null;
  const status = validStatuses.includes(appointment.status as AppointmentStatus)
    ? (appointment.status as AppointmentStatus)
    : "pendiente";
  const reasonConfig = toReasonConfig(reason) ?? undefined;
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
          reasonUsesAppointmentDuration: reasonConfig.usesAppointmentDuration,
          reasonAppointmentDurationMinutes:
            reasonConfig.appointmentDurationMinutes,
          scheduledStartTime: appointment.scheduledStartTime,
          scheduledEndTime: appointment.scheduledEndTime,
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
    id: appointment.id,
    ticketLabel: formatTicketLabel(appointment.ticketNumber),
    appointmentReasonLabel: getPermissionReasonLabel(
      appointment.appointmentReason,
      reasonConfig ? [reasonConfig] : undefined,
    ),
    status,
    assignedExecutive,
    allowsExecutiveAssignment: Boolean(reasonConfig?.allowsExecutiveAssignment),
    scheduledSummary: schedule?.summaryLabel ?? "",
    dateChangePending: appointment.dateChangePending,
    dateChangeMessage: appointment.dateChangeMessage,
    driverApprovalPending: appointment.driverApprovalPending,
    driverApprovalRejected: appointment.driverApprovalRejected,
    driverApprovalMessage: appointment.driverApprovalMessage,
    rejectionMessage: appointment.rejectionMessage ?? "",
    createdByType: normalizeAppointmentCreatedByType(appointment.createdByType),
    createdByExecutiveName: appointment.createdByExecutiveName,
    createdAt: appointment.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const session = readDriverSession(request);

  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const vehicleCandidates = vehicleNumberMatchCandidates(session.vehicleNumber);

  if (vehicleCandidates.length === 0) {
    return NextResponse.json({ appointments: [] });
  }

  try {
    const reasons = await prisma.appointmentReason.findMany();
    const executives = await prisma.executive.findMany();
    const reasonByValue = new Map(
      reasons.map((reason) => [reason.value, reason]),
    );
    const executiveByName = new Map(
      executives.map((executive) => [executive.name, executive]),
    );

    const appointmentSelect = {
      id: true,
      ticketNumber: true,
      vehicleNumber: true,
      appointmentDate: true,
      appointmentReason: true,
      assignedExecutive: true,
      scheduledStartTime: true,
      scheduledEndTime: true,
      status: true,
      dateChangePending: true,
      dateChangeMessage: true,
      driverApprovalPending: true,
      driverApprovalRejected: true,
      driverApprovalMessage: true,
      rejectionMessage: true,
      createdByType: true,
      createdByExecutiveName: true,
      createdAt: true,
    } as const;

    const [pendingRows, recentRows] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          vehicleNumber: { in: vehicleCandidates },
          OR: [
            { driverApprovalPending: true },
            { dateChangePending: true },
            { status: "rechazado", NOT: { rejectionMessage: "" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: appointmentSelect,
      }),
      prisma.appointment.findMany({
        where: {
          vehicleNumber: { in: vehicleCandidates },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: appointmentSelect,
      }),
    ]);

    const byId = new Map<string, (typeof recentRows)[number]>();
    for (const row of [...pendingRows, ...recentRows]) {
      if (!byId.has(row.id)) {
        byId.set(row.id, row);
      }
    }

    const appointments = [...byId.values()]
      .sort((left, right) => {
        const leftPriority =
          left.driverApprovalPending || left.dateChangePending ? 1 : 0;
        const rightPriority =
          right.driverApprovalPending || right.dateChangePending ? 1 : 0;
        if (leftPriority !== rightPriority) {
          return rightPriority - leftPriority;
        }
        return right.createdAt.getTime() - left.createdAt.getTime();
      })
      .slice(0, 5)
      .map((appointment) =>
        mapAppointmentRow(appointment, reasonByValue, executiveByName),
      );

    return NextResponse.json({ appointments });
  } catch {
    return NextResponse.json(
      { message: "No se pudieron cargar las solicitudes." },
      { status: 500 },
    );
  }
}
