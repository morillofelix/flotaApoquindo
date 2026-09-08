import { authorizeHistoryAdmin } from "@/lib/history-auth-server";
import {
  PROPIETARIO_FIELD_LABELS,
  type PropietarioChangeRecord,
} from "@/lib/propietarios-changes";
import {
  getPropietarioHistoryMovementLabel,
  PROPIETARIO_HISTORY_MAX_PAGE_SIZE,
  PROPIETARIO_HISTORY_MOVEMENT_OPTIONS,
  PROPIETARIO_HISTORY_PAGE_SIZE,
  type PropietarioHistoryMovement,
  type PropietarioHistoryNotificationStatus,
} from "@/lib/propietarios-history";
import {
  normalizePropietarioStatus,
  resolvePropietarioStatusFromRecord,
} from "@/lib/propietario-status";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SANTIAGO_TIME_ZONE = "America/Santiago";

function text(value: string | null) {
  return value?.trim() ?? "";
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isValidDateOnly(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function addDateOnlyDays(value: string, days: number) {
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function getTimeZoneOffset(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SANTIAGO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const representedAsUtc = Date.UTC(
    values.year ?? 0,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    values.hour ?? 0,
    values.minute ?? 0,
    values.second ?? 0,
  );

  return representedAsUtc - date.getTime();
}

function startOfSantiagoDay(value: string) {
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day);
  let result = new Date(localAsUtc);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = new Date(localAsUtc - getTimeZoneOffset(result));
  }

  return result;
}

function monthRange(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [year = 0, month = 0] = value.split("-").map(Number);

  if (month < 1 || month > 12) {
    return null;
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(year, month, 1))
    .toISOString()
    .slice(0, 10);

  return {
    gte: startOfSantiagoDay(start),
    lt: startOfSantiagoDay(nextMonth),
  };
}

function readChanges(value: Prisma.JsonValue): PropietarioChangeRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, Prisma.JsonValue>;

    if (
      typeof record.field !== "string" ||
      typeof record.label !== "string" ||
      typeof record.before !== "string" ||
      typeof record.after !== "string"
    ) {
      return [];
    }

    return [
      {
        field: record.field,
        label: record.label,
        before: record.before,
        after: record.after,
      },
    ];
  });
}

export async function GET(request: NextRequest) {
  const authorization = await authorizeHistoryAdmin(request, ["historial"]);

  if (authorization.error) {
    return authorization.error;
  }

  const params = new URL(request.url).searchParams;
  const page = positiveInteger(params.get("page"), 1);
  const pageSize = Math.min(
    positiveInteger(params.get("pageSize"), PROPIETARIO_HISTORY_PAGE_SIZE),
    PROPIETARIO_HISTORY_MAX_PAGE_SIZE,
  );
  const rut = text(params.get("rut"));
  const name = text(params.get("name"));
  const vehicleNumber = text(params.get("vehicleNumber"));
  const actorName = text(params.get("actor"));
  const field = text(params.get("field"));
  const movement = text(params.get("movement"));
  const status = text(params.get("status"));
  const day = text(params.get("day"));
  const month = text(params.get("month"));
  const dateFrom = text(params.get("dateFrom"));
  const dateTo = text(params.get("dateTo"));

  if (
    (day && !isValidDateOnly(day)) ||
    (dateFrom && !isValidDateOnly(dateFrom)) ||
    (dateTo && !isValidDateOnly(dateTo))
  ) {
    return NextResponse.json(
      { message: "El filtro de fecha no es válido." },
      { status: 400 },
    );
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    return NextResponse.json(
      { message: "La fecha desde no puede ser posterior a la fecha hasta." },
      { status: 400 },
    );
  }

  const movementValues = new Set(
    PROPIETARIO_HISTORY_MOVEMENT_OPTIONS.map((option) => option.value),
  );

  if (movement && !movementValues.has(movement as PropietarioHistoryMovement)) {
    return NextResponse.json(
      { message: "El tipo de movimiento no es válido." },
      { status: 400 },
    );
  }

  const statusValues = new Set([
    "activo",
    "revision",
    "inactivo",
    "desvinculado",
  ]);

  if (status && !statusValues.has(status)) {
    return NextResponse.json(
      { message: "El Estado seleccionado no es válido." },
      { status: 400 },
    );
  }

  let createdAt: Prisma.DateTimeFilter | undefined;

  if (day) {
    createdAt = {
      gte: startOfSantiagoDay(day),
      lt: startOfSantiagoDay(addDateOnlyDays(day, 1)),
    };
  } else if (month) {
    const range = monthRange(month);

    if (!range) {
      return NextResponse.json(
        { message: "El mes seleccionado no es válido." },
        { status: 400 },
      );
    }

    createdAt = range;
  } else if (dateFrom || dateTo) {
    createdAt = {
      ...(dateFrom ? { gte: startOfSantiagoDay(dateFrom) } : {}),
      ...(dateTo
        ? { lt: startOfSantiagoDay(addDateOnlyDays(dateTo, 1)) }
        : {}),
    };
  }

  const where: Prisma.PropietarioHistoryWhereInput = {
    ...(rut
      ? { propietarioRut: { contains: rut, mode: "insensitive" } }
      : {}),
    ...(name
      ? { propietarioName: { contains: name, mode: "insensitive" } }
      : {}),
    ...(vehicleNumber
      ? { vehicleNumber: { contains: vehicleNumber, mode: "insensitive" } }
      : {}),
    ...(actorName ? { actorName } : {}),
    ...(field ? { changedFields: { has: field } } : {}),
    ...(movement ? { movementType: movement } : {}),
    ...(status ? { newStatus: status } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  try {
    const [records, total, actors] = await prisma.$transaction([
      prisma.propietarioHistory.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          propietario: {
            select: {
              status: true,
              isActive: true,
              updatedAt: true,
            },
          },
        },
      }),
      prisma.propietarioHistory.count({ where }),
      prisma.propietarioHistory.findMany({
        select: { actorName: true },
        distinct: ["actorName"],
        orderBy: { actorName: "asc" },
      }),
    ]);

    return NextResponse.json({
      records: records.map((record) => ({
        id: record.id,
        propietarioId: record.propietarioId,
        propietarioName: record.propietarioName,
        propietarioRut: record.propietarioRut,
        vehicleNumber: record.vehicleNumber,
        actorName: record.actorName,
        movementType: record.movementType,
        movementLabel: getPropietarioHistoryMovementLabel(record.movementType),
        changes: readChanges(record.changes),
        changedFields: record.changedFields,
        previousStatus: record.previousStatus
          ? normalizePropietarioStatus(record.previousStatus)
          : "",
        newStatus: record.newStatus
          ? normalizePropietarioStatus(record.newStatus)
          : "",
        notificationStatus:
          record.notificationStatus as PropietarioHistoryNotificationStatus,
        createdAt: record.createdAt.toISOString(),
        currentStatus: record.propietario
          ? resolvePropietarioStatusFromRecord(record.propietario)
          : null,
        currentUpdatedAt: record.propietario?.updatedAt.toISOString() ?? null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      filterOptions: {
        actors: actors
          .map((actor) => actor.actorName.trim())
          .filter(Boolean)
          .map((actorName) => ({ id: actorName, name: actorName })),
        fields: Object.entries(PROPIETARIO_FIELD_LABELS).map(
          ([value, label]) => ({ value, label }),
        ),
      },
    });
  } catch (error) {
    console.error("Propietario history query failed:", error);
    return NextResponse.json(
      { message: "No se pudo consultar el historial." },
      { status: 500 },
    );
  }
}
