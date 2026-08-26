import type { DriverSubgroupType, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ShiftTypeCompat = "diurno" | "nocturno" | "intermedio";

export type DriverGroupConfig = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  driversCount?: number;
  subgroupsCount?: number;
};

export type DriverSubgroupConfig = {
  id: string;
  code: string;
  name: string;
  type: DriverSubgroupType;
  typeLabel: string;
  isActive: boolean;
  sortOrder: number;
  groupId: string;
  groupCode: string;
  groupName: string;
  createdAt: string;
  updatedAt: string;
  assignmentsCount?: number;
};

export type DriverOperationalClassification = {
  groupId: string;
  groupCode: string;
  groupName: string;
  categorySubgroupId: string;
  categoryCode: string;
  categoryName: string;
  thursdayGroupSubgroupId: string;
  thursdayGroupCode: string;
  thursdayGroupName: string;
};

export const DRIVER_SUBGROUP_TYPE_LABELS: Record<DriverSubgroupType, string> = {
  CATEGORY: "Categoría",
  THURSDAY_GROUP: "Grupo jueves",
};

export const DEFAULT_DRIVER_GROUPS = [
  { code: "DIURNO", name: "Diurno", sortOrder: 1, shift: "diurno" as ShiftTypeCompat },
  { code: "NOCTURNO", name: "Nocturno", sortOrder: 2, shift: "nocturno" as ShiftTypeCompat },
  { code: "INTERMEDIO", name: "Intermedio", sortOrder: 3, shift: "intermedio" as ShiftTypeCompat },
] as const;

export const DEFAULT_CATEGORY_SUBGROUPS = [
  { code: "A", name: "A", sortOrder: 1 },
  { code: "B", name: "B", sortOrder: 2 },
  { code: "C", name: "C", sortOrder: 3 },
] as const;

export const DEFAULT_THURSDAY_SUBGROUPS = [
  { code: "G1", name: "Grupo 1", sortOrder: 1 },
  { code: "G2", name: "Grupo 2", sortOrder: 2 },
] as const;

const emptyClassification = (): DriverOperationalClassification => ({
  groupId: "",
  groupCode: "",
  groupName: "",
  categorySubgroupId: "",
  categoryCode: "",
  categoryName: "",
  thursdayGroupSubgroupId: "",
  thursdayGroupCode: "",
  thursdayGroupName: "",
});

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export function shiftTypeFromGroupCode(code: string): ShiftTypeCompat | null {
  const normalized = code.trim().toUpperCase();
  const match = DEFAULT_DRIVER_GROUPS.find((group) => group.code === normalized);
  return match?.shift ?? null;
}

export function groupCodeFromShiftType(shift: ShiftTypeCompat): string {
  return (
    DEFAULT_DRIVER_GROUPS.find((group) => group.shift === shift)?.code ??
    shift.toUpperCase()
  );
}

export function primaryShiftFromStorage(value: string): ShiftTypeCompat | null {
  const aliases: Record<string, ShiftTypeCompat> = {
    diurno: "diurno",
    diurnos: "diurno",
    nocturno: "nocturno",
    nocturnos: "nocturno",
    intermedio: "intermedio",
    intermedios: "intermedio",
  };

  const parsed = value
    .split(/[;,/|]/)
    .map((part) => aliases[part.trim().toLowerCase()])
    .filter((shift): shift is ShiftTypeCompat => Boolean(shift));

  return parsed[0] ?? null;
}

export function shiftsStorageFromGroupCode(code: string) {
  const shift = shiftTypeFromGroupCode(code);
  return shift ?? "";
}

export function formatDriverSubgroupType(type: DriverSubgroupType) {
  return DRIVER_SUBGROUP_TYPE_LABELS[type] ?? type;
}

