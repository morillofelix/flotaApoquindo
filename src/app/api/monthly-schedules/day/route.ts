import { requireAdminPermission } from "@/lib/admin-api-server";
import { writeAuditLog } from "@/lib/audit-log";
import { readAdminSession } from "@/lib/driver-auth";
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
};

class VersionConflictError extends Error {}
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

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
    const updated = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const change of changes) {
        const id = text(change.id);
        const statusCode = text(change.statusCode).toUpperCase();
        const expectedVersion = Number(change.expectedVersion);
        if (!id || !statusCode || !Number.isInteger(expectedVersion)) {
          throw new Error("Cada cambio requiere id, statusCode y expectedVersion.");
        }
        const status = await tx.operationalStatus.findUnique({
          where: { code: statusCode },
        });
        if (!status || !status.isActive) throw new Error(`Estado ${statusCode} inválido.`);
        const previous = await tx.dailySchedule.findUnique({ where: { id } });
        if (!previous) throw new Error("Día de planificación no encontrado.");
        const result = await tx.dailySchedule.updateMany({
          where: { id, version: expectedVersion },
          data: {
            effectiveStatusId: status.id,
            observation:
              change.observation === undefined
                ? previous.observation
                : text(change.observation),
            isManualOverride:
              change.isManualOverride === undefined
                ? true
                : change.isManualOverride === true,
            changeOrigin: "manual",
            modifiedByEmail: session?.email ?? "",
            modifiedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new VersionConflictError("La planificación fue modificada.");
        const current = await tx.dailySchedule.findUnique({
          where: { id },
          include: { effectiveStatus: true },
        });
        await writeAuditLog(
          {
            module: "planificacion-mensual",
            action: "update-day",
            entityType: "DailySchedule",
            entityId: id,
            previousValue: previous,
            newValue: current,
            userEmail: session?.email ?? "",
          },
          tx,
        );
        results.push(current);
      }
      return results;
    });
    return NextResponse.json({
      days: updated.map((day) => ({
        ...day,
        date: day?.date.toISOString().slice(0, 10),
        createdAt: day?.createdAt.toISOString(),
        updatedAt: day?.updatedAt.toISOString(),
        modifiedAt: day?.modifiedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    console.error("[monthly-schedules/day PATCH]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo actualizar el día." },
      { status: 400 },
    );
  }
}
