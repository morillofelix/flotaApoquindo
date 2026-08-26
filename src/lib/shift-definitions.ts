import { prisma } from "@/lib/prisma";

export type ShiftDayRuleConfig = {
  id?: string;
  weekday: number;
  works: boolean;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  defaultStatusCode: string;
};

export type ShiftDefinitionConfig = {
  id: string;
  code: string;
  name: string;
  description: string;
  groupId: string | null;
  categorySubgroupId: string | null;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  isActive: boolean;
  color: string;
  validFrom: string | null;
  validTo: string | null;
  saturdayRule: string;
  sundayRule: string;
  holidayRule: string;
  cycleLengthDays: number;
  cycleStartDate: string | null;
  observation: string;
  patternId: string | null;
  dayRules: ShiftDayRuleConfig[];
  createdAt: string;
  updatedAt: string;
};

export type ShiftDefinitionInput = Omit<
  ShiftDefinitionConfig,
  "id" | "createdAt" | "updatedAt"
>;

type ShiftDefinitionRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  groupId: string | null;
  categorySubgroupId: string | null;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  isActive: boolean;
  color: string;
  validFrom: Date | null;
  validTo: Date | null;
  saturdayRule: string;
  sundayRule: string;
  holidayRule: string;
  cycleLengthDays: number;
  cycleStartDate: Date | null;
  observation: string;
  patternId: string | null;
  dayRules: Array<{
    id: string;
    weekday: number;
    works: boolean;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    defaultStatusCode: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

function dateOnly(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function parseDateOnly(value: string | null) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

export function normalizeCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function toShiftDefinitionConfig(
  value: ShiftDefinitionRecord,
): ShiftDefinitionConfig {
  return {
    ...value,
    validFrom: dateOnly(value.validFrom),
    validTo: dateOnly(value.validTo),
    cycleStartDate: dateOnly(value.cycleStartDate),
    dayRules: value.dayRules
      .map((rule) => ({ ...rule }))
      .sort((left, right) => left.weekday - right.weekday),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function normalizeDayRules(dayRules: ShiftDayRuleConfig[]) {
  const unique = new Map<number, ShiftDayRuleConfig>();
  for (const rule of dayRules) {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7) {
      throw new Error("El día de semana debe estar entre 1 (lunes) y 7 (domingo).");
    }
    unique.set(rule.weekday, {
      weekday: rule.weekday,
      works: rule.works,
      startTime: rule.startTime.trim(),
      endTime: rule.endTime.trim(),
      durationMinutes: Math.max(0, Math.trunc(rule.durationMinutes || 0)),
      defaultStatusCode:
        normalizeCode(rule.defaultStatusCode) || (rule.works ? "TRABAJA" : "LIBRE"),
    });
  }
  return [...unique.values()];
}

const includeDefinition = { dayRules: true } as const;

export async function listShiftDefinitions(options?: { includeInactive?: boolean }) {
  const rows = await prisma.shiftDefinition.findMany({
    where: options?.includeInactive === false ? { isActive: true } : undefined,
    include: includeDefinition,
    orderBy: [{ name: "asc" }],
  });
  return rows.map(toShiftDefinitionConfig);
}

export async function createShiftDefinition(input: ShiftDefinitionInput) {
  const code = normalizeCode(input.code || input.name);
  if (!code || !input.name.trim()) {
    throw new Error("El turno requiere código y nombre.");
  }
  const dayRules = normalizeDayRules(input.dayRules);
  const row = await prisma.shiftDefinition.create({
    data: {
      code,
      name: input.name.trim(),
      description: input.description.trim(),
      groupId: input.groupId || null,
      categorySubgroupId: input.categorySubgroupId || null,
      startTime: input.startTime.trim(),
      endTime: input.endTime.trim(),
      crossesMidnight: input.crossesMidnight,
      isActive: input.isActive,
      color: input.color.trim() || "#0b5cab",
      validFrom: parseDateOnly(input.validFrom),
      validTo: parseDateOnly(input.validTo),
      saturdayRule: input.saturdayRule.trim() || "default",
      sundayRule: input.sundayRule.trim() || "default",
      holidayRule: input.holidayRule.trim() || "default",
      cycleLengthDays: Math.max(0, Math.trunc(input.cycleLengthDays || 0)),
      cycleStartDate: parseDateOnly(input.cycleStartDate),
      observation: input.observation.trim(),
      patternId: input.patternId || null,
      dayRules: { create: dayRules },
    },
    include: includeDefinition,
  });
  return toShiftDefinitionConfig(row);
}

export async function updateShiftDefinition(
  id: string,
  input: Partial<ShiftDefinitionInput>,
) {
  const existing = await prisma.shiftDefinition.findUnique({
    where: { id },
    include: includeDefinition,
  });
  if (!existing) throw new Error("Turno no encontrado.");

  const dayRules = input.dayRules ? normalizeDayRules(input.dayRules) : null;
  const row = await prisma.$transaction(async (tx) => {
    if (dayRules) {
      await tx.shiftDayRule.deleteMany({ where: { shiftDefinitionId: id } });
    }
    return tx.shiftDefinition.update({
      where: { id },
      data: {
        code:
          input.code === undefined ? undefined : normalizeCode(input.code || existing.name),
        name: input.name?.trim(),
        description: input.description?.trim(),
        groupId: input.groupId === undefined ? undefined : input.groupId || null,
        categorySubgroupId:
          input.categorySubgroupId === undefined
            ? undefined
            : input.categorySubgroupId || null,
        startTime: input.startTime?.trim(),
        endTime: input.endTime?.trim(),
        crossesMidnight: input.crossesMidnight,
        isActive: input.isActive,
        color: input.color?.trim(),
        validFrom:
          input.validFrom === undefined ? undefined : parseDateOnly(input.validFrom),
        validTo: input.validTo === undefined ? undefined : parseDateOnly(input.validTo),
        saturdayRule: input.saturdayRule?.trim(),
        sundayRule: input.sundayRule?.trim(),
        holidayRule: input.holidayRule?.trim(),
        cycleLengthDays:
          input.cycleLengthDays === undefined
            ? undefined
            : Math.max(0, Math.trunc(input.cycleLengthDays)),
        cycleStartDate:
          input.cycleStartDate === undefined
            ? undefined
            : parseDateOnly(input.cycleStartDate),
        observation: input.observation?.trim(),
        patternId:
          input.patternId === undefined ? undefined : input.patternId || null,
        dayRules: dayRules ? { create: dayRules } : undefined,
      },
      include: includeDefinition,
    });
  });
  return toShiftDefinitionConfig(row);
}
