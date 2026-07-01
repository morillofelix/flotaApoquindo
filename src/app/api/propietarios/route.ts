import { requireAdminPermission } from "@/lib/admin-api-server";
import { parseDateValue } from "@/lib/driver-owners";
import { diffPropietarioChanges } from "@/lib/propietarios-changes";
import { notifyPropietarioCreateSafely, notifyPropietarioUpdateSafely } from "@/lib/propietarios-notify-mail";
import { getPropietarioNotifyActor } from "@/lib/propietarios-notify";
import {
  displayVehicleNumber,
  normalizeVehicleNumber,
  toPropietario,
  toPropietarioCreateData,
  type PropietarioConfig,
} from "@/lib/propietarios";
import { isValidEmail } from "@/lib/pago-propietario";
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
  titularRut?: unknown;
  titularEmail?: unknown;
  titularBankName?: unknown;
  titularBankAccount?: unknown;
  bankBic?: unknown;
  paymentMethod?: unknown;
  paymentDay?: unknown;
  notes?: unknown;
  branchOffice?: unknown;
  area?: unknown;
  costCenter?: unknown;
  accountingAccount?: unknown;
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
  inactiveReason?: unknown;
  activationReason?: unknown;
};

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
    titularRut: asString(body.titularRut),
    titularEmail: asString(body.titularEmail),
    titularBankName: asString(body.titularBankName),
    titularBankAccount: asString(body.titularBankAccount),
    bankBic: asString(body.bankBic),
    paymentMethod: asString(body.paymentMethod),
    paymentDay: asString(body.paymentDay),
    notes: asString(body.notes),
    branchOffice: asString(body.branchOffice),
    area: asString(body.area),
    costCenter: asString(body.costCenter),
    accountingAccount: asString(body.accountingAccount),
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
    inactiveReason: asString(body.inactiveReason),
    activationReason: asString(body.activationReason),
    importKey: "",
  };
}

function resolveInactiveReason(
  input: ReturnType<typeof parsePropietarioBody>,
  existing: { isActive: boolean; inactiveReason: string } | null,
  bodyReason: string,
) {
  if (input.isActive) {
    return "";
  }

  if (existing?.isActive === false) {
    return bodyReason || existing.inactiveReason;
  }

  return bodyReason;
}

function validateInactiveReason(
  input: ReturnType<typeof parsePropietarioBody>,
  existing: { isActive: boolean } | null,
  inactiveReason: string,
) {
  const isDeactivating = existing?.isActive === true && !input.isActive;
  const isCreatingInactive = !existing && !input.isActive;

  if ((isDeactivating || isCreatingInactive) && inactiveReason.length < 5) {
    return "Debes indicar el motivo de inactivación (mínimo 5 caracteres).";
  }

  return null;
}

function validatePropietarioInput(input: ReturnType<typeof parsePropietarioBody>) {
  if (input.fullName.length < 3) {
    return "Ingresa una razón social válida.";
  }

  return null;
}

function validateManualCreatePropietarioInput(
  input: ReturnType<typeof parsePropietarioBody>,
) {
  const baseValidation = validatePropietarioInput(input);

  if (baseValidation) {
    return baseValidation;
  }

  if (!normalizeVehicleNumber(input.vehicleNumber)) {
    return "Ingresa un número de móvil válido.";
  }

  if (!input.email) {
    return "Ingresa un correo electrónico.";
  }

  if (!isValidEmail(input.email)) {
    return "Ingresa un correo electrónico válido.";
  }

  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "propietarios");

  if (unauthorized) {
    return unauthorized;
  }

  const propietarios = await prisma.propietario.findMany({
    orderBy: [{ fullName: "asc" }],
  });

  return NextResponse.json({
    propietarios: propietarios.map(toPropietario),
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "propietarios");

  if (unauthorized) {
    return unauthorized;
  }

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
  const validationMessage = validateManualCreatePropietarioInput(input);

  if (validationMessage) {
    return NextResponse.json({ message: validationMessage }, { status: 400 });
  }

  const inactiveReason = resolveInactiveReason(input, null, input.inactiveReason);
  const inactiveReasonMessage = validateInactiveReason(input, null, inactiveReason);

  if (inactiveReasonMessage) {
    return NextResponse.json({ message: inactiveReasonMessage }, { status: 400 });
  }

  const createData = toPropietarioCreateData({
    ...input,
    inactiveReason,
    activationReason: "",
  });

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

    const inactiveReasonForEmail =
      !createData.isActive && inactiveReason.trim()
        ? inactiveReason.trim()
        : undefined;

    const notificationSent = await notifyPropietarioCreateSafely({
      actor: getPropietarioNotifyActor(request),
      fullName: propietario.fullName,
      rut: propietario.rut,
      vehicleNumber: displayVehicleNumber(propietario.vehicleNumber),
      email: propietario.email,
      record: createData,
      inactiveReason: inactiveReasonForEmail,
    });

    return NextResponse.json(
      {
        propietario: toPropietario(propietario),
        notificationSent,
      },
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
  const unauthorized = requireAdminPermission(request, "propietarios");

  if (unauthorized) {
    return unauthorized;
  }

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

  const inactiveReason = resolveInactiveReason(
    input,
    existingPropietario,
    input.inactiveReason,
  );
  const inactiveReasonMessage = validateInactiveReason(
    input,
    existingPropietario,
    inactiveReason,
  );

  if (inactiveReasonMessage) {
    return NextResponse.json({ message: inactiveReasonMessage }, { status: 400 });
  }

  const createData = toPropietarioCreateData({
    ...input,
    importKey: existingPropietario.importKey,
    inactiveReason,
    activationReason: "",
  });
  const changes = diffPropietarioChanges(existingPropietario, createData);
  const wasDeactivated =
    existingPropietario.isActive && createData.isActive === false;
  const inactiveReasonChanged =
    (existingPropietario.inactiveReason ?? "").trim() !== inactiveReason.trim();
  const inactiveReasonForEmail =
    inactiveReason.trim() &&
    (wasDeactivated || (createData.isActive === false && inactiveReasonChanged))
      ? inactiveReason.trim()
      : undefined;

  try {
    const propietario = await prisma.propietario.update({
      where: { id },
      data: createData,
    });

    const notificationSent = await notifyPropietarioUpdateSafely({
      actor: getPropietarioNotifyActor(request),
      fullName: propietario.fullName,
      rut: propietario.rut,
      vehicleNumber: displayVehicleNumber(propietario.vehicleNumber),
      changes,
      inactiveReason: inactiveReasonForEmail,
    });

    return NextResponse.json({
      propietario: toPropietario(propietario) as PropietarioConfig,
      notificationSent,
      changesDetected: changes.length,
    });
  } catch {
    return NextResponse.json(
      { message: "No se pudo actualizar el registro." },
      { status: 500 },
    );
  }
}
