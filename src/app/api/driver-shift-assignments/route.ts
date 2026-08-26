import { requireAdminPermission } from "@/lib/admin-api-server";
import { writeAuditLog } from "@/lib/audit-log";
import { readAdminSession } from "@/lib/driver-auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return new Date(`${value}T12:00:00.000Z`);
}

function serializeAssignment(row: {
  id: string;
  driverOwnerId: string;
  shiftDefinitionId: string | null;
  patternId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
  observation: string;
  createdByEmail: string;
  createdAt: Date;
  updatedAt: Date;
  shiftDefinition?: { id: string; code: string; name: string } | null;
  pattern?: { id: string; code: string; name: string } | null;
  driverOwner?: { vehicleNumber: string; fullName: string };
}) {
  return {
    id: row.id,
    driverOwnerId: row.driverOwnerId,
    vehicleNumber: row.driverOwner?.vehicleNumber,
    driverName: row.driverOwner?.fullName,
    shiftDefinitionId: row.shiftDefinitionId,
    shiftDefinition: row.shiftDefinition
      ? {
          id: row.shiftDefinition.id,
          code: row.shiftDefinition.code,
          name: row.shiftDefinition.name,
        }
      : null,
    patternId: row.patternId,
    pattern: row.pattern
      ? {
          id: row.pattern.id,
          code: row.pattern.code,
          name: row.pattern.name,
        }
      : null,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
    isActive: row.isActive,
    observation: row.observation,
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;

  const driverOwnerId = asString(
    request.nextUrl.searchParams.get("driverOwnerId"),
  );
  const activeOnly = request.nextUrl.searchParams.get("active") !== "false";

  try {
    const assignments = await prisma.driverShiftAssignment.findMany({
      where: {
        ...(driverOwnerId ? { driverOwnerId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: {
        shiftDefinition: { select: { id: true, code: true, name: true } },
        pattern: { select: { id: true, code: true, name: true } },
        driverOwner: { select: { vehicleNumber: true, fullName: true } },
      },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      take: driverOwnerId ? 50 : 200,
    });

    return NextResponse.json({
      assignments: assignments.map(serializeAssignment),
    });
  } catch (error) {
    console.error("[driver-shift-assignments GET]", error);
    return NextResponse.json(
      { message: "No se pudieron cargar las asignaciones de turno." },
      { status: 500 },
    );
  }
}

/** Crea asignación vigente; cierra la anterior activa del mismo conductor (historial). */
export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const driverOwnerId = asString(body.driverOwnerId);
    const shiftDefinitionId = asString(body.shiftDefinitionId) || null;
    const patternId = asString(body.patternId) || null;
    const effectiveFrom =
      toDateOnly(asString(body.effectiveFrom)) ??
      new Date(
        `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`,
      );
    const effectiveTo = toDateOnly(asString(body.effectiveTo));
    const observation = asString(body.observation);
    const session = readAdminSession(request);

    if (!driverOwnerId) {
      return NextResponse.json(
        { message: "Indica el conductor." },
        { status: 400 },
      );
    }

    if (!shiftDefinitionId) {
      return NextResponse.json(
        { message: "Selecciona un turno operativo." },
        { status: 400 },
      );
    }

    const driver = await prisma.driverOwner.findUnique({
      where: { id: driverOwnerId },
      select: { id: true },
    });

    if (!driver) {
      return NextResponse.json(
        { message: "Conductor no encontrado." },
        { status: 404 },
      );
    }

    if (shiftDefinitionId) {
      const shift = await prisma.shiftDefinition.findUnique({
        where: { id: shiftDefinitionId },
      });
      if (!shift?.isActive) {
        return NextResponse.json(
          { message: "Turno inválido o inactivo." },
          { status: 400 },
        );
      }
    }

    if (patternId) {
      const pattern = await prisma.shiftPattern.findUnique({
        where: { id: patternId },
      });
      if (!pattern?.isActive) {
        return NextResponse.json(
          { message: "Patrón inválido o inactivo." },
          { status: 400 },
        );
      }
    }

    const assignment = await prisma.$transaction(async (tx) => {
      await tx.driverShiftAssignment.updateMany({
        where: {
          driverOwnerId,
          isActive: true,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        data: {
          isActive: false,
          effectiveTo: new Date(
            effectiveFrom.getTime() - 24 * 60 * 60 * 1000,
          ),
        },
      });

      const created = await tx.driverShiftAssignment.create({
        data: {
          driverOwnerId,
          shiftDefinitionId,
          patternId,
          effectiveFrom,
          effectiveTo,
          isActive: true,
          observation,
          createdByEmail: session?.email ?? "",
        },
        include: {
          shiftDefinition: { select: { id: true, code: true, name: true } },
          pattern: { select: { id: true, code: true, name: true } },
          driverOwner: { select: { vehicleNumber: true, fullName: true } },
        },
      });

      await writeAuditLog(
        {
          module: "planificacion-mensual",
          action: "assign-shift",
          entityType: "DriverShiftAssignment",
          entityId: created.id,
          newValue: created,
          userEmail: session?.email ?? "",
        },
        tx,
      );

      return created;
    });

    return NextResponse.json(
      { assignment: serializeAssignment(assignment) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[driver-shift-assignments POST]", error);
    return NextResponse.json(
      { message: "No se pudo guardar la asignación de turno." },
      { status: 500 },
    );
  }
}
