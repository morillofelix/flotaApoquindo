import { requireAdminPermission } from "@/lib/admin-api-server";
import { toDriverOwner } from "@/lib/driver-owners";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as {
      driverOwnerId?: unknown;
      observation?: unknown;
    };
    const driverOwnerId =
      typeof body.driverOwnerId === "string" ? body.driverOwnerId.trim() : "";
    const observation =
      typeof body.observation === "string" ? body.observation.trim() : "";

    if (!driverOwnerId) {
      return NextResponse.json(
        { message: "Conductor no indicado." },
        { status: 400 },
      );
    }

    const existing = await prisma.driverOwner.findUnique({
      where: { id: driverOwnerId },
    });
    if (!existing) {
      return NextResponse.json(
        { message: "Conductor no encontrado." },
        { status: 404 },
      );
    }

    const driverOwner = await prisma.driverOwner.update({
      where: { id: driverOwnerId },
      data: { observation },
      include: driverOwnerInclude,
    });

    return NextResponse.json({
      driverOwner: toDriverOwner(driverOwner),
      observation: driverOwner.observation,
    });
  } catch (error) {
    console.error("[driver-owners/observation PATCH]", error);
    return NextResponse.json(
      { message: "No se pudo guardar la observación." },
      { status: 500 },
    );
  }
}
