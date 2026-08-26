import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  backfillDriverGroupsFromShifts,
  ensureDefaultDriverGroups,
  toDriverGroupConfig,
} from "@/lib/driver-groups";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type GroupBody = {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  isActive?: unknown;
};

function asString(value: unknown) {
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

async function loadGroups() {
  await ensureDefaultDriverGroups();
  await backfillDriverGroupsFromShifts();

  return prisma.driverGroup.findMany({
    include: {
      _count: {
        select: { drivers: true, subgroups: true },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const groups = await loadGroups();
    return NextResponse.json({
      groups: groups.map(toDriverGroupConfig),
    });
  } catch (error) {
    console.error("GET /api/driver-groups failed:", error);
    return NextResponse.json(
      { message: "No se pudieron cargar los grupos." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  let body: GroupBody;

  try {
    body = (await request.json()) as GroupBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const name = asString(body.name);
  const code = normalizeCode(asString(body.code) || name);

  if (!name || !code) {
    return NextResponse.json(
      { message: "Ingresa código y nombre del grupo." },
      { status: 400 },
    );
  }

  const duplicate = await prisma.driverGroup.findUnique({ where: { code } });

  if (duplicate) {
    return NextResponse.json(
      { message: "Ya existe un grupo con ese código." },
      { status: 409 },
    );
  }

  const maxSort = await prisma.driverGroup.aggregate({ _max: { sortOrder: true } });

  try {
    const group = await prisma.driverGroup.create({
      data: {
        code,
        name,
        isActive: body.isActive === undefined ? true : body.isActive === true,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      include: {
        _count: { select: { drivers: true, subgroups: true } },
      },
    });

    return NextResponse.json(
      { group: toDriverGroupConfig(group) },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/driver-groups failed:", error);
    return NextResponse.json(
      { message: "No se pudo crear el grupo." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  let body: GroupBody;

  try {
    body = (await request.json()) as GroupBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const id = asString(body.id);

  if (!id) {
    return NextResponse.json({ message: "Grupo no encontrado." }, { status: 404 });
  }

  const existing = await prisma.driverGroup.findUnique({
    where: { id },
    include: { _count: { select: { drivers: true } } },
  });

  if (!existing) {
    return NextResponse.json({ message: "Grupo no encontrado." }, { status: 404 });
  }

  const name = asString(body.name) || existing.name;
  const code = normalizeCode(asString(body.code) || existing.code);
  const isActive =
    body.isActive === undefined ? existing.isActive : body.isActive === true;

  if (!name || !code) {
    return NextResponse.json(
      { message: "Ingresa código y nombre del grupo." },
      { status: 400 },
    );
  }

  if (!isActive && existing.isActive && existing._count.drivers > 0) {
    // Allowed: inactivate even with associations; never hard-delete.
  }

  const duplicate = await prisma.driverGroup.findFirst({
    where: { code, NOT: { id } },
  });

  if (duplicate) {
    return NextResponse.json(
      { message: "Ya existe un grupo con ese código." },
      { status: 409 },
    );
  }

  try {
    const group = await prisma.driverGroup.update({
      where: { id },
      data: { code, name, isActive },
      include: {
        _count: { select: { drivers: true, subgroups: true } },
      },
    });

    return NextResponse.json({ group: toDriverGroupConfig(group) });
  } catch (error) {
    console.error("PATCH /api/driver-groups failed:", error);
    return NextResponse.json(
      { message: "No se pudo actualizar el grupo." },
      { status: 500 },
    );
  }
}
