import { type ExecutiveConfig, defaultExecutives } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ExecutiveBody = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  isActive?: unknown;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toExecutive(value: ExecutiveConfig): ExecutiveConfig {
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    isActive: value.isActive,
    sortOrder: value.sortOrder,
  };
}

async function ensureDefaultExecutives() {
  await prisma.executive.createMany({
    data: defaultExecutives,
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
