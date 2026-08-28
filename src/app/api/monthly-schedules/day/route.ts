import { requireAdminPermission } from "@/lib/admin-api-server";
import { writeAuditLog } from "@/lib/audit-log";
import { readAdminSession } from "@/lib/driver-auth";
import {
  applyManualPlanningDayStatus,
  applyPlanningBlockToDriver,
  type PlanningBlockMode,
  serializePlanningDriverBlock,
} from "@/lib/planning-block-sync";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DayChange = {
  id?: unknown;
  statusCode?: unknown;
  observation?: unknown;
  isManualOverride?: unknown;
  expectedVersion?: unknown;
  blockMode?: unknown;
  blockStartDate?: unknown;
  blockEndDate?: unknown;
  blockStartTime?: unknown;
  blockEndTime?: unknown;
};

class VersionConflictError extends Error {}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function isBlockMode(value: unknown): value is PlanningBlockMode {
  return value === "days" || value === "hours";
}

function serializeDay(day: {
  id: string;
  date: Date;
  version: number;
  observation: string;
  changeOrigin: string;
  isManualOverride: boolean;
  startTime: string;
  endTime: string;
  createdAt: Date;
  updatedAt: Date;
  modifiedAt: Date | null;
  effectiveStatus: {
    id: string;
    code: string;
    name: string;
    color: string;
    blocksAssignments: boolean;
    indicatesAvailability: boolean;
  } | null;
  driverBlock: {
    id: string;
    startsAt: Date;
    endsAt: Date | null;
    observation: string;
    isActive: boolean;
    status: string;
  } | null;
}) {
  return {
    id: day.id,
    date: day.date.toISOString().slice(0, 10),
    version: day.version,
    observation: day.observation,
    changeOrigin: day.changeOrigin,
    isManualOverride: day.isManualOverride,
    startTime: day.startTime,
    endTime: day.endTime,
    effectiveStatus: day.effectiveStatus,
    driverBlock: serializePlanningDriverBlock(day.driverBlock),
    createdAt: day.createdAt.toISOString(),
    updatedAt: day.updatedAt.toISOString(),
    modifiedAt: day.modifiedAt?.toISOString() ?? null,
  };
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as DayChange & { days?: unknown };
    const changes: DayChange[] = Array.isArray(body.days)
      ? (body.days as DayChange[])
      : [body];

    if (changes.length === 0 || changes.length > 500) {
      return NextResponse.json({ message: "Cantidad de días inválida." }, { status: 400 });
    }

    const session = readAdminSession(request);
    const updated = [];

    for (const change of changes) {
      const id = text(change.id);
      const statusCode = text(change.statusCode).toUpperCase();
      const expectedVersion = Number(change.expectedVersion);
      if (!id || !statusCode || !Number.isInteger(expectedVersion)) {
        throw new Error("Cada cambio requiere id, statusCode y expectedVersion.");
      }

      const previous = await prisma.dailySchedule.findUnique({
        where: { id },
        include: { effectiveStatus: true },
      });
      if (!previous) {
        throw new Error("Día de planificación no encontrado.");
      }

      if (statusCode === "BLOQUEADO") {
        const blockMode = change.blockMode;
        if (!isBlockMode(blockMode)) {
          throw new Error("Indique si el bloqueo es por días o por horas.");
        }

        await applyPlanningBlockToDriver(
          previous.driverOwnerId,
          {
            mode: blockMode,
            startDate:
              text(change.blockStartDate) ||
              previous.date.toISOString().slice(0, 10),
            endDate: text(change.blockEndDate) || undefined,
            startTime: text(change.blockStartTime) || undefined,
            endTime: text(change.blockEndTime) || undefined,
            observation: text(change.observation),
          },
          { createdByEmail: session?.email },
        );

        const current = await prisma.dailySchedule.findUnique({
          where: { id },
          include: {
            effectiveStatus: true,
            driverBlock: {
              select: {
                id: true,
                startsAt: true,
                endsAt: true,
                observation: true,
                isActive: true,
                status: true,
              },
            },
          },
        });

        await writeAuditLog({
          module: "planificacion-mensual",
          action: "create-block",
          entityType: "DailySchedule",
          entityId: id,
          previousValue: previous,
          newValue: current,
          userEmail: session?.email ?? "",
        });

        if (current) {
          updated.push(serializeDay(current));
        }
        continue;
      }

      const current = await applyManualPlanningDayStatus({
        dayId: id,
        statusCode,
        observation:
          change.observation === undefined ? undefined : text(change.observation),
        expectedVersion,
        modifiedByEmail: session?.email,
      });

      if (!current) {
        throw new Error("No se pudo actualizar el día.");
      }

      await writeAuditLog({
        module: "planificacion-mensual",
        action: "update-day",
        entityType: "DailySchedule",
        entityId: id,
        previousValue: previous,
        newValue: current,
        userEmail: session?.email ?? "",
      });

      updated.push(serializeDay(current));
    }

    return NextResponse.json({ days: updated });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message === "VERSION_CONFLICT") {
      return NextResponse.json(
        { message: "La planificación fue modificada por otro usuario." },
        { status: 409 },
      );
    }
    console.error("[monthly-schedules/day PATCH]", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "No se pudo actualizar el día.",
      },
      { status: 400 },
    );
  }
}
