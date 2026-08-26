import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  ensureDefaultBlockReasons,
  toBlockReasonConfig,
} from "@/lib/block-reasons";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: motivos de bloqueo (seed idempotente). Permiso Flota = conductores. */
export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const reasons = await ensureDefaultBlockReasons();
    return NextResponse.json({
      reasons: reasons.map(toBlockReasonConfig),
    });
  } catch (error) {
    console.error("[block-reasons GET]", error);
    return NextResponse.json(
      { message: "No se pudieron cargar los motivos de bloqueo." },
      { status: 500 },
    );
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = text(body.name);
    const code = normalizeCode(text(body.code) || name);
    if (!name || !code) {
      return NextResponse.json({ message: "Ingresa código y nombre." }, { status: 400 });
    }
    const max = await prisma.blockReason.aggregate({ _max: { sortOrder: true } });
    const reason = await prisma.blockReason.create({
      data: {
        code,
        name,
        requiresManualUnlock: body.requiresManualUnlock === true,
        blocksAllServices: body.blocksAllServices !== false,
        blocksLongTripsOnly: body.blocksLongTripsOnly === true,
        isActive: body.isActive !== false,
        sortOrder: Number.isInteger(Number(body.sortOrder))
          ? Number(body.sortOrder)
          : (max._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json({ reason: toBlockReasonConfig(reason) }, { status: 201 });
  } catch (error) {
    console.error("[block-reasons POST]", error);
    return NextResponse.json({ message: "No se pudo crear el motivo." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = text(body.id);
    const existing = id
      ? await prisma.blockReason.findUnique({ where: { id } })
      : null;
    if (!existing) {
      return NextResponse.json({ message: "Motivo no encontrado." }, { status: 404 });
    }
    const reason = await prisma.blockReason.update({
      where: { id },
      data: {
        code:
          body.code === undefined
            ? existing.code
            : normalizeCode(text(body.code)) || existing.code,
        name:
          body.name === undefined ? existing.name : text(body.name) || existing.name,
        requiresManualUnlock:
          body.requiresManualUnlock === undefined
            ? existing.requiresManualUnlock
            : body.requiresManualUnlock === true,
        blocksAllServices:
          body.blocksAllServices === undefined
            ? existing.blocksAllServices
            : body.blocksAllServices === true,
        blocksLongTripsOnly:
          body.blocksLongTripsOnly === undefined
            ? existing.blocksLongTripsOnly
            : body.blocksLongTripsOnly === true,
        isActive:
          body.isActive === undefined ? existing.isActive : body.isActive === true,
        sortOrder: Number.isInteger(Number(body.sortOrder))
          ? Number(body.sortOrder)
          : existing.sortOrder,
      },
    });
    return NextResponse.json({ reason: toBlockReasonConfig(reason) });
  } catch (error) {
    console.error("[block-reasons PATCH]", error);
    return NextResponse.json({ message: "No se pudo actualizar el motivo." }, { status: 400 });
  }
}
