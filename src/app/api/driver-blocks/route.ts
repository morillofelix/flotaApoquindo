import { requireAdminPermission } from "@/lib/admin-api-server";
import { readAdminSession } from "@/lib/driver-auth";
import {
  createDriverBlock,
  endDriverBlock,
  toDriverBlockConfig,
} from "@/lib/driver-blocks";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
function date(value: unknown, required = false) {
  const raw = text(value);
  if (!raw) {
    if (required) throw new Error("Falta la fecha de inicio.");
    return null;
  }
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error("Fecha inválida.");
  return parsed;
}

const includeBlock = {
  blockReason: { select: { code: true, name: true } },
  driverOwner: { select: { vehicleNumber: true, fullName: true } },
} as const;

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const driverOwnerId = text(request.nextUrl.searchParams.get("driverOwnerId"));
    const blocks = await prisma.driverBlock.findMany({
      where: driverOwnerId ? { driverOwnerId } : undefined,
      include: includeBlock,
      orderBy: { startsAt: "desc" },
    });
    return NextResponse.json({ blocks: blocks.map(toDriverBlockConfig) });
  } catch (error) {
    console.error("[driver-blocks GET]", error);
    return NextResponse.json({ message: "No se pudieron cargar los bloqueos." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const session = readAdminSession(request);
    const block = await createDriverBlock({
      driverOwnerId: text(body.driverOwnerId),
      blockReasonId: text(body.blockReasonId) || undefined,
      blockReasonCode: text(body.blockReasonCode) || undefined,
      startsAt: date(body.startsAt, true)!,
      endsAt: date(body.endsAt),
      observation: text(body.observation),
      evidenceFileName: text(body.evidenceFileName),
      evidenceMimeType: text(body.evidenceMimeType),
      evidenceData: text(body.evidenceData),
      blocksAllServices:
        body.blocksAllServices === undefined ? undefined : body.blocksAllServices === true,
      blocksLongTripsOnly:
        body.blocksLongTripsOnly === undefined
          ? undefined
          : body.blocksLongTripsOnly === true,
      requiresManualUnlock:
        body.requiresManualUnlock === undefined
          ? undefined
          : body.requiresManualUnlock === true,
      status: text(body.status) || undefined,
      createdByEmail: session?.email,
    });
    return NextResponse.json({ block }, { status: 201 });
  } catch (error) {
    console.error("[driver-blocks POST]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo crear el bloqueo." },
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
    if (!id) return NextResponse.json({ message: "Falta el bloqueo." }, { status: 400 });
    const session = readAdminSession(request);
    if (body.action === "end" || body.action === "cancel") {
      const block = await endDriverBlock(id, {
        endedAt: date(body.endedAt) ?? undefined,
        unlockedByEmail: session?.email,
        unlockType: text(body.unlockType),
        unlockReason: text(body.unlockReason),
        cancel: body.action === "cancel",
      });
      return NextResponse.json({ block });
    }
    const existing = await prisma.driverBlock.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "Bloqueo no encontrado." }, { status: 404 });
    }
    const reasonId = text(body.blockReasonId);
    if (reasonId) {
      const reason = await prisma.blockReason.findUnique({ where: { id: reasonId } });
      if (!reason) throw new Error("El motivo de bloqueo no existe.");
    }
    const row = await prisma.driverBlock.update({
      where: { id },
      data: {
        blockReasonId: reasonId || undefined,
        startsAt: body.startsAt === undefined ? undefined : date(body.startsAt, true)!,
        endsAt:
          body.endsAt === undefined
            ? undefined
            : date(body.endsAt) === null
              ? { set: null }
              : date(body.endsAt)!,
        observation:
          body.observation === undefined ? undefined : text(body.observation),
        status: body.status === undefined ? undefined : text(body.status),
        isActive:
          body.isActive === undefined ? undefined : body.isActive === true,
        blocksAllServices:
          body.blocksAllServices === undefined
            ? undefined
            : body.blocksAllServices === true,
        blocksLongTripsOnly:
          body.blocksLongTripsOnly === undefined
            ? undefined
            : body.blocksLongTripsOnly === true,
        requiresManualUnlock:
          body.requiresManualUnlock === undefined
            ? undefined
            : body.requiresManualUnlock === true,
      },
      include: includeBlock,
    });
    return NextResponse.json({ block: toDriverBlockConfig(row) });
  } catch (error) {
    console.error("[driver-blocks PATCH]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo actualizar el bloqueo." },
      { status: 400 },
    );
  }
}
