import { requireAdminPermission } from "@/lib/admin-api-server";
import { readAdminSession } from "@/lib/driver-auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
function date(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error("Fecha inválida.");
  return parsed;
}
function config(value: {
  id: string;
  driverOwnerId: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  reason: string;
  observation: string;
  createdByEmail: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  driverOwner?: { vehicleNumber: string; fullName: string };
}) {
  return {
    ...value,
    startsAt: value.startsAt?.toISOString() ?? null,
    endsAt: value.endsAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
const includeDriver = {
  driverOwner: { select: { vehicleNumber: true, fullName: true } },
} as const;

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const driverOwnerId = text(request.nextUrl.searchParams.get("driverOwnerId"));
    const restrictions = await prisma.driverLongTripRestriction.findMany({
      where: driverOwnerId ? { driverOwnerId } : undefined,
      include: includeDriver,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ restrictions: restrictions.map(config) });
  } catch (error) {
    console.error("[driver-long-trip-restrictions GET]", error);
    return NextResponse.json({ message: "No se pudieron cargar las restricciones." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const driverOwnerId = text(body.driverOwnerId);
    if (!driverOwnerId) throw new Error("Falta el conductor.");
    const startsAt = date(body.startsAt);
    const endsAt = date(body.endsAt);
    if (startsAt && endsAt && endsAt < startsAt) {
      throw new Error("La fecha de término no puede ser anterior al inicio.");
    }
    const session = readAdminSession(request);
    const restriction = await prisma.driverLongTripRestriction.create({
      data: {
        driverOwnerId,
        status: text(body.status) || "enabled",
        startsAt,
        endsAt,
        reason: text(body.reason),
        observation: text(body.observation),
        createdByEmail: session?.email ?? "",
        isActive: body.isActive !== false,
      },
      include: includeDriver,
    });
    return NextResponse.json({ restriction: config(restriction) }, { status: 201 });
  } catch (error) {
    console.error("[driver-long-trip-restrictions POST]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo crear la restricción." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = text(body.id);
    const existing = id
      ? await prisma.driverLongTripRestriction.findUnique({ where: { id } })
      : null;
    if (!existing) {
      return NextResponse.json({ message: "Restricción no encontrada." }, { status: 404 });
    }
    const startsAt = body.startsAt === undefined ? existing.startsAt : date(body.startsAt);
    const endsAt = body.endsAt === undefined ? existing.endsAt : date(body.endsAt);
    if (startsAt && endsAt && endsAt < startsAt) {
      throw new Error("La fecha de término no puede ser anterior al inicio.");
    }
    const restriction = await prisma.driverLongTripRestriction.update({
      where: { id },
      data: {
        status: body.status === undefined ? undefined : text(body.status),
        startsAt,
        endsAt,
        reason: body.reason === undefined ? undefined : text(body.reason),
        observation:
          body.observation === undefined ? undefined : text(body.observation),
        isActive:
          body.isActive === undefined ? undefined : body.isActive === true,
      },
      include: includeDriver,
    });
    return NextResponse.json({ restriction: config(restriction) });
  } catch (error) {
    console.error("[driver-long-trip-restrictions PATCH]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo actualizar la restricción." },
      { status: 400 },
    );
  }
}
