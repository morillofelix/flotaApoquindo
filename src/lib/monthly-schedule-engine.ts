import {
  appointmentDateRange,
  enumerateDateRange,
} from "@/lib/appointment-schedule-sync";
import {
  daysInMonth,
  isValidPlanningMonth,
  operationalStatusCodeForAppointmentReason,
} from "@/lib/fleet-schedule";
import { ensureDefaultOperationalStatuses } from "@/lib/operational-status";
import { prisma } from "@/lib/prisma";
import { resolveShiftDayStatus } from "@/lib/shift-pattern-engine";
import type { Prisma } from "@prisma/client";

export type GenerateScope = {
  /** all | group | vehicle | range | vehicles | shift */
  mode?: "all" | "group" | "vehicle" | "range" | "vehicles" | "shift";
  groupId?: string;
  vehicleNumber?: string;
  vehicleFrom?: string;
  vehicleTo?: string;
  /** Lista explícita de móviles (lote cliente). */
  vehicleNumbers?: string[];
  /** Turno operativo (ShiftDefinition.id). */
  shiftDefinitionId?: string;
};

export type DayOverrideInput = {
  date: string;
  statusCode: string;
  startTime?: string;
  endTime?: string;
  observation?: string;
};

export type GenerateProgress = {
  phase: "preparing" | "batch" | "done";
  processed: number;
  total: number;
  batchIndex: number;
  batchCount: number;
  percent: number;
  lastVehicles?: string[];
  message: string;
};

export type GenerateMonthlyScheduleOptions = {
  year: number;
  month: number;
  generatedByEmail: string;
  preserveManualOverrides?: boolean;
  overwriteCalculated?: boolean;
  scope?: GenerateScope;
  /** Forzar este turno para todos los móviles del alcance. */
  forceShiftDefinitionId?: string;
  /** Fecha base del ciclo rotativo (YYYY-MM-DD). */
  patternBaseDate?: string;
  /** Excepciones de la vista previa (solo esta generación). */
  dayOverrides?: DayOverrideInput[];
  /**
   * assign: crear asignación si no tienen turno.
   * keep: no cambiar asignación; generar solo si ya coincide o sin forzar.
   * exception: generar con el turno forzado sin cambiar asignación permanente.
   */
  assignMode?: "assign" | "keep" | "exception";
  /** Reglas Lun–Dom temporales para el turno forzado (solo esta generación). */
  forceShiftDayRules?: Array<{
    weekday: number;
    works: boolean;
    startTime: string;
    endTime: string;
    defaultStatusCode: string;
  }>;
  /** Tamaño de lote de conductores por transacción. */
  batchSize?: number;
  onProgress?: (progress: GenerateProgress) => void | Promise<void>;
};

const DRIVER_BATCH_SIZE = 40;

