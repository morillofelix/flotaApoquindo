import { ensureDefaultBlockReasons } from "@/lib/block-reasons";
import { prisma } from "@/lib/prisma";

export type DriverBlockConfig = {
  id: string;
  driverOwnerId: string;
  vehicleNumber?: string;
  driverName?: string;
  blockReasonId: string;
  blockReasonCode: string;
  blockReasonName: string;
  startsAt: string;
  endsAt: string | null;
  observation: string;
  evidenceFileName: string;
  evidenceMimeType: string;
  blocksAllServices: boolean;
  blocksLongTripsOnly: boolean;
  requiresManualUnlock: boolean;
  status: string;
  createdByEmail: string;
  unlockedAt: string | null;
  unlockedByEmail: string;
  unlockType: string;
  unlockReason: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateDriverBlockInput = {
  driverOwnerId: string;
  blockReasonId?: string;
  blockReasonCode?: string;
  startsAt: Date;
  endsAt?: Date | null;
  observation?: string;
  evidenceFileName?: string;
  evidenceMimeType?: string;
  evidenceData?: string;
  blocksAllServices?: boolean;
  blocksLongTripsOnly?: boolean;
  requiresManualUnlock?: boolean;
  status?: string;
  createdByEmail?: string;
};

type DriverBlockRecord = {
  id: string;
  driverOwnerId: string;
  blockReasonId: string;
  startsAt: Date;
  endsAt: Date | null;
  observation: string;
  evidenceFileName: string;
  evidenceMimeType: string;
  blocksAllServices: boolean;
  blocksLongTripsOnly: boolean;
  requiresManualUnlock: boolean;
  status: string;
  createdByEmail: string;
  unlockedAt: Date | null;
  unlockedByEmail: string;
  unlockType: string;
  unlockReason: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  blockReason: { code: string; name: string };
  driverOwner?: { vehicleNumber: string; fullName: string };
};

export function toDriverBlockConfig(value: DriverBlockRecord): DriverBlockConfig {
  return {
    id: value.id,
    driverOwnerId: value.driverOwnerId,
    vehicleNumber: value.driverOwner?.vehicleNumber,
    driverName: value.driverOwner?.fullName,
    blockReasonId: value.blockReasonId,
    blockReasonCode: value.blockReason.code,
    blockReasonName: value.blockReason.name,
    startsAt: value.startsAt.toISOString(),
    endsAt: value.endsAt?.toISOString() ?? null,
    observation: value.observation,
    evidenceFileName: value.evidenceFileName,
    evidenceMimeType: value.evidenceMimeType,
    blocksAllServices: value.blocksAllServices,
    blocksLongTripsOnly: value.blocksLongTripsOnly,
    requiresManualUnlock: value.requiresManualUnlock,
    status: value.status,
    createdByEmail: value.createdByEmail,
    unlockedAt: value.unlockedAt?.toISOString() ?? null,
    unlockedByEmail: value.unlockedByEmail,
    unlockType: value.unlockType,
    unlockReason: value.unlockReason,
    isActive: value.isActive,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

const includeBlock = {
  blockReason: { select: { code: true, name: true } },
  driverOwner: { select: { vehicleNumber: true, fullName: true } },
} as const;

export async function createDriverBlock(input: CreateDriverBlockInput) {
  await ensureDefaultBlockReasons();
  const reason = input.blockReasonId
    ? await prisma.blockReason.findUnique({ where: { id: input.blockReasonId } })
    : await prisma.blockReason.findUnique({
        where: { code: (input.blockReasonCode || "").trim().toUpperCase() },
      });
  if (!reason || !reason.isActive) throw new Error("El motivo de bloqueo no existe.");
  if (input.endsAt && input.endsAt < input.startsAt) {
    throw new Error("La fecha de término no puede ser anterior al inicio.");
  }
  const row = await prisma.driverBlock.create({
    data: {
      driverOwnerId: input.driverOwnerId,
      blockReasonId: reason.id,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      observation: input.observation?.trim() || "",
      evidenceFileName: input.evidenceFileName?.trim() || "",
      evidenceMimeType: input.evidenceMimeType?.trim() || "",
      evidenceData: input.evidenceData || "",
      blocksAllServices: input.blocksAllServices ?? reason.blocksAllServices,
      blocksLongTripsOnly:
        input.blocksLongTripsOnly ?? reason.blocksLongTripsOnly,
      requiresManualUnlock:
        input.requiresManualUnlock ?? reason.requiresManualUnlock,
      status: input.status?.trim() || "scheduled",
      createdByEmail: input.createdByEmail?.trim().toLowerCase() || "",
      isActive: true,
    },
    include: includeBlock,
  });
  return toDriverBlockConfig(row);
}

export async function endDriverBlock(
  id: string,
  input: {
    endedAt?: Date;
    unlockedByEmail?: string;
    unlockType?: string;
    unlockReason?: string;
    cancel?: boolean;
  },
) {
  const existing = await prisma.driverBlock.findUnique({ where: { id } });
  if (!existing) throw new Error("Bloqueo no encontrado.");
  const endedAt = input.endedAt ?? new Date();
  const row = await prisma.driverBlock.update({
    where: { id },
    data: {
      endsAt: endedAt,
      unlockedAt: endedAt,
      unlockedByEmail: input.unlockedByEmail?.trim().toLowerCase() || "",
      unlockType: input.unlockType?.trim() || "manual",
      unlockReason: input.unlockReason?.trim() || "",
      status: input.cancel ? "cancelled" : "ended",
      isActive: false,
    },
    include: includeBlock,
  });
  return toDriverBlockConfig(row);
}
