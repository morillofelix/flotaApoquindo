import type { NextRequest } from "next/server";
import type {
  AppointmentStatus,
  AppointmentStatusAudit,
} from "@/lib/appointments";
import { readAdminSession } from "@/lib/driver-auth";
import { normalizeEmail } from "@/lib/password-utils";
import { prisma } from "@/lib/prisma";

const AUDIT_MODULE = "solicitudes";
const AUDIT_ENTITY = "Appointment";
const AUDIT_ACTIONS = ["cambio-estado", "anular"] as const;

type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AppointmentAuditActor = {
  email: string;
  name: string;
};

export async function resolveAppointmentAuditActor(
  request: NextRequest,
): Promise<AppointmentAuditActor> {
  const session = readAdminSession(request);
  const email = normalizeEmail(session?.email ?? "");
  const fallbackName = (session?.user ?? "").trim();

  if (!session) {
    return { email: "", name: "" };
  }

  try {
    const accessUser = session.accessUserId
      ? await prisma.accessUser.findUnique({
          where: { id: session.accessUserId },
          select: { email: true, fullName: true },
        })
      : email
        ? await prisma.accessUser.findUnique({
            where: { email },
            select: { email: true, fullName: true },
          })
        : null;

    return {
      email: accessUser?.email ?? email,
      name: accessUser?.fullName.trim() || fallbackName || email,
    };
  } catch {
    return { email, name: fallbackName || email };
  }
}

export async function recordAppointmentStatusAudit({
  appointmentId,
  action,
  previousStatus,
  nextStatus,
  actor,
  reason,
}: {
  appointmentId: string;
  action: AuditAction;
  previousStatus: string;
  nextStatus: AppointmentStatus;
  actor: AppointmentAuditActor;
  reason?: string;
}): Promise<AppointmentStatusAudit | null> {
  try {
    const entry = await prisma.auditLog.create({
      data: {
        module: AUDIT_MODULE,
        action,
        entityType: AUDIT_ENTITY,
        entityId: appointmentId,
        previousValue: previousStatus,
        newValue: JSON.stringify({ status: nextStatus, userName: actor.name }),
        reason: (reason ?? "").slice(0, 400),
        origin: "panel",
        userEmail: actor.email,
      },
    });

    return toStatusAudit(entry);
  } catch (error) {
    console.error("No se pudo registrar la auditoría de la solicitud:", error);
    return null;
  }
}

function toStatusAudit(entry: {
  action: string;
  previousValue: string;
  newValue: string;
  reason: string;
  userEmail: string;
  createdAt: Date;
}): AppointmentStatusAudit | null {
  let status = "";
  let userName = "";

  try {
    const parsed = JSON.parse(entry.newValue) as {
      status?: unknown;
      userName?: unknown;
    };
    status = typeof parsed.status === "string" ? parsed.status : "";
    userName = typeof parsed.userName === "string" ? parsed.userName : "";
  } catch {
    return null;
  }

  if (!status) {
    return null;
  }

  return {
    action: entry.action === "anular" ? "anular" : "cambio-estado",
    status: status as AppointmentStatus,
    previousStatus: entry.previousValue,
    userEmail: entry.userEmail,
    userName: userName || entry.userEmail,
    reason: entry.reason,
    at: entry.createdAt.toISOString(),
  };
}

export async function loadLatestAppointmentStatusAudits(
  appointmentIds?: string[],
): Promise<Map<string, AppointmentStatusAudit>> {
  const result = new Map<string, AppointmentStatusAudit>();

  if (appointmentIds && appointmentIds.length === 0) {
    return result;
  }

  try {
    const entries = await prisma.auditLog.findMany({
      where: {
        module: AUDIT_MODULE,
        entityType: AUDIT_ENTITY,
        action: { in: [...AUDIT_ACTIONS] },
        ...(appointmentIds ? { entityId: { in: appointmentIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        entityId: true,
        action: true,
        previousValue: true,
        newValue: true,
        reason: true,
        userEmail: true,
        createdAt: true,
      },
    });

    for (const entry of entries) {
      if (result.has(entry.entityId)) {
        continue;
      }

      const audit = toStatusAudit(entry);

      if (audit) {
        result.set(entry.entityId, audit);
      }
    }
  } catch (error) {
    console.error("No se pudo cargar la auditoría de solicitudes:", error);
  }

  return result;
}
