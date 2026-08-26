import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  ensureDefaultOperationalStatuses,
  toOperationalStatusConfig,
} from "@/lib/operational-status";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: lista estados operativos (seed idempotente de defaults). Permiso Flota = conductores. */
export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const statuses = await ensureDefaultOperationalStatuses();
    return NextResponse.json({
      statuses: statuses.map(toOperationalStatusConfig),
    });
  } catch (error) {
    console.error("[operational-statuses GET]", error);
    return NextResponse.json(
      { message: "No se pudieron cargar los estados operativos." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ message: "Estado no encontrado." }, { status: 400 });
    }
    const existing = await prisma.operationalStatus.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "Estado no encontrado." }, { status: 404 });
    }
    const number = (value: unknown, fallback: number) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) ? parsed : fallback;
    };
    const status = await prisma.operationalStatus.update({
      where: { id },
      data: {
        name:
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim()
            : existing.name,
        color:
          typeof body.color === "string" && body.color.trim()
            ? body.color.trim()
            : existing.color,
        icon: typeof body.icon === "string" ? body.icon.trim() : existing.icon,
        priority: number(body.priority, existing.priority),
        sortOrder: number(body.sortOrder, existing.sortOrder),
        indicatesAvailability:
          body.indicatesAvailability === undefined
            ? existing.indicatesAvailability
            : body.indicatesAvailability === true,
        blocksAssignments:
          body.blocksAssignments === undefined
            ? existing.blocksAssignments
            : body.blocksAssignments === true,
        isActive:
          body.isActive === undefined ? existing.isActive : body.isActive === true,
      },
    });
    return NextResponse.json({ status: toOperationalStatusConfig(status) });
  } catch (error) {
    console.error("[operational-statuses PATCH]", error);
    return NextResponse.json(
      { message: "No se pudo actualizar el estado operativo." },
      { status: 500 },
    );
  }
}
