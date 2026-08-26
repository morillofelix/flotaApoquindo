import { normalizeCode } from "@/lib/shift-definitions";
import { prisma } from "@/lib/prisma";

export type ShiftPatternDayConfig = {
  id?: string;
  dayOffset: number;
  statusCode: string;
  startTime: string;
  endTime: string;
};

export type ShiftPatternConfig = {
  id: string;
  code: string;
  name: string;
  description: string;
  cycleLengthDays: number;
  baseDate: string | null;
  holidayApplication: string;
  weekendApplication: string;
  isActive: boolean;
  days: ShiftPatternDayConfig[];
  createdAt: string;
  updatedAt: string;
};

export type ShiftPatternInput = Omit<
  ShiftPatternConfig,
  "id" | "createdAt" | "updatedAt"
>;

type ShiftPatternRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  cycleLengthDays: number;
  baseDate: Date | null;
  holidayApplication: string;
  weekendApplication: string;
  isActive: boolean;
  days: Array<{
    id: string;
    dayOffset: number;
    statusCode: string;
    startTime: string;
    endTime: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

const includePattern = { days: true } as const;

function parseDateOnly(value: string | null) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

export function toShiftPatternConfig(value: ShiftPatternRecord): ShiftPatternConfig {
  return {
    ...value,
    baseDate: value.baseDate?.toISOString().slice(0, 10) ?? null,
    days: value.days
      .map((day) => ({ ...day }))
      .sort((left, right) => left.dayOffset - right.dayOffset),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function normalizeDays(days: ShiftPatternDayConfig[], cycleLengthDays: number) {
  const unique = new Map<number, ShiftPatternDayConfig>();
  for (const day of days) {
    if (
      !Number.isInteger(day.dayOffset) ||
      day.dayOffset < 0 ||
      day.dayOffset >= cycleLengthDays
    ) {
      throw new Error(`dayOffset debe estar entre 0 y ${cycleLengthDays - 1}.`);
    }
    unique.set(day.dayOffset, {
      dayOffset: day.dayOffset,
      statusCode: normalizeCode(day.statusCode) || "TRABAJA",
      startTime: day.startTime.trim(),
      endTime: day.endTime.trim(),
    });
  }
  return [...unique.values()];
}

export async function listShiftPatterns(options?: { includeInactive?: boolean }) {
  const rows = await prisma.shiftPattern.findMany({
    where: options?.includeInactive === false ? { isActive: true } : undefined,
    include: includePattern,
    orderBy: [{ name: "asc" }],
  });
  return rows.map(toShiftPatternConfig);
}

export async function createShiftPattern(input: ShiftPatternInput) {
  const code = normalizeCode(input.code || input.name);
  const cycleLengthDays = Math.max(1, Math.trunc(input.cycleLengthDays || 7));
  if (!code || !input.name.trim()) throw new Error("El patrón requiere código y nombre.");
  const row = await prisma.shiftPattern.create({
    data: {
      code,
      name: input.name.trim(),
      description: input.description.trim(),
      cycleLengthDays,
      baseDate: parseDateOnly(input.baseDate),
      holidayApplication: input.holidayApplication.trim() || "default",
      weekendApplication: input.weekendApplication.trim() || "default",
      isActive: input.isActive,
      days: { create: normalizeDays(input.days, cycleLengthDays) },
    },
    include: includePattern,
  });
  return toShiftPatternConfig(row);
}

export async function updateShiftPattern(
  id: string,
  input: Partial<ShiftPatternInput>,
) {
  const existing = await prisma.shiftPattern.findUnique({
    where: { id },
    include: includePattern,
  });
  if (!existing) throw new Error("Patrón no encontrado.");
  const cycleLengthDays =
    input.cycleLengthDays === undefined
      ? existing.cycleLengthDays
      : Math.max(1, Math.trunc(input.cycleLengthDays));
  const days = input.days ? normalizeDays(input.days, cycleLengthDays) : null;
  const row = await prisma.$transaction(async (tx) => {
    if (days) await tx.shiftPatternDay.deleteMany({ where: { patternId: id } });
    return tx.shiftPattern.update({
      where: { id },
      data: {
        code:
          input.code === undefined ? undefined : normalizeCode(input.code || existing.name),
        name: input.name?.trim(),
        description: input.description?.trim(),
        cycleLengthDays,
        baseDate:
          input.baseDate === undefined ? undefined : parseDateOnly(input.baseDate),
        holidayApplication: input.holidayApplication?.trim(),
        weekendApplication: input.weekendApplication?.trim(),
        isActive: input.isActive,
        days: days ? { create: days } : undefined,
      },
      include: includePattern,
    });
  });
  return toShiftPatternConfig(row);
}
