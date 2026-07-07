import {
  isImportPlaceholderVehicleNumber,
  parseShifts,
  toDriverOwner,
  toDriverOwnerCreateData,
  type DriverOwnerConfig,
  type ShiftType,
  normalizeVehicleNumber,
  parseDateValue,
} from "@/lib/driver-owners";
import { requireAdminPermission } from "@/lib/admin-api-server";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type DriverOwnerBody = {
  id?: unknown;
  vehicleNumber?: unknown;
  fullName?: unknown;
  email?: unknown;
  rut?: unknown;
  licenseExpiryDate?: unknown;
  birthDate?: unknown;
  landlinePhone?: unknown;
  mobilePhone?: unknown;
  address?: unknown;
  recordStatus?: unknown;
  isConductor?: unknown;
  isPropietario?: unknown;
  municipalLicense?: unknown;
  shifts?: unknown;
  emergencyContactName?: unknown;
  emergencyContactEmail?: unknown;
  emergencyContactPhone?: unknown;
  licensePlate?: unknown;
  inspectionExpiryDate?: unknown;
  vehicleType?: unknown;
  subscriptionDate?: unknown;
  isActive?: unknown;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asPhone(value: unknown) {
  return asString(value).replace(/\D/g, "");
}

function asShifts(value: unknown): ShiftType[] {
  if (Array.isArray(value)) {
    return parseShifts(
      value
        .filter((item): item is string => typeof item === "string")
        .join(";"),
    );
  }

  return parseShifts(asString(value));
}

function parseDriverOwnerBody(body: DriverOwnerBody) {
  return {
    vehicleNumber: normalizeVehicleNumber(asString(body.vehicleNumber)),
    fullName: asString(body.fullName),
    email: asString(body.email),
    rut: asString(body.rut),
    licenseExpiryDate: parseDateValue(asString(body.licenseExpiryDate)),
    birthDate: parseDateValue(asString(body.birthDate)),
    landlinePhone: asPhone(body.landlinePhone),
    mobilePhone: asPhone(body.mobilePhone),
    address: asString(body.address),
    recordStatus: asString(body.recordStatus).toUpperCase() || "V",
    isConductor: body.isConductor === true,
    isPropietario: body.isPropietario === true,
    municipalLicense: asString(body.municipalLicense),
    shifts: asShifts(body.shifts),
    emergencyContactName: asString(body.emergencyContactName),
    emergencyContactEmail: asString(body.emergencyContactEmail),
    emergencyContactPhone: asPhone(body.emergencyContactPhone),
    licensePlate: asString(body.licensePlate).toUpperCase(),
    inspectionExpiryDate: parseDateValue(asString(body.inspectionExpiryDate)),
    vehicleType: asString(body.vehicleType),
    subscriptionDate: parseDateValue(asString(body.subscriptionDate)),
    isActive: body.isActive === undefined ? true : body.isActive === true,
  };
}

function validateDriverOwnerInput(
  input: ReturnType<typeof parseDriverOwnerBody>,
  options?: { allowEmptyMobile?: boolean },
) {
  if (!input.vehicleNumber && !options?.allowEmptyMobile) {
    return "Ingresa móvil y nombre válidos.";
  }

  if (input.fullName.length < 3) {
    return "Ingresa móvil y nombre válidos.";
  }

  if (!input.isConductor && !input.isPropietario) {
    return "Selecciona al menos un tipo: conductor o propietario.";
  }

  if (input.email && !emailPattern.test(input.email)) {
    return "Ingresa un correo válido.";
  }

  if (
    input.emergencyContactEmail &&
    !emailPattern.test(input.emergencyContactEmail)
  ) {
    return "Ingresa un correo de emergencia válido.";
  }

  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  const driverOwners = await prisma.driverOwner.findMany({
    orderBy: [{ vehicleNumber: "asc" }],
  });

  return NextResponse.json({
    driverOwners: driverOwners.map(toDriverOwner),
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  let body: DriverOwnerBody;

  try {
    body = (await request.json()) as DriverOwnerBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const input = parseDriverOwnerBody(body);
  const validationMessage = validateDriverOwnerInput(input);

  if (validationMessage) {
    return NextResponse.json({ message: validationMessage }, { status: 400 });
  }

  const existingDriverOwner = await prisma.driverOwner.findUnique({
    where: { vehicleNumber: input.vehicleNumber },
  });

  if (existingDriverOwner) {
    return NextResponse.json(
      {
        message:
          "Este móvil ya existe. Selecciónalo en la lista para actualizarlo.",
      },
      { status: 409 },
    );
  }

  try {
    const driverOwner = await prisma.driverOwner.create({
      data: toDriverOwnerCreateData(input),
    });

    return NextResponse.json(
      { driverOwner: toDriverOwner(driverOwner) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "No se pudo crear el registro." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  let body: DriverOwnerBody;

  try {
    body = (await request.json()) as DriverOwnerBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const id = typeof body.id === "string" ? body.id : "";
  const input = parseDriverOwnerBody(body);

  const existingDriverOwner = id
    ? await prisma.driverOwner.findUnique({ where: { id } })
    : null;

  if (!existingDriverOwner) {
    return NextResponse.json({ message: "Registro no encontrado." }, { status: 404 });
  }

  const allowEmptyMobile =
    !input.vehicleNumber &&
    isImportPlaceholderVehicleNumber(existingDriverOwner.vehicleNumber);
  const validationMessage = validateDriverOwnerInput(input, { allowEmptyMobile });

  if (validationMessage) {
    return NextResponse.json(
      { message: validationMessage ?? "Datos incompletos." },
      { status: 400 },
    );
  }

  const vehicleNumberForDb = input.vehicleNumber || existingDriverOwner.vehicleNumber;
  const data = toDriverOwnerCreateData({
    ...input,
    vehicleNumber: vehicleNumberForDb,
  });

  const duplicateVehicle = await prisma.driverOwner.findFirst({
    where: {
      vehicleNumber: vehicleNumberForDb,
      NOT: { id },
    },
  });

  if (duplicateVehicle) {
    return NextResponse.json(
      { message: "Ya existe otro registro con ese móvil." },
      { status: 409 },
    );
  }

  try {
    const driverOwner = await prisma.driverOwner.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      driverOwner: toDriverOwner(driverOwner) as DriverOwnerConfig,
    });
  } catch {
    return NextResponse.json(
      { message: "No se pudo actualizar el registro." },
      { status: 500 },
    );
  }
}