export function formatOperationalClassification(
  value: Pick<
    DriverOperationalClassification,
    "groupName" | "categoryName" | "thursdayGroupName" | "categoryCode" | "thursdayGroupCode"
  >,
  style: "full" | "short" = "full",
) {
  if (!value.groupName) {
    return "";
  }

  if (style === "short") {
    const parts = [
      value.groupName,
      value.categoryCode || value.categoryName || null,
      value.thursdayGroupCode || value.thursdayGroupName || null,
    ].filter(Boolean);
    return parts.join(" · ");
  }

  const category = value.categoryName
    ? `Categoría ${value.categoryName}`
    : "Sin categoría";
  const thursday = value.thursdayGroupName
    ? value.thursdayGroupName
    : "Sin grupo jueves";

  return `${value.groupName} | ${category} | ${thursday}`;
}

export function formatAppointmentClassificationLabel(options: {
  hasVehicle: boolean;
  hasDriver: boolean;
  classification: DriverOperationalClassification | null;
  snapshot?: {
    groupName: string;
    categoryName: string;
    thursdayGroupName: string;
    categoryCode: string;
    thursdayGroupCode: string;
  } | null;
  preferSnapshot?: boolean;
}) {
  if (options.preferSnapshot && options.snapshot?.groupName) {
    return formatOperationalClassification(
      {
        groupName: options.snapshot.groupName,
        categoryName: options.snapshot.categoryName,
        thursdayGroupName: options.snapshot.thursdayGroupName,
        categoryCode: options.snapshot.categoryCode,
        thursdayGroupCode: options.snapshot.thursdayGroupCode,
      },
      "full",
    );
  }

  if (!options.hasVehicle) {
    return "Clasificación pendiente de asignación";
  }

  if (!options.hasDriver) {
    return "Móvil sin conductor asociado";
  }

  if (!options.classification?.groupName) {
    return "Sin grupo principal";
  }

  return formatOperationalClassification(options.classification, "full");
}

export function formatAppointmentClassificationShort(
  classification: DriverOperationalClassification | null,
) {
  if (!classification?.groupName) {
    return "—";
  }

  return formatOperationalClassification(classification, "short");
}

export function toDriverGroupConfig(value: {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  _count?: { drivers?: number; subgroups?: number };
}): DriverGroupConfig {
  return {
    id: value.id,
    code: value.code,
    name: value.name,
    isActive: value.isActive,
    sortOrder: value.sortOrder,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    driversCount: value._count?.drivers,
    subgroupsCount: value._count?.subgroups,
  };
}

export function toDriverSubgroupConfig(value: {
  id: string;
  code: string;
  name: string;
  type: DriverSubgroupType;
  isActive: boolean;
  sortOrder: number;
  groupId: string;
  createdAt: Date;
  updatedAt: Date;
  group?: { code: string; name: string } | null;
  _count?: { assignments?: number };
}): DriverSubgroupConfig {
  return {
    id: value.id,
    code: value.code,
    name: value.name,
    type: value.type,
    typeLabel: formatDriverSubgroupType(value.type),
    isActive: value.isActive,
    sortOrder: value.sortOrder,
    groupId: value.groupId,
    groupCode: value.group?.code ?? "",
    groupName: value.group?.name ?? "",
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    assignmentsCount: value._count?.assignments,
  };
}

export function classificationFromDriverRelations(value: {
  groupId?: string | null;
  group?: { id: string; code: string; name: string } | null;
  subgroupAssignments?: Array<{
    subgroup: {
      id: string;
      code: string;
      name: string;
      type: DriverSubgroupType;
      isActive?: boolean;
    };
  }>;
}): DriverOperationalClassification {
  const result = emptyClassification();

  if (value.group) {
    result.groupId = value.group.id;
    result.groupCode = value.group.code;
    result.groupName = value.group.name;
  } else if (value.groupId) {
    result.groupId = value.groupId;
  }

  for (const assignment of value.subgroupAssignments ?? []) {
    const subgroup = assignment.subgroup;

    if (subgroup.type === "CATEGORY") {
      result.categorySubgroupId = subgroup.id;
      result.categoryCode = subgroup.code;
      result.categoryName = subgroup.name;
    }

    if (subgroup.type === "THURSDAY_GROUP") {
      result.thursdayGroupSubgroupId = subgroup.id;
      result.thursdayGroupCode = subgroup.code;
      result.thursdayGroupName = subgroup.name;
    }
  }

  return result;
}

