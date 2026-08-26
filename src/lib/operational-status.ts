import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type OperationalStatusConfig = {
  id: string;
  code: string;
  name: string;
  color: string;
  icon: string;
  priority: number;
  indicatesAvailability: boolean;
  blocksAssignments: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Prioridad sugerida (menor número = mayor prioridad al resolver conflictos).
 * Los colores son suaves para la matriz mensual; el mantenedor podrá editarlos.
 */
export const DEFAULT_OPERATIONAL_STATUSES = [
  {
    code: "BLOQUEADO",
    name: "Bloqueado",
    color: "#7f1d1d",
    icon: "",
    priority: 10,
    indicatesAvailability: false,
    blocksAssignments: true,
    sortOrder: 10,
  },
  {
    code: "VACACIONES",
    name: "Vacaciones",
    color: "#1e3a8a",
    icon: "",
    priority: 20,
    indicatesAvailability: false,
    blocksAssignments: true,
    sortOrder: 20,
  },
  {
    code: "PERMISO",
    name: "Permiso",
    color: "#6d28d9",
    icon: "",
    priority: 30,
    indicatesAvailability: false,
    blocksAssignments: true,
    sortOrder: 30,
  },
  {
    code: "CHOCADO",
    name: "Chocado",
    color: "#9a3412",
    icon: "",
    priority: 40,
    indicatesAvailability: false,
    blocksAssignments: true,
    sortOrder: 40,
  },
  {
    code: "MANTENCION",
    name: "Mantención",
    color: "#92400e",
    icon: "",
    priority: 45,
    indicatesAvailability: false,
    blocksAssignments: true,
    sortOrder: 45,
  },
  {
    code: "LIBRE",
    name: "Libre",
    color: "#334155",
    icon: "",
    priority: 50,
    indicatesAvailability: false,
    blocksAssignments: false,
    sortOrder: 50,
  },
  {
    code: "TURNO_DIA_LIBRE",
    name: "T. Día Libre",
    color: "#475569",
    icon: "",
    priority: 55,
    indicatesAvailability: false,
    blocksAssignments: false,
    sortOrder: 55,
  },
  {
    code: "FERIADO",
    name: "Feriado",
    color: "#be123c",
    icon: "",
    priority: 60,
    indicatesAvailability: false,
    blocksAssignments: false,
    sortOrder: 60,
  },
  {
    code: "TRABAJA",
    name: "Trabaja",
    color: "#15803d",
    icon: "",
    priority: 70,
    indicatesAvailability: true,
    blocksAssignments: false,
    sortOrder: 70,
  },
  {
    code: "SIN_CONDUCTOR",
    name: "Sin conductor",
    color: "#64748b",
    icon: "",
    priority: 80,
    indicatesAvailability: false,
    blocksAssignments: true,
    sortOrder: 80,
  },
  {
    code: "OTRO",
    name: "Otro",
    color: "#0f766e",
    icon: "",
    priority: 90,
    indicatesAvailability: false,
    blocksAssignments: false,
    sortOrder: 90,
  },
] as const;

export type DefaultOperationalStatusCode =
  (typeof DEFAULT_OPERATIONAL_STATUSES)[number]["code"];

export function toOperationalStatusConfig(value: {
  id: string;
  code: string;
  name: string;
  color: string;
  icon: string;
  priority: number;
  indicatesAvailability: boolean;
  blocksAssignments: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): OperationalStatusConfig {
  return {
    id: value.id,
    code: value.code,
    name: value.name,
    color: value.color,
    icon: value.icon,
    priority: value.priority,
    indicatesAvailability: value.indicatesAvailability,
    blocksAssignments: value.blocksAssignments,
    isActive: value.isActive,
    sortOrder: value.sortOrder,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

/** Upsert idempotente de estados base. No desactiva estados personalizados. */
export async function ensureDefaultOperationalStatuses(client: DbClient = prisma) {
  for (const status of DEFAULT_OPERATIONAL_STATUSES) {
    await client.operationalStatus.upsert({
      where: { code: status.code },
      create: {
        code: status.code,
        name: status.name,
        color: status.color,
        icon: status.icon,
        priority: status.priority,
        indicatesAvailability: status.indicatesAvailability,
        blocksAssignments: status.blocksAssignments,
        isActive: true,
        sortOrder: status.sortOrder,
      },
      update: {
        name: status.name,
        priority: status.priority,
        indicatesAvailability: status.indicatesAvailability,
        blocksAssignments: status.blocksAssignments,
        sortOrder: status.sortOrder,
      },
    });
  }

  return client.operationalStatus.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getOperationalStatusByCode(
  code: string,
  client: DbClient = prisma,
) {
  return client.operationalStatus.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
}
