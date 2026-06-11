import {
  type AppointmentReasonConfig,
  defaultAppointmentReasons,
} from "@/lib/appointments";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ReasonBody = {
  id?: unknown;
  label?: unknown;
  allowsExecutiveAssignment?: unknown;
  usesDateRange?: unknown;
  usesPermitDetails?: unknown;
  isActive?: unknown;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toReason(value: AppointmentReasonConfig): AppointmentReasonConfig {
  return {
    id: value.id,
    value: value.value,
    label: value.label,
    allowsExecutiveAssignment: value.allowsExecutiveAssignment,
    usesDateRange: value.usesDateRange,
    usesPermitDetails: value.usesPermitDetails,
    isActive: value.isActive,
    sortOrder: value.sortOrder,
  };
}

async function ensureDefaultReasons() {
  await prisma.appointmentReason.createMany({
    data: defaultAppointmentReasons.map((reason) => ({
      value: reason.value,
      label: reason.label,
      allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
      usesDateRange: reason.usesDateRange,
      usesPermitDetails: reason.usesPermitDetails,
      isActive: reason.isActive,
      sortOrder: reason.sortOrder,
    })),
    skipDuplicates: true,
  });
}

async function loadReasons() {
  await ensureDefaultReasons();

  return prisma.appointmentReason.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

function getBoolean(value: unknown) {
  return value === true;
}

export async function GET() {
  const reasons = await loadReasons();

  return NextResponse.json({
    reasons: reasons.map(toReason),
  });
}

export async function POST(request: NextRequest) {
  let body: ReasonBody;

  try {
    body = (await request.json()) as ReasonBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";

  if (label.length < 3) {
    return NextResponse.json(
      { message: "Ingresa un motivo válido." },
      { status: 400 },
    );
  }

  const baseValue = slugify(label);

  if (!baseValue) {
    return NextResponse.json(
      { message: "No se pudo generar el código del motivo." },
      { status: 400 },
    );
  }

  await ensureDefaultReasons();
  const existingCount = await prisma.appointmentReason.count();
  let value = baseValue;
  let suffix = 2;

  while (await prisma.appointmentReason.findUnique({ where: { value } })) {
    value = `${baseValue}-${suffix}`;
    suffix += 1;
  }

  const reason = await prisma.appointmentReason.create({
    data: {
      value,
      label,
      allowsExecutiveAssignment: getBoolean(body.allowsExecutiveAssignment),
      usesDateRange: getBoolean(body.usesDateRange),
      usesPermitDetails: getBoolean(body.usesPermitDetails),
      isActive: body.isActive === undefined ? true : getBoolean(body.isActive),
      sortOrder: (existingCount + 1) * 10,
    },
  });

  return NextResponse.json({ reason: toReason(reason) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  let body: ReasonBody;

  try {
    body = (await request.json()) as ReasonBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const id = typeof body.id === "string" ? body.id : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";

  if (!id || label.length < 3) {
    return NextResponse.json(
      { message: "Datos de motivo incompletos." },
      { status: 400 },
    );
  }

  try {
    const reason = await prisma.appointmentReason.update({
      where: { id },
      data: {
        label,
        allowsExecutiveAssignment: getBoolean(body.allowsExecutiveAssignment),
        usesDateRange: getBoolean(body.usesDateRange),
        usesPermitDetails: getBoolean(body.usesPermitDetails),
        isActive: getBoolean(body.isActive),
      },
    });

    return NextResponse.json({ reason: toReason(reason) });
  } catch {
    return NextResponse.json(
      { message: "No se pudo actualizar el motivo." },
      { status: 500 },
    );
  }
}