export async function ensureDefaultDriverGroups(client: DbClient = prisma) {
  for (const group of DEFAULT_DRIVER_GROUPS) {
    await client.driverGroup.upsert({
      where: { code: group.code },
      create: {
        code: group.code,
        name: group.name,
        isActive: true,
        sortOrder: group.sortOrder,
      },
      update: {
        name: group.name,
        sortOrder: group.sortOrder,
      },
    });
  }

  const groups = await client.driverGroup.findMany();
  const groupByCode = new Map(groups.map((group) => [group.code, group]));

  for (const group of DEFAULT_DRIVER_GROUPS) {
    const dbGroup = groupByCode.get(group.code);

    if (!dbGroup) {
      continue;
    }

    for (const category of DEFAULT_CATEGORY_SUBGROUPS) {
      await client.driverSubgroup.upsert({
        where: {
          groupId_type_code: {
            groupId: dbGroup.id,
            type: "CATEGORY",
            code: category.code,
          },
        },
        create: {
          groupId: dbGroup.id,
          type: "CATEGORY",
          code: category.code,
          name: category.name,
          isActive: true,
          sortOrder: category.sortOrder,
        },
        update: {
          name: category.name,
          sortOrder: category.sortOrder,
        },
      });
    }

    for (const thursday of DEFAULT_THURSDAY_SUBGROUPS) {
      await client.driverSubgroup.upsert({
        where: {
          groupId_type_code: {
            groupId: dbGroup.id,
            type: "THURSDAY_GROUP",
            code: thursday.code,
          },
        },
        create: {
          groupId: dbGroup.id,
          type: "THURSDAY_GROUP",
          code: thursday.code,
          name: thursday.name,
          isActive: true,
          sortOrder: thursday.sortOrder,
        },
        update: {
          name: thursday.name,
          sortOrder: thursday.sortOrder,
        },
      });
    }
  }

  return client.driverGroup.findMany({
    include: { subgroups: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function backfillDriverGroupsFromShifts(client: DbClient = prisma) {
  await ensureDefaultDriverGroups(client);

  const groups = await client.driverGroup.findMany();
  const groupByCode = new Map(groups.map((group) => [group.code, group]));
  const drivers = await client.driverOwner.findMany({
    select: { id: true, shifts: true, groupId: true },
  });

  let assigned = 0;
  let skippedAlreadyAssigned = 0;
  let skippedNoShift = 0;
  const unresolved: string[] = [];

  for (const driver of drivers) {
    if (driver.groupId) {
      skippedAlreadyAssigned += 1;
      continue;
    }

    const primaryShift = primaryShiftFromStorage(driver.shifts);

    if (!primaryShift) {
      skippedNoShift += 1;
      unresolved.push(driver.id);
      continue;
    }

    const group = groupByCode.get(groupCodeFromShiftType(primaryShift));

    if (!group) {
      unresolved.push(driver.id);
      continue;
    }

    await client.driverOwner.update({
      where: { id: driver.id },
      data: {
        groupId: group.id,
        shifts: shiftsStorageFromGroupCode(group.code),
      },
    });
    assigned += 1;
  }

  return {
    assigned,
    skippedAlreadyAssigned,
    skippedNoShift,
    unresolvedCount: unresolved.length,
    unresolvedIds: unresolved,
  };
}

export async function resolveSubgroupIdsForDriver(options: {
  client?: DbClient;
  groupId: string;
  categorySubgroupId?: string;
  thursdayGroupSubgroupId?: string;
  requireActive?: boolean;
}) {
  const client = options.client ?? prisma;
  const requireActive = options.requireActive !== false;
  const categorySubgroupId = options.categorySubgroupId?.trim() || "";
  const thursdayGroupSubgroupId = options.thursdayGroupSubgroupId?.trim() || "";
  const subgroupIds = [categorySubgroupId, thursdayGroupSubgroupId].filter(Boolean);

  if (!subgroupIds.length) {
    return { ok: true as const, subgroupIds: [] as string[] };
  }

  const subgroups = await client.driverSubgroup.findMany({
    where: { id: { in: subgroupIds } },
  });

  if (subgroups.length !== subgroupIds.length) {
    return { ok: false as const, message: "Uno de los subgrupos no existe." };
  }

  for (const subgroup of subgroups) {
    if (subgroup.groupId !== options.groupId) {
      return {
        ok: false as const,
        message: "El subgrupo no pertenece al grupo principal seleccionado.",
      };
    }

    if (requireActive && !subgroup.isActive) {
      return {
        ok: false as const,
        message: "No puedes asignar un subgrupo inactivo.",
      };
    }
  }

  const categoryCount = subgroups.filter((item) => item.type === "CATEGORY").length;
  const thursdayCount = subgroups.filter((item) => item.type === "THURSDAY_GROUP").length;

  if (categoryCount > 1 || thursdayCount > 1) {
    return {
      ok: false as const,
      message: "Solo se permite una Categoría y un Grupo jueves por conductor.",
    };
  }

  if (categorySubgroupId) {
    const category = subgroups.find((item) => item.id === categorySubgroupId);
    if (!category || category.type !== "CATEGORY") {
      return { ok: false as const, message: "La categoría seleccionada no es válida." };
    }
  }

  if (thursdayGroupSubgroupId) {
    const thursday = subgroups.find((item) => item.id === thursdayGroupSubgroupId);
    if (!thursday || thursday.type !== "THURSDAY_GROUP") {
      return {
        ok: false as const,
        message: "El grupo jueves seleccionado no es válido.",
      };
    }
  }

  return { ok: true as const, subgroupIds };
}

export async function syncDriverSubgroupAssignments(
  client: DbClient,
  driverId: string,
  subgroupIds: string[],
) {
  await client.driverSubgroupAssignment.deleteMany({ where: { driverId } });

  if (!subgroupIds.length) {
    return;
  }

  await client.driverSubgroupAssignment.createMany({
    data: subgroupIds.map((subgroupId) => ({ driverId, subgroupId })),
    skipDuplicates: true,
  });
}

export async function findClassificationByVehicleNumber(
  vehicleNumber: string,
  client: DbClient = prisma,
): Promise<{
  hasDriver: boolean;
  classification: DriverOperationalClassification | null;
}> {
  const key = vehicleNumber.replace(/\D/g, "").padStart(3, "0");

  if (!key || key === "000") {
    return { hasDriver: false, classification: null };
  }

  const driver = await client.driverOwner.findFirst({
    where: {
      OR: [{ vehicleNumber: key }, { vehicleNumber }],
      isConductor: true,
    },
    select: {
      id: true,
      groupId: true,
      group: { select: { id: true, code: true, name: true } },
      subgroupAssignments: {
        select: {
          subgroup: {
            select: { id: true, code: true, name: true, type: true, isActive: true },
          },
        },
      },
    },
  });

  if (!driver) {
    return { hasDriver: false, classification: null };
  }

  return {
    hasDriver: true,
    classification: classificationFromDriverRelations(driver),
  };
}

export function classificationSnapshotFields(
  classification: DriverOperationalClassification | null,
) {
  return {
    driverGroupCodeSnapshot: classification?.groupCode ?? "",
    driverGroupNameSnapshot: classification?.groupName ?? "",
    driverCategoryCodeSnapshot: classification?.categoryCode ?? "",
    driverCategoryNameSnapshot: classification?.categoryName ?? "",
    driverThursdayGroupCodeSnapshot: classification?.thursdayGroupCode ?? "",
    driverThursdayGroupNameSnapshot: classification?.thursdayGroupName ?? "",
  };
}
