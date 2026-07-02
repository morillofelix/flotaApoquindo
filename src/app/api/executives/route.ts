import { type ExecutiveConfig, defaultExecutives } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ExecutiveBody = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  isActive?: unknown;
  dailyLimitEnabled?: unknown;
  dailyLimitMax?: unknown;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseDailyLimit(body: ExecutiveBody) {
  const dailyLimitEnabled = body.dailyLimitEnabled === true;
  const rawMax =
    typeof body.dailyLimitMax === "number"
      ? body.dailyLimitMax
      : typeof body.dailyLimitMax === "string"
        ? Number(body.dailyLimitMax)
        : NaN;
  const dailyLimitMax =
    dailyLimitEnabled && Number.isFinite(rawMax) && rawMax > 0
      ? Math.floor(rawMax)
      : null;

  if (dailyLimitEnabled && dailyLimitMax === null) {
    return {
      error: "Ingresa una cantidad máxima válida cuando el tope diario está activo.",
    } as const;
  }

  return {
    dailyLimitEnabled,
    dailyLimitMax: dailyLimitEnabled ? dailyLimitMax : null,
  } as const;
}

function toExecutive(value: ExecutiveConfig): ExecutiveConfig {
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    isActive: value.isActive,
    dailyLimitEnabled: value.dailyLimitEnabled ?? false,
    dailyLimitMax: value.dailyLimitMax ?? null,
    sortOrder: value.sortOrder,
  };
}

async function ensureDefaultExecutives() {
  await prisma.executive.createMany({
    data: defaultExecutives.map((executive) => ({
      ...executive,
      dailyLimitEnabled: executive.dailyLimitEnabled ?? false,
      dailyLimitMax: executive.dailyLimitMax ?? null,
    })),
    skipDuplicates: true,
  });
}

async function loadExecutives() {
  await ensureDefaultExecutives();

  return prisma.executive.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function GET() {
  const executives = await loadExecutives();

  return NextResponse.json({
    executives: executives.map(toExecutive),
  });
}

export async function POST(request: NextRequest) {
  let body: ExecutiveBody;

  try {
    body = (await request.json()) as ExecutiveBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const dailyLimit = parseDailyLimit(body);

  if ("error" in dailyLimit) {
    return NextResponse.json({ message: dailyLimit.error }, { status: 400 });
  }

  if (name.length < 3 || !emailPattern.test(email)) {
    return NextResponse.json(
      { message: "Ingresa nombre y correo válido." },
      { status: 400 },
    );
  }

  await ensureDefaultExecutives();
  const existingCount = await prisma.executive.count();
  const existingExecutive = await prisma.executive.findUnique({
    where: { name },
  });

  if (existingExecutive) {
    return NextResponse.json(
      { message: "Este ejecutivo ya existe. Selecciónalo para actualizarlo." },
      { status: 409 },
    );
  }

  try {
    const executive = await prisma.executive.create({
      data: {
        name,
        email,
        isActive: body.isActive === undefined ? true : body.isActive === true,
        dailyLimitEnabled: dailyLimit.dailyLimitEnabled,
        dailyLimitMax: dailyLimit.dailyLimitMax,
        sortOrder: (existingCount + 1) * 10,
      },
    });

    return NextResponse.json(
      { executive: toExecutive(executive) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "No se pudo crear el ejecutivo." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  let body: ExecutiveBody;

  try {
    body = (await request.json()) as ExecutiveBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const id = typeof body.id === "string" ? body.id : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const dailyLimit = parseDailyLimit(body);

  if ("error" in dailyLimit) {
    return NextResponse.json({ message: dailyLimit.error }, { status: 400 });
  }

  if (!id || name.length < 3 || !emailPattern.test(email)) {
    return NextResponse.json(
      { message: "Datos de ejecutivo incompletos." },
      { status: 400 },
    );
  }

  try {
    const executive = await prisma.executive.update({
      where: { id },
      data: {
        name,
        email,
        isActive: body.isActive === true,
        dailyLimitEnabled: dailyLimit.dailyLimitEnabled,
        dailyLimitMax: dailyLimit.dailyLimitMax,
      },
    });

    return NextResponse.json({ executive: toExecutive(executive) });
  } catch {
    return NextResponse.json(
      { message: "No se pudo actualizar el ejecutivo." },
      { status: 500 },
    );
  }
}
