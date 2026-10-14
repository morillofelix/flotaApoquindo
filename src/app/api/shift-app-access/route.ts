import {
  requireAdminPermission,
  sanitizeServerErrorMessage,
} from "@/lib/admin-api-server";
import {
  APP_ACCESS_WEEKDAYS,
  isValidAccessTime,
  type AppAccessWindowInput,
} from "@/lib/app-access-windows";
import { writeAuditLog } from "@/lib/audit-log";
import { readAdminSession } from "@/lib/driver-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function listShiftsWithWindows() {
  const shifts = await prisma.shiftDefinition.findMany({
    where: { isActive: true },
    orderBy: [{ code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      startTime: true,
      endTime: true,
      appAccessWindows: {
        orderBy: { weekday: "asc" },
        select: {
          weekday: true,
          enabled: true,
          startTime: true,
          endTime: true,
          updatedByEmail: true,
          updatedAt: true,
        },
      },
    },
  });
  return shifts.map((shift) => ({
    id: shift.id,
    code: shift.code,
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    restricted: shift.appAccessWindows.length > 0,
    windows: shift.appAccessWindows.map((window) => ({
      weekday: window.weekday,
      enabled: window.enabled,
      startTime: window.startTime,
      endTime: window.endTime,
    })),
    updatedByEmail: shift.appAccessWindows[0]?.updatedByEmail ?? "",
    updatedAt:
      shift.appAccessWindows
        .map((window) => window.updatedAt.toISOString())
        .sort()
        .at(-1) ?? null,
  }));
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json({ shifts: await listShiftsWithWindows() });
  } catch (error) {
    return NextResponse.json(
      {
        message: sanitizeServerErrorMessage(
          error,
          "No se pudieron cargar las restricciones.",
        ),
      },
      { status: 500 },
    );
  }
}

type SaveBody = {
  shiftDefinitionId?: unknown;
  clear?: unknown;
  windows?: unknown;
};

function parseWindows(value: unknown): AppAccessWindowInput[] | string {
  if (!Array.isArray(value)) return "Debes indicar los días.";
  const byWeekday = new Map<number, AppAccessWindowInput>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const weekday = Number(item.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) continue;
    const enabled = item.enabled === true;
    const startTime = typeof item.startTime === "string" ? item.startTime.trim() : "";
    const endTime = typeof item.endTime === "string" ? item.endTime.trim() : "";
    const label =
      APP_ACCESS_WEEKDAYS.find((day) => day.weekday === weekday)?.label ?? "";
    if (enabled) {
      if (!isValidAccessTime(startTime) || !isValidAccessTime(endTime)) {
        return `${label}: indica hora de inicio y término válidas.`;
      }
      if (startTime === endTime) {
        return `${label}: la hora de inicio y término no pueden ser iguales.`;
      }
    }
    byWeekday.set(weekday, {
      weekday,
      enabled,
      startTime: enabled ? startTime : "",
      endTime: enabled ? endTime : "",
    });
  }
  return APP_ACCESS_WEEKDAYS.map(
    (day) =>
      byWeekday.get(day.weekday) ?? {
        weekday: day.weekday,
        enabled: false,
        startTime: "",
        endTime: "",
      },
  );
}

export async function PUT(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  const session = readAdminSession(request);
  const email = session?.email?.trim().toLowerCase() ?? "";

  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const shiftDefinitionId =
    typeof body.shiftDefinitionId === "string" ? body.shiftDefinitionId.trim() : "";
  if (!shiftDefinitionId) {
    return NextResponse.json({ message: "Selecciona un turno." }, { status: 400 });
  }

  try {
    const shift = await prisma.shiftDefinition.findUnique({
      where: { id: shiftDefinitionId },
      select: {
        id: true,
        code: true,
        appAccessWindows: {
          select: { weekday: true, enabled: true, startTime: true, endTime: true },
        },
      },
    });
    if (!shift) {
      return NextResponse.json({ message: "El turno no existe." }, { status: 404 });
    }
    const previous = shift.appAccessWindows;

    if (body.clear === true) {
      await prisma.shiftAppAccessWindow.deleteMany({
        where: { shiftDefinitionId },
      });
      await writeAuditLog({
        module: "restricciones-app",
        action: "quitar-restriccion",
        entityType: "ShiftAppAccessWindow",
        entityId: shift.code,
        previousValue: previous,
        newValue: [],
        userEmail: email,
      });
      return NextResponse.json({ shifts: await listShiftsWithWindows() });
    }

    const windows = parseWindows(body.windows);
    if (typeof windows === "string") {
      return NextResponse.json({ message: windows }, { status: 400 });
    }

    await prisma.$transaction(
      windows.map((window) =>
        prisma.shiftAppAccessWindow.upsert({
          where: {
            shiftDefinitionId_weekday: {
              shiftDefinitionId,
              weekday: window.weekday,
            },
          },
          create: { shiftDefinitionId, ...window, updatedByEmail: email },
          update: { ...window, updatedByEmail: email },
        }),
      ),
    );
    await writeAuditLog({
      module: "restricciones-app",
      action: "guardar-restriccion",
      entityType: "ShiftAppAccessWindow",
      entityId: shift.code,
      previousValue: previous,
      newValue: windows,
      userEmail: email,
    });
    return NextResponse.json({ shifts: await listShiftsWithWindows() });
  } catch (error) {
    return NextResponse.json(
      {
        message: sanitizeServerErrorMessage(
          error,
          "No se pudo guardar la restricción.",
        ),
      },
      { status: 500 },
    );
  }
}
