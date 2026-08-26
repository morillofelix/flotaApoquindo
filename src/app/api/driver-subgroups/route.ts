import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  ensureDefaultDriverGroups,
  formatDriverSubgroupType,
  toDriverSubgroupConfig,
} from "@/lib/driver-groups";
import { prisma } from "@/lib/prisma";
import type { DriverSubgroupType } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type SubgroupBody = {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  type?: unknown;
  groupId?: unknown;
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

function parseType(value: unknown): DriverSubgroupType | null {
  const raw = asString(value).toUpperCase();

  if (raw === "CATEGORY" || raw === "CATEGORIA" || raw === "CATEGORÍA") {
    return "CATEGORY";
  }

  if (
    raw === "THURSDAY_GROUP" ||
    raw === "GRUPO_JUEVES" ||
    raw === "GRUPO JUEVES"
  ) {
    return "THURSDAY_GROUP";
  }

  return null;
}

async function loadSubgroups(filters?: {
  groupId?: string;
  type?: DriverSubgroupType | null;
}) {
  await ensureDefaultDriverGroups();

  return prisma.driverSubgroup.findMany({
    where: {
      ...(filters?.groupId ? { groupId: filters.groupId } : {}),
      ...(filters?.type ? { type: filters.type } : {}),
    },
    include: {
      group: { select: { code: true, name: true } },
      _count: { select: { assignments: true } },
    },
    orderBy: [
      { group: { sortOrder: "asc" } },
      { type: "asc" },
      { sortOrder: "asc" },
      { name: "asc" },
    ],
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  const groupId = request.nextUrl.searchParams.get("groupId")?.trim() || "";
  const type = parseType(request.nextUrl.searchParams.get("type"));

  try {
    const subgroups = await loadSubgroups({
      groupId: groupId || undefined,
      type,
    });

    return NextResponse.json({
      subgroups: subgroups.map(toDriverSubgroupConfig),
      types: [
        { value: "CATEGORY", label: formatDriverSubgroupType("CATEGORY") },
        {
          value: "THURSDAY_GROUP",
          label: formatDriverSubgroupType("THURSDAY_GROUP"),
        },
      ],
    });
  } catch (error) {
    console.error("GET /api/driver-subgroups failed:", error);
    return NextResponse.json(
      { message: "No se pudieron cargar los subgrupos." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  let body: SubgroupBody;

  try {
    body = (await request.json()) as SubgroupBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const name = asString(body.name);
  const code = normalizeCode(asString(body.code) || name);
  const groupId = asString(body.groupId);
  const type = parseType(body.type);

  if (!name || !code || !groupId || !type) {
    return NextResponse.json(
      { message: "Completa grupo, tipo, código y nombre." },
      { status: 400 },
    );
  }

  const group = await prisma.driverGroup.findUnique({ where: { id: groupId } });

  if (!group) {
    return NextResponse.json(
      { message: "El grupo principal no existe." },
      { status: 400 },
    );
  }

  const duplicate = await prisma.driverSubgroup.findUnique({
    where: {
      groupId_type_code: { groupId, type, code },
    },
  });

  if (duplicate) {
    return NextResponse.json(
      { message: "Ya existe un subgrupo con ese código en el grupo y tipo." },
      { status: 409 },
    );
  }

  const maxSort = await prisma.driverSubgroup.aggregate({
    where: { groupId, type },
    _max: { sortOrder: true },
  });

  try {
    const subgroup = await prisma.driverSubgroup.create({
      data: {
        code,
        name,
        type,
        groupId,
        isActive: body.isActive === undefined ? true : body.isActive === true,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      include: {
        group: { select: { code: true, name: true } },
        _count: { select: { assignments: true } },
      },
    });

    return NextResponse.json(
      { subgroup: toDriverSubgroupConfig(subgroup) },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/driver-subgroups failed:", error);
    return NextResponse.json(
      { message: "No se pudo crear el subgrupo." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  let body: SubgroupBody;

  try {
    body = (await request.json()) as SubgroupBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const id = asString(body.id);

  if (!id) {
    return NextResponse.json({ message: "Subgrupo no encontrado." }, { status: 404 });
  }

  const existing = await prisma.driverSubgroup.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ message: "Subgrupo no encontrado." }, { status: 404 });
  }

  const name = asString(body.name) || existing.name;
  const code = normalizeCode(asString(body.code) || existing.code);
  const groupId = asString(body.groupId) || existing.groupId;
  const type = parseType(body.type) || existing.type;
  const isActive =
    body.isActive === undefined ? existing.isActive : body.isActive === true;

  if (!name || !code || !groupId || !type) {
    return NextResponse.json(
      { message: "Completa grupo, tipo, código y nombre." },
      { status: 400 },
    );
  }

  const group = await prisma.driverGroup.findUnique({ where: { id: groupId } });

  if (!group) {
    return NextResponse.json(
      { message: "El grupo principal no existe." },
      { status: 400 },
    );
  }

  const duplicate = await prisma.driverSubgroup.findFirst({
    where: {
      groupId,
      type,
      code,
      NOT: { id },
    },
  });

  if (duplicate) {
    return NextResponse.json(
      { message: "Ya existe un subgrupo con ese código en el grupo y tipo." },
      { status: 409 },
    );
  }

  try {
    const subgroup = await prisma.driverSubgroup.update({
      where: { id },
      data: { name, code, groupId, type, isActive },
      include: {
        group: { select: { code: true, name: true } },
        _count: { select: { assignments: true } },
      },
    });

    return NextResponse.json({ subgroup: toDriverSubgroupConfig(subgroup) });
  } catch (error) {
    console.error("PATCH /api/driver-subgroups failed:", error);
    return NextResponse.json(
      { message: "No se pudo actualizar el subgrupo." },
      { status: 500 },
    );
  }
}
