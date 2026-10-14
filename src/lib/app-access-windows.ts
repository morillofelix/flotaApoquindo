import {
  buildRestrictedMessage,
  getSantiagoClock,
  isAccessAllowedAt,
  type AppAccessTodayWindow,
} from "@/lib/app-access-rules";
import { prisma } from "@/lib/prisma";

export {
  APP_ACCESS_WEEKDAYS,
  isValidAccessTime,
  type AppAccessWindowInput,
} from "@/lib/app-access-rules";

export type DriverAppAccessResult = {
  allowed: boolean;
  restricted: boolean;
  message: string;
  shiftCode: string;
  shiftName: string;
  todayWindow: AppAccessTodayWindow | null;
};

const UNRESTRICTED: DriverAppAccessResult = {
  allowed: true,
  restricted: false,
  message: "",
  shiftCode: "",
  shiftName: "",
  todayWindow: null,
};

/**
 * Turno vigente del móvil en la fecha: asignación explícita, luego
 * Grupo + Categoría, luego solo Grupo (mismo orden que la planificación mensual).
 */
async function resolveDriverShiftIdForDate(vehicleNumber: string, date: Date) {
  const driver = await prisma.driverOwner.findUnique({
    where: { vehicleNumber },
    select: {
      groupId: true,
      subgroupAssignments: {
        select: { subgroup: { select: { id: true, type: true } } },
      },
      shiftAssignments: {
        where: {
          isActive: true,
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
        },
        orderBy: { effectiveFrom: "desc" },
        select: { shiftDefinitionId: true },
      },
    },
  });
  if (!driver) return null;
  const assigned = driver.shiftAssignments.find((item) => item.shiftDefinitionId);
  if (assigned?.shiftDefinitionId) return assigned.shiftDefinitionId;
  if (!driver.groupId) return null;

  const categoryId =
    driver.subgroupAssignments.find((item) => item.subgroup.type === "CATEGORY")
      ?.subgroup.id ?? null;
  const groupShifts = await prisma.shiftDefinition.findMany({
    where: { isActive: true, groupId: driver.groupId },
    select: { id: true, categorySubgroupId: true },
  });
  if (categoryId) {
    const exact = groupShifts.find((shift) => shift.categorySubgroupId === categoryId);
    if (exact) return exact.id;
  }
  return groupShifts.find((shift) => !shift.categorySubgroupId)?.id ?? null;
}

/** Si algo falla, no se bloquea al conductor. */
export async function checkDriverAppAccess(
  vehicleNumber: string,
  now = new Date(),
): Promise<DriverAppAccessResult> {
  try {
    const configured = await prisma.shiftAppAccessWindow.count();
    if (!configured) return UNRESTRICTED;

    const clock = getSantiagoClock(now);
    const shiftId = await resolveDriverShiftIdForDate(
      vehicleNumber.trim(),
      new Date(`${clock.date}T12:00:00.000Z`),
    );
    if (!shiftId) return UNRESTRICTED;

    const shift = await prisma.shiftDefinition.findUnique({
      where: { id: shiftId },
      select: {
        code: true,
        name: true,
        appAccessWindows: {
          select: { weekday: true, enabled: true, startTime: true, endTime: true },
        },
      },
    });
    if (!shift || !shift.appAccessWindows.length) return UNRESTRICTED;

    const today = shift.appAccessWindows.find((item) => item.weekday === clock.weekday);
    const todayWindow = today
      ? { enabled: today.enabled, startTime: today.startTime, endTime: today.endTime }
      : { enabled: false, startTime: "", endTime: "" };
    const allowed = isAccessAllowedAt(shift.appAccessWindows, clock);
    return {
      allowed,
      restricted: true,
      message: allowed ? "" : buildRestrictedMessage(todayWindow),
      shiftCode: shift.code,
      shiftName: shift.name,
      todayWindow,
    };
  } catch (error) {
    console.error("checkDriverAppAccess", error);
    return UNRESTRICTED;
  }
}