function atUtcNoon(year: number, month: number, day: number) {
  return new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00.000Z`,
  );
}

function normalizeVehicleKey(value: string) {
  return value.trim().replace(/^0+(?=\d)/, "") || "0";
}

function vehicleSortKey(value: string): number | string {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits) {
    return Number.parseInt(digits, 10);
  }
  return trimmed.toLowerCase();
}

function vehicleInRange(vehicleNumber: string, from: string, to: string) {
  const current = vehicleSortKey(vehicleNumber);
  const start = vehicleSortKey(from);
  const end = vehicleSortKey(to);
  if (typeof current === "number" && typeof start === "number" && typeof end === "number") {
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    return current >= min && current <= max;
  }
  const a = String(start);
  const b = String(end);
  const value = String(current);
  return value >= (a < b ? a : b) && value <= (a > b ? a : b);
}

/** Estado base del día según turno (weekday o ciclo rotativo). */
function baseFromShift(
  date: Date,
  shift:
    | {
        startTime?: string;
        endTime?: string;
        saturdayRule: string;
        sundayRule: string;
        holidayRule?: string;
        cycleLengthDays?: number;
        cycleStartDate?: Date | null;
        dayRules: Array<{
          weekday: number;
          works: boolean;
          startTime: string;
          endTime: string;
          defaultStatusCode: string;
        }>;
        pattern?: {
          cycleLengthDays: number;
          baseDate: Date | null;
          days: Array<{
            dayOffset: number;
            statusCode: string;
            startTime: string;
            endTime: string;
          }>;
        } | null;
      }
    | null
    | undefined,
  patternBaseDate?: string,
) {
  return resolveShiftDayStatus(date, shift ?? null, {
    patternBaseDate: patternBaseDate ?? null,
  });
}

type ShiftWithRules = {
  id: string;
  code: string;
  name: string;
  groupId: string | null;
  categorySubgroupId: string | null;
  startTime: string;
  endTime: string;
  saturdayRule: string;
  sundayRule: string;
  holidayRule: string;
  cycleLengthDays: number;
  cycleStartDate: Date | null;
  isActive: boolean;
  dayRules: Array<{
    weekday: number;
    works: boolean;
    startTime: string;
    endTime: string;
    defaultStatusCode: string;
  }>;
  pattern: {
    cycleLengthDays: number;
    baseDate: Date | null;
    days: Array<{
      dayOffset: number;
      statusCode: string;
      startTime: string;
      endTime: string;
    }>;
  } | null;
};

type DriverAssignmentWithShift = {
  id: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  shiftDefinition: ShiftWithRules | null;
};

/**
 * Resuelve el turno del móvil:
 * 1) asignación explícita vigente
 * 2) coincidencia por Grupo + Categoría del conductor (ej. Diurno + A → TA)
 * 3) coincidencia por solo Grupo (turno sin categoría)
 */
function resolveShiftForDriver(options: {
  date: Date;
  groupId: string | null;
  categorySubgroupId: string | null;
  assignments: DriverAssignmentWithShift[];
  shifts: ShiftWithRules[];
}) {
  const assignment = options.assignments.find(
    (item) =>
      item.effectiveFrom <= options.date &&
      (!item.effectiveTo || item.effectiveTo >= options.date) &&
      item.shiftDefinition,
  );
  if (assignment?.shiftDefinition) {
    return {
      assignmentId: assignment.id,
      shift: assignment.shiftDefinition,
      source: "assignment" as const,
    };
  }

  const activeShifts = options.shifts.filter((shift) => shift.isActive);
  if (options.groupId && options.categorySubgroupId) {
    const exact = activeShifts.find(
      (shift) =>
        shift.groupId === options.groupId &&
        shift.categorySubgroupId === options.categorySubgroupId,
    );
    if (exact) {
      return {
        assignmentId: null as string | null,
        shift: exact,
        source: "group_category" as const,
      };
    }
  }

  if (options.groupId) {
    const byGroup = activeShifts.find(
      (shift) =>
        shift.groupId === options.groupId && !shift.categorySubgroupId,
    );
    if (byGroup) {
      return {
        assignmentId: null as string | null,
        shift: byGroup,
        source: "group" as const,
      };
    }
  }

  return {
    assignmentId: null as string | null,
    shift: null,
    source: "default" as const,
  };
}

function categoryIdFromDriver(driver: {
  subgroupAssignments?: Array<{
    subgroup: { id: string; type: string };
  }>;
}) {
  return (
    driver.subgroupAssignments?.find(
      (item) => item.subgroup.type === "CATEGORY",
    )?.subgroup.id ?? null
  );
}

function buildDriverWhere(scope?: GenerateScope): Prisma.DriverOwnerWhereInput {
  const where: Prisma.DriverOwnerWhereInput = {
    isActive: true,
    isConductor: true,
  };
  const mode = scope?.mode ?? "all";

  if (mode === "group" && scope?.groupId?.trim()) {
    where.groupId = scope.groupId.trim();
  }

  if (mode === "vehicle" && scope?.vehicleNumber?.trim()) {
    where.vehicleNumber = scope.vehicleNumber.trim();
  }

  if (mode === "vehicles") {
    const numbers = (scope?.vehicleNumbers ?? [])
      .map((value) => value.trim())
      .filter(Boolean);
    where.vehicleNumber = { in: numbers.length ? numbers : ["__none__"] };
  }

  return where;
}

function validateScopeBasics(scope?: GenerateScope) {
  const mode = scope?.mode ?? "all";
  if (mode === "vehicle" && !scope?.vehicleNumber?.trim()) {
    throw new Error("Indica el número de móvil.");
  }
  if (mode === "group" && !scope?.groupId?.trim()) {
    throw new Error("Selecciona un grupo.");
  }
  if (mode === "range") {
    const from = scope?.vehicleFrom?.trim() ?? "";
    const to = scope?.vehicleTo?.trim() ?? "";
    if (!from || !to) {
      throw new Error("Indica el rango de móviles (desde / hasta).");
    }
  }
  if (mode === "vehicles") {
    const numbers = (scope?.vehicleNumbers ?? [])
      .map((value) => value.trim())
      .filter(Boolean);
    if (!numbers.length) {
      throw new Error("Indica al menos un móvil para el lote.");
    }
  }
  if (mode === "shift" && !scope?.shiftDefinitionId?.trim()) {
    throw new Error("Selecciona un turno.");
  }
  return mode;
}

type ScopedDriverBrief = {
  id: string;
  vehicleNumber: string;
  fullName: string;
  groupId: string | null;
  groupName: string;
};

/**
 * Lista de conductores del alcance (incluye filtro por turno vía
 * asignación o coincidencia grupo+categoría).
 */
export async function listDriversForScope(options: {
  year: number;
  month: number;
  scope?: GenerateScope;
}): Promise<{ mode: NonNullable<GenerateScope["mode"]>; drivers: ScopedDriverBrief[] }> {
  if (!isValidPlanningMonth(options.year, options.month)) {
    throw new Error("Mes de planificación inválido.");
  }

  const mode = validateScopeBasics(options.scope);
  const firstDate = atUtcNoon(options.year, options.month, 1);
  const lastDate = atUtcNoon(
    options.year,
    options.month,
    daysInMonth(options.year, options.month),
  );

  let drivers = await prisma.driverOwner.findMany({
    where: buildDriverWhere(options.scope),
    select: {
      id: true,
      vehicleNumber: true,
      fullName: true,
      groupId: true,
      group: { select: { id: true, name: true } },
      subgroupAssignments: {
        include: {
          subgroup: { select: { id: true, type: true } },
        },
      },
      shiftAssignments: {
        where: {
          isActive: true,
          effectiveFrom: { lte: lastDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: firstDate } }],
        },
        select: {
          shiftDefinitionId: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      },
    },
    orderBy: { vehicleNumber: "asc" },
  });

  if (mode === "range") {
    const from = options.scope?.vehicleFrom?.trim() ?? "";
    const to = options.scope?.vehicleTo?.trim() ?? "";
    drivers = drivers.filter((driver) =>
      vehicleInRange(driver.vehicleNumber, from, to),
    );
  }

  if (mode === "shift") {
    const shiftId = options.scope!.shiftDefinitionId!.trim();
    const shift = await prisma.shiftDefinition.findUnique({
      where: { id: shiftId },
      select: {
        id: true,
        isActive: true,
        groupId: true,
        categorySubgroupId: true,
      },
    });
    if (!shift || !shift.isActive) {
      throw new Error("El turno seleccionado no existe o está inactivo.");
    }

    drivers = drivers.filter((driver) => {
      const covering = driver.shiftAssignments.find(
        (item) =>
          item.effectiveFrom <= lastDate &&
          (!item.effectiveTo || item.effectiveTo >= firstDate),
      );
      if (covering) {
        return covering.shiftDefinitionId === shift.id;
      }
      const categoryId = categoryIdFromDriver(driver);
      if (shift.categorySubgroupId) {
        return (
          driver.groupId === shift.groupId &&
          categoryId === shift.categorySubgroupId
        );
      }
      if (shift.groupId) {
        return driver.groupId === shift.groupId;
      }
      return false;
    });
  }

  return {
    mode,
    drivers: drivers.map((driver) => ({
      id: driver.id,
      vehicleNumber: driver.vehicleNumber,
      fullName: driver.fullName,
      groupId: driver.groupId,
      groupName: driver.group?.name ?? "Sin grupo",
    })),
  };
}

export async function previewMonthlyScheduleGeneration(options: {
  year: number;
  month: number;
  scope?: GenerateScope;
}) {
  const { mode, drivers } = await listDriversForScope(options);
  const daysPerDriver = daysInMonth(options.year, options.month);

  return {
    year: options.year,
    month: options.month,
    mode,
    driversCount: drivers.length,
    daysPerDriver,
    estimatedCells: drivers.length * daysPerDriver,
    vehicleNumbers: drivers.map((driver) => driver.vehicleNumber),
    sample: drivers.slice(0, 8).map((driver) => ({
      vehicleNumber: driver.vehicleNumber,
      fullName: driver.fullName,
      groupName: driver.groupName,
    })),
  };
}

export async function previewMonthlyScheduleDeletion(options: {
  year: number;
  month: number;
  scope?: GenerateScope;
}) {
  const { mode, drivers } = await listDriversForScope(options);
  const firstDate = atUtcNoon(options.year, options.month, 1);
  const lastDate = atUtcNoon(
    options.year,
    options.month,
    daysInMonth(options.year, options.month),
  );

  if (!drivers.length) {
    return {
      year: options.year,
      month: options.month,
      mode,
      driversCount: 0,
      driversInScope: 0,
      daysCount: 0,
      manualOverrides: 0,
      vehicleNumbers: [] as string[],
      sample: [] as Array<{
        vehicleNumber: string;
        fullName: string;
        groupName: string;
      }>,
    };
  }

  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
  const driverIds = drivers.map((driver) => driver.id);

  const existingDays = await prisma.dailySchedule.findMany({
    where: {
      driverOwnerId: { in: driverIds },
      date: { gte: firstDate, lte: lastDate },
    },
    select: {
      driverOwnerId: true,
      isManualOverride: true,
    },
  });

  const driversWithDays = new Map<string, ScopedDriverBrief>();
  let manualOverrides = 0;
  for (const day of existingDays) {
    if (day.isManualOverride) manualOverrides += 1;
    const driver = driverById.get(day.driverOwnerId);
    if (driver && !driversWithDays.has(driver.id)) {
      driversWithDays.set(driver.id, driver);
    }
  }

  const generatedDrivers = [...driversWithDays.values()].sort((a, b) =>
    a.vehicleNumber.localeCompare(b.vehicleNumber, "es", { numeric: true }),
  );

  return {
    year: options.year,
    month: options.month,
    mode,
    /** Solo conductores que ya tienen días generados en el periodo. */
    driversCount: generatedDrivers.length,
    /** Conductores del alcance (aunque aún no tengan planificación). */
    driversInScope: drivers.length,
    daysCount: existingDays.length,
    manualOverrides,
    vehicleNumbers: generatedDrivers.map((driver) => driver.vehicleNumber),
    sample: generatedDrivers.slice(0, 8).map((driver) => ({
      vehicleNumber: driver.vehicleNumber,
      fullName: driver.fullName,
      groupName: driver.groupName,
    })),
  };
}

export async function deleteMonthlyScheduleScope(options: {
  year: number;
  month: number;
  scope?: GenerateScope;
  /** Si false, conserva filas con isManualOverride. Default true = borrar todo el alcance. */
  includeManualOverrides?: boolean;
}) {
  if (!isValidPlanningMonth(options.year, options.month)) {
    throw new Error("Mes de planificación inválido.");
  }

  const preview = await previewMonthlyScheduleDeletion(options);
  const includeManual = options.includeManualOverrides !== false;

  if (!preview.daysCount || !preview.vehicleNumbers.length) {
    return {
      year: options.year,
      month: options.month,
      mode: preview.mode,
      driversTargeted: 0,
      daysDeleted: 0,
      includeManualOverrides: includeManual,
      monthlyCleared: false,
    };
  }

  const firstDate = atUtcNoon(options.year, options.month, 1);
  const lastDate = atUtcNoon(
    options.year,
    options.month,
    daysInMonth(options.year, options.month),
  );

  // Solo borra días ya existentes del periodo; no toca conductores sin generación.
  const driversWithDays = await prisma.driverOwner.findMany({
    where: {
      vehicleNumber: { in: preview.vehicleNumbers },
      dailySchedules: {
        some: {
          date: { gte: firstDate, lte: lastDate },
        },
      },
    },
    select: { id: true },
  });
  const driverIds = driversWithDays.map((driver) => driver.id);

  if (!driverIds.length) {
    return {
      year: options.year,
      month: options.month,
      mode: preview.mode,
      driversTargeted: 0,
      daysDeleted: 0,
      includeManualOverrides: includeManual,
      monthlyCleared: false,
    };
  }

  const where: Prisma.DailyScheduleWhereInput = {
    driverOwnerId: { in: driverIds },
    date: { gte: firstDate, lte: lastDate },
    ...(includeManual ? {} : { isManualOverride: false }),
  };

  const deleted = await prisma.dailySchedule.deleteMany({ where });

  const monthly = await prisma.monthlySchedule.findUnique({
    where: { year_month: { year: options.year, month: options.month } },
    include: { _count: { select: { days: true } } },
  });

  let monthlyCleared = false;
  if (monthly && monthly._count.days === 0) {
    await prisma.monthlySchedule.delete({ where: { id: monthly.id } });
    monthlyCleared = true;
  }

  return {
    year: options.year,
    month: options.month,
    mode: preview.mode,
    driversTargeted: preview.driversCount,
    daysDeleted: deleted.count,
    includeManualOverrides: includeManual,
    monthlyCleared,
  };
}

export async function generateMonthlySchedule(
  options: GenerateMonthlyScheduleOptions,
) {
  if (!isValidPlanningMonth(options.year, options.month)) {
    throw new Error("Mes de planificación inválido.");
  }

  await ensureDefaultOperationalStatuses();
  const firstDate = atUtcNoon(options.year, options.month, 1);
  const lastDay = daysInMonth(options.year, options.month);
  const lastDate = atUtcNoon(options.year, options.month, lastDay);
  const monthDates = Array.from({ length: lastDay }, (_, index) =>
    atUtcNoon(options.year, options.month, index + 1),
  );
  const batchSize = Math.max(5, options.batchSize ?? DRIVER_BATCH_SIZE);
  const mode = options.scope?.mode ?? "all";

  const { drivers: scopedDrivers } = await listDriversForScope({
    year: options.year,
    month: options.month,
    scope: options.scope,
  });
  if (!scopedDrivers.length) {
    throw new Error("No hay conductores activos que coincidan con el alcance.");
  }
  const scopedIds = scopedDrivers.map((driver) => driver.id);

  const [monthly, statuses, holidays, catalogShifts] = await Promise.all([
    prisma.monthlySchedule.upsert({
      where: { year_month: { year: options.year, month: options.month } },
      create: {
        year: options.year,
        month: options.month,
        status: "draft",
        generatedAt: new Date(),
        generatedByEmail: options.generatedByEmail.trim().toLowerCase(),
      },
      update: {
        generatedAt: new Date(),
        generatedByEmail: options.generatedByEmail.trim().toLowerCase(),
      },
    }),
    prisma.operationalStatus.findMany(),
    prisma.holiday.findMany({
      where: {
        year: options.year,
        isActive: true,
        date: { gte: firstDate, lte: lastDate },
      },
    }),
    prisma.shiftDefinition.findMany({
      where: { isActive: true },
      include: {
        dayRules: true,
        pattern: { include: { days: true } },
      },
    }),
  ]);

  const statusByCode = new Map(statuses.map((status) => [status.code, status]));
  for (const code of ["TRABAJA", "LIBRE", "FERIADO", "BLOQUEADO"]) {
    if (!statusByCode.has(code)) {
      throw new Error(`Falta el estado operativo ${code}.`);
    }
  }

  const drivers = await prisma.driverOwner.findMany({
    where: { id: { in: scopedIds } },
    include: {
      group: true,
      subgroupAssignments: {
        include: {
          subgroup: { select: { id: true, type: true, code: true, name: true } },
        },
      },
      shiftAssignments: {
        where: {
          isActive: true,
          effectiveFrom: { lte: lastDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: firstDate } }],
        },
        include: {
          shiftDefinition: {
            include: {
              dayRules: true,
              pattern: { include: { days: true } },
            },
          },
        },
        orderBy: { effectiveFrom: "desc" },
      },
    },
    orderBy: [{ vehicleNumber: "asc" }],
  });

  const forceShiftId =
    options.forceShiftDefinitionId?.trim() ||
    options.scope?.shiftDefinitionId?.trim() ||
    "";
  const forcedShift = forceShiftId
    ? catalogShifts.find((shift) => shift.id === forceShiftId) ?? null
    : null;
  if (forceShiftId && !forcedShift) {
    throw new Error("El turno seleccionado no existe o está inactivo.");
  }

  const forcedShiftForDays =
    forcedShift && options.forceShiftDayRules?.length
      ? {
          ...forcedShift,
          dayRules: options.forceShiftDayRules.map((rule) => ({
            weekday: rule.weekday,
            works: rule.works,
            startTime: rule.startTime,
            endTime: rule.endTime,
            defaultStatusCode: rule.defaultStatusCode,
          })),
        }
      : forcedShift;

  const assignMode = options.assignMode ?? "assign";
  const overrideByDate = new Map(
    (options.dayOverrides ?? []).map((item) => [item.date, item]),
  );

  if (!drivers.length) {
    throw new Error("No hay conductores activos que coincidan con el alcance.");
  }

  const report = async (progress: GenerateProgress) => {
    await options.onProgress?.(progress);
  };

  await report({
    phase: "preparing",
    processed: 0,
    total: drivers.length,
    batchIndex: 0,
    batchCount: Math.ceil(drivers.length / batchSize),
    percent: 0,
    message: `Preparando ${drivers.length} conductores…`,
  });

  // Materializa asignaciones según modo / turno forzado.
  let assignmentsFromClassification = 0;
  for (const driver of drivers) {
    const covering = driver.shiftAssignments.find(
      (item) =>
        item.shiftDefinition &&
        item.effectiveFrom <= lastDate &&
        (!item.effectiveTo || item.effectiveTo >= firstDate),
    );

    if (forcedShift && assignMode === "assign") {
      if (covering?.shiftDefinitionId === forcedShift.id) continue;
      if (covering) {
        await prisma.driverShiftAssignment.update({
          where: { id: covering.id },
          data: {
            effectiveTo: new Date(firstDate.getTime() - 86_400_000),
            isActive: false,
          },
        });
      }
      const created = await prisma.driverShiftAssignment.create({
        data: {
          driverOwnerId: driver.id,
          shiftDefinitionId: forcedShift.id,
          effectiveFrom: firstDate,
          isActive: true,
          observation: `Asignado al generar planificación ${options.year}-${String(options.month).padStart(2, "0")}.`,
          createdByEmail: options.generatedByEmail.trim().toLowerCase(),
        },
        include: {
          shiftDefinition: {
            include: {
              dayRules: true,
              pattern: { include: { days: true } },
            },
          },
        },
      });
      driver.shiftAssignments = [created, ...driver.shiftAssignments];
      assignmentsFromClassification += 1;
      continue;
    }

    if (covering) continue;
    if (forcedShift && assignMode === "exception") continue;

    const resolved = resolveShiftForDriver({
      date: firstDate,
      groupId: driver.groupId,
      categorySubgroupId: categoryIdFromDriver(driver),
      assignments: [],
      shifts: catalogShifts,
    });
    if (!resolved.shift) continue;

    const created = await prisma.driverShiftAssignment.create({
      data: {
        driverOwnerId: driver.id,
        shiftDefinitionId: resolved.shift.id,
        effectiveFrom: firstDate,
        isActive: true,
        observation: `Asignación automática por ${
          resolved.source === "group_category"
            ? "grupo + categoría"
            : "grupo"
        } al generar planificación ${options.year}-${String(options.month).padStart(2, "0")}.`,
        createdByEmail: options.generatedByEmail.trim().toLowerCase(),
      },
      include: {
        shiftDefinition: {
          include: {
            dayRules: true,
            pattern: { include: { days: true } },
          },
        },
      },
    });
    driver.shiftAssignments = [created, ...driver.shiftAssignments];
    assignmentsFromClassification += 1;
  }

  const vehicleNumbers = drivers.map((driver) => driver.vehicleNumber);
  const driverIds = drivers.map((driver) => driver.id);
  const [appointments, blocks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: "aprobado",
        vehicleNumber: { in: vehicleNumbers },
        OR: [
          { appointmentDate: { gte: firstDate, lte: lastDate } },
          {
            vacationStartDate: { lte: lastDate },
            OR: [
              { vacationEndDate: null },
              { vacationEndDate: { gte: firstDate } },
            ],
          },
          {
            permitStartDate: { lte: lastDate },
            OR: [
              { permitEndDate: null },
              { permitEndDate: { gte: firstDate } },
            ],
          },
          { permitDate: { gte: firstDate, lte: lastDate } },
        ],
      },
    }),
    prisma.driverBlock.findMany({
      where: {
        driverOwnerId: { in: driverIds },
        isActive: true,
        status: { notIn: ["ended", "cancelled"] },
        startsAt: {
          lte: new Date(`${lastDate.toISOString().slice(0, 10)}T23:59:59.999Z`),
        },
        OR: [
          { endsAt: null },
          {
            endsAt: {
              gte: new Date(
                `${firstDate.toISOString().slice(0, 10)}T00:00:00.000Z`,
              ),
            },
          },
        ],
      },
    }),
  ]);

  const appointmentsByVehicleAndDate = new Map<string, typeof appointments>();
  for (const appointment of appointments) {
    const range = appointmentDateRange(appointment);
    for (const date of enumerateDateRange(range.start, range.end)) {
      if (date < firstDate || date > lastDate) continue;
      const key = `${appointment.vehicleNumber}:${date.toISOString().slice(0, 10)}`;
      appointmentsByVehicleAndDate.set(key, [
        ...(appointmentsByVehicleAndDate.get(key) ?? []),
        appointment,
      ]);
    }
  }

  const holidayDates = new Set(
    holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)),
  );

  const summary = {
    monthlyScheduleId: monthly.id,
    year: options.year,
    month: options.month,
    mode,
    driversTargeted: drivers.length,
    drivers: drivers.length,
    days: 0,
    created: 0,
    updated: 0,
    preservedManualOverrides: 0,
    preservedCalculated: 0,
    appointmentEvents: 0,
    blockedDays: 0,
    holidayDays: 0,
    batches: 0,
    assignmentsFromClassification,
  };

  const batchCount = Math.ceil(drivers.length / batchSize);

  for (let offset = 0; offset < drivers.length; offset += batchSize) {
    const batch = drivers.slice(offset, offset + batchSize);
    const batchIds = batch.map((driver) => driver.id);
    summary.batches += 1;
    const batchIndex = summary.batches;

    await prisma.$transaction(
      async (tx) => {
        const existingRows = await tx.dailySchedule.findMany({
          where: {
            driverOwnerId: { in: batchIds },
            date: { gte: firstDate, lte: lastDate },
          },
        });
        const existingByKey = new Map(
          existingRows.map((row) => [
            `${row.driverOwnerId}:${row.date.toISOString().slice(0, 10)}`,
            row,
          ]),
        );

        const creates: Prisma.DailyScheduleCreateManyInput[] = [];
        const eventCreates: Prisma.DailyScheduleEventCreateManyInput[] = [];
        const dayIdsForEventRefresh: string[] = [];

        for (const driver of batch) {
          const categorySubgroupId = categoryIdFromDriver(driver);
          for (const date of monthDates) {
            const dateKey = date.toISOString().slice(0, 10);
            const resolved = resolveShiftForDriver({
              date,
              groupId: driver.groupId,
              categorySubgroupId,
              assignments: driver.shiftAssignments,
              shifts: catalogShifts,
            });
            const shiftForDay =
              assignMode === "exception" && forcedShiftForDays
                ? forcedShiftForDays
                : forcedShiftForDays && assignMode === "assign"
                  ? forcedShiftForDays
                  : resolved.shift;
            const assignmentId =
              assignMode === "exception" && forcedShift
                ? resolved.assignmentId
                : resolved.assignmentId ??
                  driver.shiftAssignments.find(
                    (item) => item.shiftDefinitionId === forcedShift?.id,
                  )?.id ??
                  null;

            const dayResolved = baseFromShift(
              date,
              shiftForDay,
              options.patternBaseDate,
            );
            const override = overrideByDate.get(dateKey);
            const baseCode = override?.statusCode || dayResolved.statusCode;
            const dayStartTime = override?.startTime ?? dayResolved.startTime;
            const dayEndTime = override?.endTime ?? dayResolved.endTime;
            const baseStatus =
              statusByCode.get(baseCode) ?? statusByCode.get("TRABAJA")!;
            const candidates = [baseStatus];
            const isHoliday = holidayDates.has(dateKey);
            if (
              isHoliday &&
              shiftForDay?.holidayRule !== "work" &&
              !override
            ) {
              candidates.push(statusByCode.get("FERIADO")!);
              summary.holidayDays += 1;
            }

            const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
            const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
            const block = blocks.find(
              (item) =>
                item.driverOwnerId === driver.id &&
                item.startsAt <= dayEnd &&
                (!item.endsAt || item.endsAt >= dayStart),
            );
            if (block) {
              candidates.push(statusByCode.get("BLOQUEADO")!);
              summary.blockedDays += 1;
            }

            const dayAppointments =
              appointmentsByVehicleAndDate.get(
                `${driver.vehicleNumber}:${dateKey}`,
              ) ?? [];
            for (const appointment of dayAppointments) {
              const appointmentStatus = statusByCode.get(
                operationalStatusCodeForAppointmentReason(
                  appointment.appointmentReason,
                ),
              );
              if (appointmentStatus) candidates.push(appointmentStatus);
            }

            const effectiveStatus =
              [...candidates].sort(
                (left, right) => left.priority - right.priority,
              )[0] ?? baseStatus;

            const changeOrigin = override
              ? "manual"
              : dayAppointments.length
                ? "appointment"
                : block
                  ? "block"
                  : isHoliday
                    ? "holiday"
                    : "generated";

            const existing = existingByKey.get(`${driver.id}:${dateKey}`);
            const preserveManual =
              options.preserveManualOverrides !== false &&
              existing?.isManualOverride === true &&
              !override;
            const preserveCalculated =
              options.overwriteCalculated === false &&
              Boolean(existing) &&
              !preserveManual &&
              !override;

            if (!existing) {
              creates.push({
                monthlyScheduleId: monthly.id,
                date,
                driverOwnerId: driver.id,
                vehicleNumber: driver.vehicleNumber,
                shiftAssignmentId: assignmentId,
                baseStatusId: baseStatus.id,
                effectiveStatusId: effectiveStatus.id,
                appointmentId: dayAppointments[0]?.id ?? null,
                driverBlockId: block?.id ?? null,
                observation: override?.observation ?? "",
                changeOrigin,
                isManualOverride: Boolean(override),
                startTime: dayStartTime,
                endTime: dayEndTime,
                cyclePosition: dayResolved.cyclePosition,
              });
              summary.created += 1;
            } else {
              dayIdsForEventRefresh.push(existing.id);
              if (preserveManual) {
                summary.preservedManualOverrides += 1;
              } else if (preserveCalculated) {
                summary.preservedCalculated += 1;
              } else {
                await tx.dailySchedule.update({
                  where: { id: existing.id },
                  data: {
                    monthlyScheduleId: monthly.id,
                    vehicleNumber: driver.vehicleNumber,
                    shiftAssignmentId: assignmentId,
                    baseStatusId: baseStatus.id,
                    effectiveStatusId: effectiveStatus.id,
                    appointmentId: dayAppointments[0]?.id ?? null,
                    driverBlockId: block?.id ?? null,
                    observation: override?.observation ?? existing.observation,
                    changeOrigin: override ? "manual" : "regenerated",
                    isManualOverride: Boolean(override) || existing.isManualOverride,
                    startTime: dayStartTime,
                    endTime: dayEndTime,
                    cyclePosition: dayResolved.cyclePosition,
                    modifiedByEmail: options.generatedByEmail
                      .trim()
                      .toLowerCase(),
                    modifiedAt: new Date(),
                    version: { increment: 1 },
                  },
                });
                summary.updated += 1;
              }
            }

            summary.days += 1;
            summary.appointmentEvents += dayAppointments.length;

            // Events for newly created rows are attached after createMany below.
            if (existing && dayAppointments.length) {
              for (const appointment of dayAppointments) {
                eventCreates.push({
                  dailyScheduleId: existing.id,
                  appointmentId: appointment.id,
                  eventType: "appointment",
                  label: appointment.appointmentReason,
                  metadata: JSON.stringify({
                    ticketNumber: appointment.ticketNumber,
                  }),
                });
              }
            }
          }
        }

        if (creates.length) {
          await tx.dailySchedule.createMany({ data: creates });
          const createdRows = await tx.dailySchedule.findMany({
            where: {
              monthlyScheduleId: monthly.id,
              driverOwnerId: { in: batchIds },
              date: { gte: firstDate, lte: lastDate },
              id: { notIn: existingRows.map((row) => row.id) },
            },
            select: {
              id: true,
              driverOwnerId: true,
              date: true,
              vehicleNumber: true,
            },
          });

          for (const row of createdRows) {
            const dateKey = row.date.toISOString().slice(0, 10);
            const dayAppointments =
              appointmentsByVehicleAndDate.get(
                `${row.vehicleNumber}:${dateKey}`,
              ) ?? [];
            for (const appointment of dayAppointments) {
              eventCreates.push({
                dailyScheduleId: row.id,
                appointmentId: appointment.id,
                eventType: "appointment",
                label: appointment.appointmentReason,
                metadata: JSON.stringify({
                  ticketNumber: appointment.ticketNumber,
                }),
              });
            }
          }
        }

        if (dayIdsForEventRefresh.length) {
          await tx.dailyScheduleEvent.deleteMany({
            where: {
              dailyScheduleId: { in: dayIdsForEventRefresh },
              eventType: "appointment",
            },
          });
        }

        if (eventCreates.length) {
          await tx.dailyScheduleEvent.createMany({ data: eventCreates });
        }
      },
      { timeout: 120_000 },
    );

    const processed = Math.min(offset + batch.length, drivers.length);
    await report({
      phase: "batch",
      processed,
      total: drivers.length,
      batchIndex,
      batchCount,
      percent: Math.round((processed / drivers.length) * 100),
      lastVehicles: batch.map((driver) => driver.vehicleNumber),
      message: `Lote ${batchIndex}/${batchCount}: ${processed} de ${drivers.length} conductores`,
    });
  }

  await report({
    phase: "done",
    processed: drivers.length,
    total: drivers.length,
    batchIndex: batchCount,
    batchCount,
    percent: 100,
    message: `Completado: ${drivers.length} conductores`,
  });

  return summary;
}

/**
 * Copia estados/horarios del mes origen al mes destino por día del mes
 * (día 15 → día 15). Conserva overrides manuales del destino si se pide.
 * Luego conviene regenerar si se quieren reaplicar citas/bloqueos/feriados:
 * esta copia es literal de baseStatus/effectiveStatus/start/end.
 */
export async function copyMonthlyScheduleFromPrevious(options: {
  sourceYear: number;
  sourceMonth: number;
  year: number;
  month: number;
  generatedByEmail: string;
  scope?: GenerateScope;
  preserveManualOverrides?: boolean;
}) {
  if (
    !isValidPlanningMonth(options.sourceYear, options.sourceMonth) ||
    !isValidPlanningMonth(options.year, options.month)
  ) {
    throw new Error("Mes de planificación inválido.");
  }
  if (
    options.sourceYear === options.year &&
    options.sourceMonth === options.month
  ) {
    throw new Error("El mes origen y destino deben ser distintos.");
  }

  await ensureDefaultOperationalStatuses();

  const sourceFirst = atUtcNoon(options.sourceYear, options.sourceMonth, 1);
  const sourceLast = atUtcNoon(
    options.sourceYear,
    options.sourceMonth,
    daysInMonth(options.sourceYear, options.sourceMonth),
  );
  const targetFirst = atUtcNoon(options.year, options.month, 1);
  const targetLastDay = daysInMonth(options.year, options.month);
  const targetLast = atUtcNoon(options.year, options.month, targetLastDay);

  const { drivers } = await listDriversForScope({
    year: options.year,
    month: options.month,
    scope: options.scope ?? { mode: "all" },
  });
  if (!drivers.length) {
    throw new Error("No hay conductores en el alcance.");
  }

  const driverIds = drivers.map((driver) => driver.id);
  const sourceDays = await prisma.dailySchedule.findMany({
    where: {
      driverOwnerId: { in: driverIds },
      date: { gte: sourceFirst, lte: sourceLast },
    },
    select: {
      driverOwnerId: true,
      vehicleNumber: true,
      date: true,
      baseStatusId: true,
      effectiveStatusId: true,
      shiftAssignmentId: true,
      observation: true,
      isManualOverride: true,
      startTime: true,
      endTime: true,
      cyclePosition: true,
    },
  });

  if (!sourceDays.length) {
    throw new Error(
      "El mes origen no tiene planificación para el alcance seleccionado.",
    );
  }

  const sourceByDriverDay = new Map<string, (typeof sourceDays)[number]>();
  for (const day of sourceDays) {
    const dayNum = day.date.getUTCDate();
    sourceByDriverDay.set(`${day.driverOwnerId}:${dayNum}`, day);
  }

  const driversWithSource = new Set(sourceDays.map((d) => d.driverOwnerId));
  const targetDrivers = drivers.filter((d) => driversWithSource.has(d.id));

  const monthly = await prisma.monthlySchedule.upsert({
    where: {
      year_month: { year: options.year, month: options.month },
    },
    create: {
      year: options.year,
      month: options.month,
      status: "draft",
      generatedAt: new Date(),
      generatedByEmail: options.generatedByEmail.trim().toLowerCase(),
    },
    update: {
      generatedAt: new Date(),
      generatedByEmail: options.generatedByEmail.trim().toLowerCase(),
    },
  });

  const existingTarget = await prisma.dailySchedule.findMany({
    where: {
      driverOwnerId: { in: targetDrivers.map((d) => d.id) },
      date: { gte: targetFirst, lte: targetLast },
    },
  });
  const existingByKey = new Map(
    existingTarget.map((row) => [
      `${row.driverOwnerId}:${row.date.toISOString().slice(0, 10)}`,
      row,
    ]),
  );

  const summary = {
    monthlyScheduleId: monthly.id,
    year: options.year,
    month: options.month,
    sourceYear: options.sourceYear,
    sourceMonth: options.sourceMonth,
    driversTargeted: targetDrivers.length,
    days: 0,
    created: 0,
    updated: 0,
    preservedManualOverrides: 0,
  };

  const email = options.generatedByEmail.trim().toLowerCase();
  const creates: Prisma.DailyScheduleCreateManyInput[] = [];

  for (const driver of targetDrivers) {
    for (let dayNum = 1; dayNum <= targetLastDay; dayNum += 1) {
      const source = sourceByDriverDay.get(`${driver.id}:${dayNum}`);
      if (!source) continue;
      const date = atUtcNoon(options.year, options.month, dayNum);
      const dateKey = date.toISOString().slice(0, 10);
      const existing = existingByKey.get(`${driver.id}:${dateKey}`);
      summary.days += 1;

      if (
        existing &&
        options.preserveManualOverrides !== false &&
        existing.isManualOverride
      ) {
        summary.preservedManualOverrides += 1;
        continue;
      }

      if (!existing) {
        creates.push({
          monthlyScheduleId: monthly.id,
          date,
          driverOwnerId: driver.id,
          vehicleNumber: driver.vehicleNumber,
          shiftAssignmentId: source.shiftAssignmentId,
          baseStatusId: source.baseStatusId,
          effectiveStatusId: source.effectiveStatusId,
          observation: source.observation,
          changeOrigin: "copied",
          isManualOverride: source.isManualOverride,
          startTime: source.startTime,
          endTime: source.endTime,
          cyclePosition: source.cyclePosition,
        });
        summary.created += 1;
      } else {
        await prisma.dailySchedule.update({
          where: { id: existing.id },
          data: {
            monthlyScheduleId: monthly.id,
            vehicleNumber: driver.vehicleNumber,
            shiftAssignmentId: source.shiftAssignmentId,
            baseStatusId: source.baseStatusId,
            effectiveStatusId: source.effectiveStatusId,
            observation: source.observation,
            changeOrigin: "copied",
            isManualOverride: source.isManualOverride,
            startTime: source.startTime,
            endTime: source.endTime,
            cyclePosition: source.cyclePosition,
            modifiedByEmail: email,
            modifiedAt: new Date(),
            version: { increment: 1 },
          },
        });
        summary.updated += 1;
      }
    }
  }

  if (creates.length) {
    await prisma.dailySchedule.createMany({ data: creates });
  }

  return summary;
}

export { normalizeVehicleKey };
