import { requireAdminPermission } from "@/lib/admin-api-server";
import { writeAuditLog } from "@/lib/audit-log";
import { readAdminSession } from "@/lib/driver-auth";
import { isValidPlanningMonth } from "@/lib/fleet-schedule";
import {
  copyMonthlyScheduleFromPrevious,
  deleteMonthlyScheduleScope,
  generateMonthlySchedule,
  previewMonthlyScheduleDeletion,
  previewMonthlyScheduleGeneration,
  type GenerateScope,
} from "@/lib/monthly-schedule-engine";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function planningMonth(request: NextRequest) {
  return {
    year: Number(request.nextUrl.searchParams.get("year")),
    month: Number(request.nextUrl.searchParams.get("month")),
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseScope(body: Record<string, unknown>): GenerateScope {
  const modeRaw = asString(body.mode) || asString(body.scopeMode) || "all";
  const mode =
    modeRaw === "group" ||
    modeRaw === "vehicle" ||
    modeRaw === "range" ||
    modeRaw === "vehicles" ||
    modeRaw === "shift" ||
    modeRaw === "all"
      ? modeRaw
      : "all";

  const vehicleNumbers = Array.isArray(body.vehicleNumbers)
    ? body.vehicleNumbers
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  return {
    mode,
    groupId: asString(body.groupId) || undefined,
    vehicleNumber: asString(body.vehicleNumber) || undefined,
    vehicleFrom: asString(body.vehicleFrom) || undefined,
    vehicleTo: asString(body.vehicleTo) || undefined,
    vehicleNumbers,
    shiftDefinitionId: asString(body.shiftDefinitionId) || undefined,
  };
}

function scopeFromSearchParams(request: NextRequest): GenerateScope {
  return {
    mode: (asString(request.nextUrl.searchParams.get("mode")) ||
      "all") as GenerateScope["mode"],
    groupId: asString(request.nextUrl.searchParams.get("groupId")) || undefined,
    vehicleNumber:
      asString(request.nextUrl.searchParams.get("vehicleNumber")) || undefined,
    vehicleFrom:
      asString(request.nextUrl.searchParams.get("vehicleFrom")) || undefined,
    vehicleTo:
      asString(request.nextUrl.searchParams.get("vehicleTo")) || undefined,
    shiftDefinitionId:
      asString(request.nextUrl.searchParams.get("shiftDefinitionId")) ||
      undefined,
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  const { year, month } = planningMonth(request);
  if (!isValidPlanningMonth(year, month)) {
    return NextResponse.json({ message: "Mes inválido." }, { status: 400 });
  }

  const preview = request.nextUrl.searchParams.get("preview") === "1";
  const deletePreview =
    request.nextUrl.searchParams.get("deletePreview") === "1";
  if (preview || deletePreview) {
    try {
      const scope = scopeFromSearchParams(request);
      if (deletePreview) {
        const result = await previewMonthlyScheduleDeletion({
          year,
          month,
          scope,
        });
        return NextResponse.json({ preview: result });
      }
      const result = await previewMonthlyScheduleGeneration({
        year,
        month,
        scope,
      });
      return NextResponse.json({ preview: result });
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "No se pudo calcular el alcance.",
        },
        { status: 400 },
      );
    }
  }

  try {
    const schedule = await prisma.monthlySchedule.findUnique({
      where: { year_month: { year, month } },
      include: {
        days: {
          include: {
            driverOwner: {
              select: {
                id: true,
                vehicleNumber: true,
                fullName: true,
                group: { select: { id: true, code: true, name: true } },
              },
            },
            baseStatus: {
              select: { id: true, code: true, name: true, color: true },
            },
            effectiveStatus: {
              select: {
                id: true,
                code: true,
                name: true,
                color: true,
                blocksAssignments: true,
                indicatesAvailability: true,
              },
            },
            shiftAssignment: {
              select: {
                shiftDefinition: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
            _count: { select: { events: true } },
          },
          orderBy: [{ driverOwner: { vehicleNumber: "asc" } }, { date: "asc" }],
        },
      },
    });
    if (!schedule) {
      return NextResponse.json({
        schedule: null,
        days: [],
        summary: { totalDays: 0, drivers: 0, manualOverrides: 0, byStatus: {} },
      });
    }
    const byStatus: Record<string, number> = {};
    const driverIds = new Set<string>();
    let manualOverrides = 0;
    const days = schedule.days.map((day) => {
      const code = day.effectiveStatus?.code ?? "SIN_ESTADO";
      byStatus[code] = (byStatus[code] ?? 0) + 1;
      driverIds.add(day.driverOwnerId);
      if (day.isManualOverride) manualOverrides += 1;
      return {
        id: day.id,
        date: day.date.toISOString().slice(0, 10),
        driverOwnerId: day.driverOwnerId,
        vehicleNumber: day.vehicleNumber,
        driver: day.driverOwner,
        baseStatus: day.baseStatus,
        effectiveStatus: day.effectiveStatus,
        shift: day.shiftAssignment?.shiftDefinition ?? null,
        observation: day.observation,
        changeOrigin: day.changeOrigin,
        isManualOverride: day.isManualOverride,
        version: day.version,
        eventsCount: day._count.events,
      };
    });
    return NextResponse.json({
      schedule: {
        id: schedule.id,
        year: schedule.year,
        month: schedule.month,
        status: schedule.status,
        generatedAt: schedule.generatedAt?.toISOString() ?? null,
        generatedByEmail: schedule.generatedByEmail,
        notes: schedule.notes,
        updatedAt: schedule.updatedAt.toISOString(),
      },
      days,
      summary: {
        totalDays: days.length,
        drivers: driverIds.size,
        manualOverrides,
        byStatus,
      },
    });
  } catch (error) {
    console.error("[monthly-schedules GET]", error);
    return NextResponse.json(
      { message: "No se pudo cargar la planificación." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const year = Number(body.year);
    const month = Number(body.month);
    const action = asString(body.action) || "generate";
    if (!isValidPlanningMonth(year, month)) {
      return NextResponse.json({ message: "Mes inválido." }, { status: 400 });
    }

    const scope = parseScope(body);

    if (action === "preview") {
      const preview = await previewMonthlyScheduleGeneration({
        year,
        month,
        scope,
      });
      return NextResponse.json({ preview });
    }

    if (action === "deletePreview") {
      const preview = await previewMonthlyScheduleDeletion({
        year,
        month,
        scope,
      });
      return NextResponse.json({ preview });
    }

    if (action === "delete") {
      const confirmText = asString(body.confirmText).toUpperCase();
      if (confirmText !== "ELIMINAR") {
        return NextResponse.json(
          {
            message:
              'Para confirmar escribe ELIMINAR en el campo de validación.',
          },
          { status: 400 },
        );
      }
      const session = readAdminSession(request);
      const summary = await deleteMonthlyScheduleScope({
        year,
        month,
        scope,
        includeManualOverrides: body.includeManualOverrides !== false,
      });
      await writeAuditLog({
        module: "planificacion-mensual",
        action: "delete-generation",
        entityType: "MonthlySchedule",
        entityId: `${year}-${String(month).padStart(2, "0")}`,
        newValue: { ...summary, scope },
        userEmail: session?.email ?? "",
        origin: "manual",
      });
      return NextResponse.json({ summary });
    }

    if (action === "copyMonth") {
      const session = readAdminSession(request);
      const sourceYear = Number(body.sourceYear);
      const sourceMonth = Number(body.sourceMonth);
      if (!isValidPlanningMonth(sourceYear, sourceMonth)) {
        return NextResponse.json(
          { message: "Mes origen inválido." },
          { status: 400 },
        );
      }
      const summary = await copyMonthlyScheduleFromPrevious({
        sourceYear,
        sourceMonth,
        year,
        month,
        generatedByEmail: session?.email ?? "",
        scope,
        preserveManualOverrides: body.preserveManualOverrides !== false,
      });
      await writeAuditLog({
        module: "planificacion-mensual",
        action: "copy-month",
        entityType: "MonthlySchedule",
        entityId: summary.monthlyScheduleId,
        newValue: summary,
        userEmail: session?.email ?? "",
        origin: "manual",
      });
      return NextResponse.json({ summary });
    }

    if (action !== "generate") {
      return NextResponse.json({ message: "Acción inválida." }, { status: 400 });
    }

    const session = readAdminSession(request);
    const stream = body.stream === true;
    const dayOverrides = Array.isArray(body.dayOverrides)
      ? body.dayOverrides
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object",
          )
          .map((item) => ({
            date: asString(item.date),
            statusCode: asString(item.statusCode) || "TRABAJA",
            startTime: asString(item.startTime) || undefined,
            endTime: asString(item.endTime) || undefined,
            observation: asString(item.observation) || undefined,
          }))
          .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
      : undefined;

    const assignModeRaw = asString(body.assignMode);
    const assignMode: "assign" | "keep" | "exception" =
      assignModeRaw === "keep" || assignModeRaw === "exception"
        ? assignModeRaw
        : "assign";

    const generateOptions: Parameters<typeof generateMonthlySchedule>[0] = {
      year,
      month,
      generatedByEmail: session?.email ?? "",
      preserveManualOverrides: body.preserveManualOverrides !== false,
      overwriteCalculated: body.overwriteCalculated !== false,
      scope,
      forceShiftDefinitionId:
        asString(body.forceShiftDefinitionId) ||
        scope.shiftDefinitionId ||
        undefined,
      patternBaseDate: asString(body.patternBaseDate) || undefined,
      dayOverrides,
      assignMode,
    };

    if (!stream) {
      const summary = await generateMonthlySchedule(generateOptions);
      await writeAuditLog({
        module: "planificacion-mensual",
        action: "generate",
        entityType: "MonthlySchedule",
        entityId: summary.monthlyScheduleId,
        newValue: { ...summary, scope, assignMode, forceShiftDefinitionId: generateOptions.forceShiftDefinitionId },
        userEmail: session?.email ?? "",
        origin: "manual",
      });
      return NextResponse.json({ summary });
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };
        try {
          send({
            type: "progress",
            phase: "preparing",
            processed: 0,
            total: 0,
            percent: 0,
            message: "Iniciando generación…",
          });
          const summary = await generateMonthlySchedule({
            ...generateOptions,
            onProgress: async (progress) => {
              send({ type: "progress", ...progress });
            },
          });
          await writeAuditLog({
            module: "planificacion-mensual",
            action: "generate",
            entityType: "MonthlySchedule",
            entityId: summary.monthlyScheduleId,
            newValue: {
              ...summary,
              scope,
              assignMode,
              forceShiftDefinitionId: generateOptions.forceShiftDefinitionId,
            },
            userEmail: session?.email ?? "",
            origin: "manual",
          });
          send({ type: "done", summary });
        } catch (error) {
          console.error("[monthly-schedules POST stream]", error);
          send({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo generar la planificación.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[monthly-schedules POST]", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo generar la planificación.",
      },
      { status: 500 },
    );
  }
}
