import { requireAdminPermission } from "@/lib/admin-api-server";
import { readAdminSession } from "@/lib/driver-auth";
import { isValidPlanningMonth } from "@/lib/fleet-schedule";
import {
  generateMonthlySchedule,
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
    modeRaw === "all"
      ? modeRaw
      : "all";

  return {
    mode,
    groupId: asString(body.groupId) || undefined,
    vehicleNumber: asString(body.vehicleNumber) || undefined,
    vehicleFrom: asString(body.vehicleFrom) || undefined,
    vehicleTo: asString(body.vehicleTo) || undefined,
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
  if (preview) {
    try {
      const scope: GenerateScope = {
        mode: (asString(request.nextUrl.searchParams.get("mode")) ||
          "all") as GenerateScope["mode"],
        groupId: asString(request.nextUrl.searchParams.get("groupId")) || undefined,
        vehicleNumber:
          asString(request.nextUrl.searchParams.get("vehicleNumber")) ||
          undefined,
        vehicleFrom:
          asString(request.nextUrl.searchParams.get("vehicleFrom")) || undefined,
        vehicleTo:
          asString(request.nextUrl.searchParams.get("vehicleTo")) || undefined,
      };
      const result = await previewMonthlyScheduleGeneration({ year, month, scope });
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

    if (action !== "generate") {
      return NextResponse.json({ message: "Acción inválida." }, { status: 400 });
    }

    const session = readAdminSession(request);
    const summary = await generateMonthlySchedule({
      year,
      month,
      generatedByEmail: session?.email ?? "",
      preserveManualOverrides: body.preserveManualOverrides !== false,
      overwriteCalculated: body.overwriteCalculated !== false,
      scope,
    });
    return NextResponse.json({ summary });
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
