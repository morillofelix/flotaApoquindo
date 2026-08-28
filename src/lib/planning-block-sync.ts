import { createDriverBlock, endDriverBlock } from "@/lib/driver-blocks";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type DbClient = Prisma.TransactionClient;

export type PlanningBlockMode = "days" | "hours";

export type PlanningBlockInput = {
  mode: PlanningBlockMode;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  observation?: string;
  createdByEmail?: string;
};

const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseDateOnly(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Fecha inválida.");
  }
  return trimmed;
}

function parseClock(value: string, label: string) {
  const trimmed = value.trim();
  if (!CLOCK_RE.test(trimmed)) {
    throw new Error(`${label} inválida. Use formato HH:MM.`);
  }
  return trimmed;
}

function startOfDayUtc(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function endOfDayUtc(date: string) {
  return new Date(`${date}T23:59:59.999Z`);
}

function dateTimeUtc(date: string, time: string) {
  return new Date(`${date}T${time}:00.000Z`);
}

export function resolvePlanningBlockWindow(input: PlanningBlockInput) {
  const observation = input.observation?.trim() ?? "";

  if (input.mode === "days") {
    const startDate = parseDateOnly(input.startDate);
    const endDate = parseDateOnly(input.endDate || input.startDate);
    if (endDate < startDate) {
      throw new Error("La fecha de término no puede ser anterior al inicio.");
    }
    return {
      startsAt: startOfDayUtc(startDate),
      endsAt: endOfDayUtc(endDate),
      startDate,
      endDate,
      observation,
      isHourBlock: false,
      startTime: "",
      endTime: "",
    };
  }

  const blockDate = parseDateOnly(input.startDate);
  const startTime = parseClock(input.startTime ?? "", "Hora de inicio");
  const endTime = parseClock(input.endTime ?? "", "Hora de término");
  const startsAt = dateTimeUtc(blockDate, startTime);
  const endsAt = dateTimeUtc(blockDate, endTime);
  if (endsAt <= startsAt) {
    throw new Error("La hora de término debe ser posterior al inicio.");
  }

  return {
    startsAt,
    endsAt,
    startDate: blockDate,
    endDate: blockDate,
    observation,
    isHourBlock: true,
    startTime,
    endTime,
  };
}

function enumerateDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00.000Z`);
  const last = new Date(`${endDate}T12:00:00.000Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function blockOverlapsDay(
  startsAt: Date,
  endsAt: Date,
  dateKey: string,
) {
  const dayStart = startOfDayUtc(dateKey);
  const dayEnd = endOfDayUtc(dateKey);
  return startsAt <= dayEnd && endsAt >= dayStart;
}

export async function expireExpiredPlanningBlocks(now = new Date()) {
  const expired = await prisma.driverBlock.findMany({
    where: {
      isActive: true,
      status: { notIn: ["ended", "cancelled"] },
      endsAt: { lt: now },
      requiresManualUnlock: false,
    },
    select: { id: true },
  });

  if (expired.length === 0) {
    return 0;
  }

  for (const block of expired) {
    await prisma.$transaction(async (tx) => {
      await endDriverBlockInTx(tx, block.id, {
        endedAt: now,
        unlockType: "auto",
        unlockReason: "Bloqueo vencido automáticamente.",
      });
    });
  }

  return expired.length;
}

async function endDriverBlockInTx(
  tx: DbClient,
  blockId: string,
  input: {
    endedAt: Date;
    unlockType: string;
    unlockReason: string;
    unlockedByEmail?: string;
    cancel?: boolean;
  },
) {
  const block = await tx.driverBlock.update({
    where: { id: blockId },
    data: {
      endsAt: input.endedAt,
      unlockedAt: input.endedAt,
      unlockedByEmail: input.unlockedByEmail?.trim().toLowerCase() || "",
      unlockType: input.unlockType,
      unlockReason: input.unlockReason,
      status: input.cancel ? "cancelled" : "ended",
      isActive: false,
    },
  });

  const affectedDays = await tx.dailySchedule.findMany({
    where: { driverBlockId: blockId },
    include: { baseStatus: true },
  });

  for (const day of affectedDays) {
    if (day.isManualOverride) {
      await tx.dailySchedule.update({
        where: { id: day.id },
        data: { driverBlockId: null },
      });
      continue;
    }

    await tx.dailySchedule.update({
      where: { id: day.id },
      data: {
        effectiveStatusId: day.baseStatusId,
        driverBlockId: null,
        changeOrigin: "block_expired",
        modifiedAt: input.endedAt,
      },
    });
  }

  return block;
}

export async function applyPlanningBlockToDriver(
  driverOwnerId: string,
  input: PlanningBlockInput,
  options?: { createdByEmail?: string },
) {
  const window = resolvePlanningBlockWindow(input);
  const blockedStatus = await prisma.operationalStatus.findUnique({
    where: { code: "BLOQUEADO" },
  });
  if (!blockedStatus?.isActive) {
    throw new Error("El estado BLOQUEADO no está disponible.");
  }

  const block = await createDriverBlock({
    driverOwnerId,
    blockReasonCode: "OTRO",
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    observation: window.observation,
    requiresManualUnlock: false,
    createdByEmail: options?.createdByEmail,
    status: "active",
  });

  const dateKeys = enumerateDates(window.startDate, window.endDate);

  await prisma.$transaction(async (tx) => {
    for (const dateKey of dateKeys) {
      if (!blockOverlapsDay(window.startsAt, window.endsAt, dateKey)) {
        continue;
      }

      await tx.dailySchedule.updateMany({
        where: { driverOwnerId, date: startOfDayUtc(dateKey) },
        data: {
          effectiveStatusId: blockedStatus.id,
          driverBlockId: block.id,
          observation: window.observation,
          changeOrigin: "block",
          isManualOverride: true,
          modifiedByEmail: options?.createdByEmail?.trim().toLowerCase() || "",
          modifiedAt: new Date(),
        },
      });
    }
  });

  return { block, window };
}

export async function applyManualPlanningDayStatus(input: {
  dayId: string;
  statusCode: string;
  observation?: string;
  expectedVersion: number;
  modifiedByEmail?: string;
}) {
  const statusCode = input.statusCode.trim().toUpperCase();
  const status = await prisma.operationalStatus.findUnique({
    where: { code: statusCode },
  });
  if (!status?.isActive) {
    throw new Error(`Estado ${statusCode} inválido.`);
  }

  const previous = await prisma.dailySchedule.findUnique({
    where: { id: input.dayId },
    include: { effectiveStatus: true },
  });
  if (!previous) {
    throw new Error("Día de planificación no encontrado.");
  }

  const result = await prisma.dailySchedule.updateMany({
    where: { id: input.dayId, version: input.expectedVersion },
    data: {
      effectiveStatusId: status.id,
      observation:
        input.observation === undefined
          ? previous.observation
          : input.observation.trim(),
      isManualOverride: true,
      changeOrigin: "manual",
      driverBlockId:
        statusCode === "BLOQUEADO" ? previous.driverBlockId : null,
      modifiedByEmail: input.modifiedByEmail?.trim().toLowerCase() || "",
      modifiedAt: new Date(),
      version: { increment: 1 },
    },
  });

  if (result.count !== 1) {
    throw new Error("VERSION_CONFLICT");
  }

  return prisma.dailySchedule.findUnique({
    where: { id: input.dayId },
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
}

export function serializePlanningDriverBlock(block: {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  observation: string;
  isActive: boolean;
  status: string;
} | null) {
  if (!block) {
    return null;
  }

  const startDate = block.startsAt.toISOString().slice(0, 10);
  const endDate = block.endsAt?.toISOString().slice(0, 10) ?? startDate;
  const startTime = block.startsAt.toISOString().slice(11, 16);
  const endTime = block.endsAt?.toISOString().slice(11, 16) ?? "";
  const isHourBlock =
    Boolean(block.endsAt) &&
    startDate === endDate &&
    !(startTime === "00:00" && endTime === "23:59");

  return {
    id: block.id,
    startsAt: block.startsAt.toISOString(),
    endsAt: block.endsAt?.toISOString() ?? null,
    observation: block.observation,
    isActive: block.isActive,
    status: block.status,
    isHourBlock,
    startTime: isHourBlock ? startTime : "",
    endTime: isHourBlock ? endTime : "",
    startDate,
    endDate,
  };
}