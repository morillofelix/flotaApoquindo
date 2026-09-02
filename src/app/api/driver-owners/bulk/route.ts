import {
  parseDriverOwnersCsv,
  toDriverOwner,
  toDriverOwnerCreateData,
  type ParsedDriverOwnerRow,
  shiftsToStorage,
} from "@/lib/driver-owners";
import {
  ensureDefaultDriverGroups,
  groupCodeFromShiftType,
  primaryShiftFromStorage,
  shiftTypeFromGroupCode,
  syncDriverSubgroupAssignments,
} from "@/lib/driver-groups";
import { requireAdminPermission } from "@/lib/admin-api-server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type BulkBody = {
  csvContent?: unknown;
  rows?: unknown;
};

type GroupWithSubgroups = Prisma.DriverGroupGetPayload<{
  include: { subgroups: true };
}>;

type PreparedImportRow = {
  createData: ReturnType<typeof toDriverOwnerCreateData>;
  subgroupIds: string[];
};

const BATCH_SIZE = 50;
const TX_OPTIONS = { maxWait: 15_000, timeout: 60_000 } as const;

const driverOwnerInclude = {
  group: { select: { id: true, code: true, name: true } },
  subgroupAssignments: {
    select: {
      subgroup: {
        select: { id: true, code: true, name: true, type: true },
      },
    },
  },
} as const;

function isParsedRow(value: unknown): value is ParsedDriverOwnerRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as ParsedDriverOwnerRow;

  return (
    typeof row.vehicleNumber === "string" &&
    typeof row.fullName === "string" &&
    typeof row.isConductor === "boolean" &&
    typeof row.isPropietario === "boolean" &&
    typeof row.isTitular === "boolean"
  );
}

function normalizeLookupCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function resolveImportGroup(
  row: ParsedDriverOwnerRow,
  groupByCode: Map<string, GroupWithSubgroups>,
) {
  let group =
    (row.groupCode
      ? groupByCode.get(normalizeLookupCode(row.groupCode))
      : undefined) ?? null;

  if (!group) {
    const primary =
      row.shifts[0] ?? primaryShiftFromStorage(shiftsToStorage(row.shifts));
    if (primary) {
      group =
        groupByCode.get(normalizeLookupCode(groupCodeFromShiftType(primary))) ??
        null;
    }
  }

  return group;
}

function resolveSubgroupIdsInMemory(
  group: GroupWithSubgroups,
  row: ParsedDriverOwnerRow,
) {
  const subgroupIds: string[] = [];
  const categoryCode = normalizeLookupCode(row.categoryCode);
  const thursdayCode = normalizeLookupCode(row.thursdayGroupCode);

  if (categoryCode) {
    const category = group.subgroups.find(
      (item) =>
        item.type === "CATEGORY" &&
        (normalizeLookupCode(item.code) === categoryCode ||
          normalizeLookupCode(item.name) === categoryCode),
    );
    if (category) subgroupIds.push(category.id);
  }

  if (thursdayCode) {
    const thursday = group.subgroups.find(
      (item) =>
        item.type === "THURSDAY_GROUP" &&
        (normalizeLookupCode(item.code) === thursdayCode ||
          normalizeLookupCode(item.name) === thursdayCode),
    );
    if (thursday) subgroupIds.push(thursday.id);
  }

  return subgroupIds;
}

function prepareImportRows(
  rows: ParsedDriverOwnerRow[],
  groupByCode: Map<string, GroupWithSubgroups>,
) {
  const prepared: PreparedImportRow[] = [];

  for (const row of rows) {
    const group = resolveImportGroup(row, groupByCode);
    const shifts = group
      ? (() => {
          const shift = shiftTypeFromGroupCode(group.code);
          return shift ? [shift] : row.shifts.slice(0, 1);
        })()
      : row.shifts.slice(0, 1);

    prepared.push({
      createData: toDriverOwnerCreateData({
        ...row,
        shifts,
        groupId: group?.id ?? "",
      }),
      subgroupIds: group ? resolveSubgroupIdsInMemory(group, row) : [],
    });
  }

  return prepared;
}

async function importPreparedBatch(batch: PreparedImportRow[]) {
  await prisma.$transaction(async (transaction) => {
    for (const item of batch) {
      const created = await transaction.driverOwner.create({
        data: item.createData,
      });

      if (item.subgroupIds.length) {
        await syncDriverSubgroupAssignments(
          transaction,
          created.id,
          item.subgroupIds,
        );
      }
    }
  }, TX_OPTIONS);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  let body: BulkBody;

  try {
    body = (await request.json()) as BulkBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  let rows: ParsedDriverOwnerRow[] = [];
  const parseErrors: string[] = [];

  if (typeof body.csvContent === "string") {
    const parsedCsv = parseDriverOwnersCsv(body.csvContent);
    rows = parsedCsv.rows;
    parseErrors.push(...parsedCsv.errors);
  } else if (Array.isArray(body.rows)) {
    rows = body.rows.filter(isParsedRow);
  }

  if (!rows.length) {
    return NextResponse.json(
      {
        message: "No hay filas válidas para importar.",
        errors: parseErrors,
      },
      { status: 400 },
    );
  }

  const errors = [...parseErrors];

  try {
    await ensureDefaultDriverGroups();

    const groups = await prisma.driverGroup.findMany({
      include: { subgroups: true },
    });
    const groupByCode = new Map(
      groups.map((group) => [normalizeLookupCode(group.code), group]),
    );
    for (const group of groups) {
      groupByCode.set(normalizeLookupCode(group.name), group);
    }

    const preparedRows = prepareImportRows(rows, groupByCode);

    await prisma.$transaction(async (transaction) => {
      await transaction.driverSubgroupAssignment.deleteMany();
      await transaction.driverOwner.deleteMany();
    }, TX_OPTIONS);

    for (let index = 0; index < preparedRows.length; index += BATCH_SIZE) {
      await importPreparedBatch(preparedRows.slice(index, index + BATCH_SIZE));
    }
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Error desconocido de base de datos.";

    console.error("Bulk driver-owner import failed:", error);

    const needsServerRestart = detail.includes("Unknown argument");
    const transactionExpired =
      detail.includes("Transaction not found") ||
      detail.includes("Transaction API error");

    return NextResponse.json(
      {
        message: needsServerRestart
          ? "El servidor está desactualizado. Detén la app y ejecuta npm run dev:clean."
          : transactionExpired
            ? "La importación tardó demasiado y se interrumpió. Intenta de nuevo; si persiste, contacta soporte."
            : "No se pudo reemplazar la base de conductores y propietarios.",
        detail: needsServerRestart
          ? "Reinicia el servidor de desarrollo para cargar el esquema actualizado de conductores."
          : detail,
      },
      { status: 500 },
    );
  }

  const driverOwners = await prisma.driverOwner.findMany({
    include: driverOwnerInclude,
    orderBy: [{ vehicleNumber: "asc" }],
  });

  return NextResponse.json({
    summary: {
      imported: rows.length,
      replaced: true,
      failed: errors.length,
      total: rows.length,
    },
    errors,
    driverOwners: driverOwners.map(toDriverOwner),
  });
}
