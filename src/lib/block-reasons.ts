import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type BlockReasonConfig = {
  id: string;
  code: string;
  name: string;
  requiresManualUnlock: boolean;
  blocksAllServices: boolean;
  blocksLongTripsOnly: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_BLOCK_REASONS = [
  {
    code: "DISCIPLINARIO",
    name: "Disciplinario",
    requiresManualUnlock: true,
    blocksAllServices: true,
    blocksLongTripsOnly: false,
    sortOrder: 10,
  },
  {
    code: "DOCUMENTACION",
    name: "Documentación pendiente",
    requiresManualUnlock: true,
    blocksAllServices: true,
    blocksLongTripsOnly: false,
    sortOrder: 20,
  },
  {
    code: "SINIESTRO",
    name: "Siniestro / chocado",
    requiresManualUnlock: true,
    blocksAllServices: true,
    blocksLongTripsOnly: false,
    sortOrder: 30,
  },
  {
    code: "MANTENCION",
    name: "Mantención del móvil",
    requiresManualUnlock: false,
    blocksAllServices: true,
    blocksLongTripsOnly: false,
    sortOrder: 40,
  },
  {
    code: "TERCER_FICHERO",
    name: "Tercer fichero",
    requiresManualUnlock: false,
    blocksAllServices: false,
    blocksLongTripsOnly: true,
    sortOrder: 50,
  },
  {
    code: "OTRO",
    name: "Otro",
    requiresManualUnlock: true,
    blocksAllServices: true,
    blocksLongTripsOnly: false,
    sortOrder: 90,
  },
] as const;

export function toBlockReasonConfig(value: {
  id: string;
  code: string;
  name: string;
  requiresManualUnlock: boolean;
  blocksAllServices: boolean;
  blocksLongTripsOnly: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): BlockReasonConfig {
  return {
    id: value.id,
    code: value.code,
    name: value.name,
    requiresManualUnlock: value.requiresManualUnlock,
    blocksAllServices: value.blocksAllServices,
    blocksLongTripsOnly: value.blocksLongTripsOnly,
    isActive: value.isActive,
    sortOrder: value.sortOrder,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

export async function ensureDefaultBlockReasons(client: DbClient = prisma) {
  for (const reason of DEFAULT_BLOCK_REASONS) {
    await client.blockReason.upsert({
      where: { code: reason.code },
      create: {
        code: reason.code,
        name: reason.name,
        requiresManualUnlock: reason.requiresManualUnlock,
        blocksAllServices: reason.blocksAllServices,
        blocksLongTripsOnly: reason.blocksLongTripsOnly,
        isActive: true,
        sortOrder: reason.sortOrder,
      },
      update: {
        name: reason.name,
        requiresManualUnlock: reason.requiresManualUnlock,
        blocksAllServices: reason.blocksAllServices,
        blocksLongTripsOnly: reason.blocksLongTripsOnly,
        sortOrder: reason.sortOrder,
      },
    });
  }

  return client.blockReason.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
