import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  normalizePropietarioBankBic,
  normalizePropietarioBankName,
  toPropietarioBank,
} from "@/lib/propietarios-banks";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type BankBody = {
  id?: unknown;
  name?: unknown;
  bankBic?: unknown;
  isActive?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function findDuplicateBankBic(bankBic: string, excludeId = "") {
  const normalizedBic = normalizePropietarioBankBic(bankBic);

  if (!normalizedBic) {
    return null;
  }

  const banks = await prisma.propietarioBank.findMany({
    where: excludeId ? { id: { not: excludeId } } : undefined,
    select: { id: true, name: true, bankBic: true },
  });

  return (
    banks.find(
      (bank) => normalizePropietarioBankBic(bank.bankBic) === normalizedBic,
    ) ?? null
  );
}

async function syncBanksFromPropietarios() {
  const [propietarios, existingBanks] = await Promise.all([
    prisma.propietario.findMany({
      where: { bankName: { not: "" } },
      select: { bankName: true, bankBic: true },
    }),
    prisma.propietarioBank.findMany({
      select: { name: true },
    }),
  ]);

  const existingKeys = new Set(
    existingBanks.map((bank) => normalizePropietarioBankName(bank.name)),
  );

  const aggregated = new Map<
    string,
    { displayName: string; bicCounts: Map<string, number> }
  >();

  for (const row of propietarios) {
    const displayName = row.bankName.trim();

    if (!displayName) {
      continue;
    }

    const key = normalizePropietarioBankName(displayName);
    const bic = row.bankBic.trim();
    const current = aggregated.get(key) ?? {
      displayName,
      bicCounts: new Map<string, number>(),
    };

    if (displayName.length > current.displayName.length) {
      current.displayName = displayName;
    }

    if (bic) {
      current.bicCounts.set(bic, (current.bicCounts.get(bic) ?? 0) + 1);
    }

    aggregated.set(key, current);
  }

  const banksToCreate: Array<{ name: string; bankBic: string; sortOrder: number }> =
    [];
  let nextSortOrder = (await prisma.propietarioBank.count()) * 10 + 10;

  for (const [key, value] of aggregated) {
    if (existingKeys.has(key)) {
      continue;
    }

    const bestBic =
      [...value.bicCounts.entries()].sort((left, right) => right[1] - left[1])[0]
        ?.[0] ?? "";

    banksToCreate.push({
      name: value.displayName,
      bankBic: bestBic,
      sortOrder: nextSortOrder,
    });
    nextSortOrder += 10;
    existingKeys.add(key);
  }

  if (banksToCreate.length > 0) {
    await prisma.propietarioBank.createMany({
      data: banksToCreate,
      skipDuplicates: true,
    });
  }
}

async function loadBanks() {
  await syncBanksFromPropietarios();

  return prisma.propietarioBank.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "propietarios");

  if (unauthorized) {
    return unauthorized;
  }

  const banks = await loadBanks();

  return NextResponse.json({
    banks: banks.map(toPropietarioBank),
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "propietarios");

  if (unauthorized) {
    return unauthorized;
  }

  let body: BankBody;

  try {
    body = (await request.json()) as BankBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const name = asString(body.name);
  const bankBic = asString(body.bankBic);

  if (name.length < 2) {
    return NextResponse.json(
      { message: "Ingresa un nombre de banco válido." },
      { status: 400 },
    );
  }

  const existingCount = await prisma.propietarioBank.count();
  const duplicate = await prisma.propietarioBank.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
  });

  if (duplicate) {
    return NextResponse.json(
      { message: "Este banco ya existe en el catálogo." },
      { status: 409 },
    );
  }

  const duplicateBic = await findDuplicateBankBic(bankBic);

  if (duplicateBic) {
    return NextResponse.json(
      {
        message: `El código bancario ${bankBic} ya está asignado a ${duplicateBic.name}.`,
      },
      { status: 409 },
    );
  }

  try {
    const bank = await prisma.propietarioBank.create({
      data: {
        name,
        bankBic,
        sortOrder: (existingCount + 1) * 10,
      },
    });

    return NextResponse.json(
      { bank: toPropietarioBank(bank) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "No se pudo crear el banco." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "propietarios");

  if (unauthorized) {
    return unauthorized;
  }

  let body: BankBody;

  try {
    body = (await request.json()) as BankBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const id = asString(body.id);
  const name = asString(body.name);
  const bankBic = asString(body.bankBic);
  const isActive =
    body.isActive === undefined ? undefined : body.isActive === true;

  if (!id || name.length < 2) {
    return NextResponse.json(
      { message: "Datos de banco incompletos." },
      { status: 400 },
    );
  }

  const duplicate = await prisma.propietarioBank.findFirst({
    where: {
      id: { not: id },
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
  });

  if (duplicate) {
    return NextResponse.json(
      { message: "Ya existe otro banco con ese nombre." },
      { status: 409 },
    );
  }

  const duplicateBic = await findDuplicateBankBic(bankBic, id);

  if (duplicateBic) {
    return NextResponse.json(
      {
        message: `El código bancario ${bankBic} ya está asignado a ${duplicateBic.name}.`,
      },
      { status: 409 },
    );
  }

  try {
    const bank = await prisma.propietarioBank.update({
      where: { id },
      data: {
        name,
        bankBic,
        ...(isActive === undefined ? {} : { isActive }),
      },
    });

    return NextResponse.json({ bank: toPropietarioBank(bank) });
  } catch {
    return NextResponse.json(
      { message: "No se pudo actualizar el banco." },
      { status: 500 },
    );
  }
}
