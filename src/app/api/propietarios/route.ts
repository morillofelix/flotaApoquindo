import { parseDateValue } from "@/lib/driver-owners";
import {
  toPropietario,
  toPropietarioCreateData,
  type PropietarioConfig,
} from "@/lib/propietarios";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type PropietarioBody = {
  id?: unknown;
  vehicleNumber?: unknown;
  fullName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  secondLastName?: unknown;
  rut?: unknown;
  email?: unknown;
  landlinePhone?: unknown;
  mobilePhone?: unknown;
  address?: unknown;
  postalCode?: unknown;
  city?: unknown;
  province?: unknown;
  bankName?: unknown;
  bankAccount?: unknown;
  accountHolder?: unknown;
  bankBic?: unknown;
  paymentMethod?: unknown;
  paymentDay?: unknown;
  notes?: unknown;
  branchOffice?: unknown;
  area?: unknown;
  costCenter?: unknown;
  isVip?: unknown;
  gender?: unknown;
  recordStatus?: unknown;
  licenseExpiryDate?: unknown;
  birthDate?: unknown;
  incorporationDate?: unknown;
  deactivationDate?: unknown;
  emergencyContactName?: unknown;
  emergencyContactEmail?: unknown;
  emergencyContactPhone?: unknown;
  isActive?: unknown;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asPhone(value: unknown) {
  return asString(value).replace(/\D/g, "");
}

function parsePropietarioBody(body: PropietarioBody) {
  return {
    vehicleNumber: asString(body.vehicleNumber),
    fullName: asString(body.fullName),
    firstName: asString(body.firstName),
    lastName: asString(body.lastName),
    secondLastName: asString(body.secondLastName),
    rut: asString(body.rut),
    email: asString(body.email),
    landlinePhone: asPhone(body.landlinePhone),
    mobilePhone: asPhone(body.mobilePhone),
    address: asString(body.address),
    postalCode: asString(body.postalCode),
    city: asString(body.city),
    province: asString(body.province),
    bankName: asString(body.bankName),
    bankAccount: asString(body.bankAccount),
    accountHolder: asString(body.accountHolder),
    bankBic: asString(body.bankBic),
    paymentMethod: asString(body.paymentMethod),
    paymentDay: asString(body.paymentDay),
    notes: asString(body.notes),
    branchOffice: asString(body.branchOffice),
    area: asString(body.area),
    costCenter: asString(body.costCenter),
    isVip: body.isVip === true,
    gender: asString(body.gender),
    recordStatus: asString(body.recordStatus).toUpperCase() || "V",
    licenseExpiryDate: parseDateValue(asString(body.licenseExpiryDate)),
    birthDate: parseDateValue(asString(body.birthDate)),
    incorporationDate: parseDateValue(asString(body.incorporationDate)),
    deactivationDate: parseDateValue(asString(body.deactivationDate)),
    emergencyContactName: asString(body.emergencyContactName),
    emergencyContactEmail: asString(body.emergencyContactEmail),
    emergencyContactPhone: asPhone(body.emergencyContactPhone),
    isActive: body.isActive === undefined ? true : body.isActive === true,
    importKey: "",
  };
}

function validatePropietarioInput(input: ReturnType<typeof parsePropietarioBody>) {
  if (input.fullName.length < 3) {
    return "Ingresa un nombre válido.";
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

export async function GET() {
  const propietarios = await prisma.propietario.findMany({
    orderBy: [{ fullName: "asc" }],
  });

  return NextResponse.json({
    propietarios: propietarios.map(toPropietario),
  });
}

export async function POST(request: NextRequest) {
  let body: PropietarioBody;

  try {
    body = (await request.json()) as PropietarioBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const input = parsePropietarioBody(body);
  const validationMessage = validatePropietarioInput(input);

  if (validationMessage) {
    return NextResponse.json({ message: validationMessage }, { status: 400 });
  }

  const createData = toPropietarioCreateData(input);

  const existingPropietario = await prisma.propietario.findUnique({
    where: { importKey: createData.importKey },
  });

  if (existingPropietario) {
    return NextResponse.json(
      {
        message:
          "Este propietario ya existe. Selecciónalo en la lista para actualizarlo.",
      },
      { status: 409 },
    );
  }

  try {
    const propietario = await prisma.propietario.create({
      data: createData,
    });

    return NextResponse.json(
      { propietario: toPropietario(propietario) },
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
  let body: PropietarioBody;

  try {
    body = (await request.json()) as PropietarioBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const id = typeof body.id === "string" ? body.id : "";
  const input = parsePropietarioBody(body);

  const existingPropietario = id
    ? await prisma.propietario.findUnique({ where: { id } })
    : null;

  if (!existingPropietario) {
    return NextResponse.json({ message: "Registro no encontrado." }, { status: 404 });
  }

  const validationMessage = validatePropietarioInput(input);

  if (validationMessage) {
    return NextResponse.json({ message: validationMessage }, { status: 400 });
  }

  const createData = toPropietarioCreateData({
    ...input,
    importKey: existingPropietario.importKey,
  });

  try {
    const propietario = await prisma.propietario.update({
      where: { id },
      data: createData,
    });

    return NextResponse.json({
      propietario: toPropietario(propietario) as PropietarioConfig,
    });
  } catch {
    return NextResponse.json(
      { message: "No se pudo actualizar el registro." },
      { status: 500 },
    );
  }
}
