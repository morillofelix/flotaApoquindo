import { requireAdminPermission } from "@/lib/admin-api-server";
import { parseDateValue } from "@/lib/driver-owners";
import { listPropietariosWithAutoStatus } from "@/lib/propietarios-auto-status";
import { diffPropietarioChanges } from "@/lib/propietarios-changes";
import { notifyPropietarioUpdateSafely } from "@/lib/propietarios-notify-mail";
import { getPropietarioNotifyActor } from "@/lib/propietarios-notify";
import {
  getSantiagoDateString,
  normalizePropietarioStatus,
  resolvePropietarioStatusFields,
  validatePropietarioStatusFields,
} from "@/lib/propietario-status";
import {
  normalizePropietarioBankGuaranteeFileName,
  normalizePropietarioBankGuaranteePdfData,
  validatePropietarioBankGuaranteePdf,
} from "@/lib/propietarios-bank-guarantee";
import {
  displayVehicleNumber,
  isValidPropietarioPost,
  normalizePropietarioPost,
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
  post?: unknown;
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
  status?: unknown;
  inactiveReason?: unknown;
  activationReason?: unknown;
  desvinculacionReason?: unknown;
  desvinculacionDays?: unknown;
  bankGuaranteePdfData?: unknown;
  bankGuaranteePdfFileName?: unknown;
  isProvisionalBankData?: unknown;
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
    post: normalizePropietarioPost(asString(body.post)),
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
    status: asString(body.status),
    inactiveReason: asString(body.inactiveReason),
    activationReason: asString(body.activationReason),
    desvinculacionReason: asString(body.desvinculacionReason),
    desvinculacionDays: body.desvinculacionDays,
    bankGuaranteePdfData: normalizePropietarioBankGuaranteePdfData(
      asString(body.bankGuaranteePdfData),
    ),
    bankGuaranteePdfFileName: normalizePropietarioBankGuaranteeFileName(
      body.bankGuaranteePdfFileName,
    ),
    isProvisionalBankData: body.isProvisionalBankData === true,
    importKey: "",
  };
}

function resolveBankGuaranteeFields(
  input: ReturnType<typeof parsePropietarioBody>,
  existing?: {
    bankGuaranteePdfData?: string | null;
    bankGuaranteePdfFileName?: string | null;
  } | null,
) {
  const uploadedData = input.bankGuaranteePdfData;
  const uploadedFileName = input.bankGuaranteePdfFileName;
  const existingData = existing?.bankGuaranteePdfData?.trim() ?? "";
  const existingFileName = existing?.bankGuaranteePdfFileName?.trim() ?? "";

  return {
    bankGuaranteePdfData: uploadedData || existingData,
    bankGuaranteePdfFileName:
      uploadedFileName ||
      (uploadedData ? uploadedFileName || "certificado-bancario.pdf" : existingFileName),
  };
}

function validateManualBankGuaranteePdf(
  fields: ReturnType<typeof resolveBankGuaranteeFields>,
) {
  return validatePropietarioBankGuaranteePdf(
    fields.bankGuaranteePdfData,
    fields.bankGuaranteePdfFileName || "certificado-bancario.pdf",
  );
}

function shouldSendPropietarioUpdateNotification(
  previousStatus: string,
  nextStatus: string,
  changesCount: number,
  options: {
    inactiveReason?: string;
    activationReason?: string;
    desvinculacionReason?: string;
  },
) {
  const previous = normalizePropietarioStatus(previousStatus);
  const next = normalizePropietarioStatus(nextStatus);

  if (next === "revision") {
    return false;
  }

  if (previous === "revision") {
    return (
      next === "activo" ||
      next === "inactivo" ||
      next === "desvinculado" ||
      Boolean(options.activationReason) ||
      Boolean(options.inactiveReason) ||
      Boolean(options.desvinculacionReason)
    );
  }

  return (
    changesCount > 0 ||
    Boolean(options.inactiveReason) ||
    Boolean(options.activationReason) ||
    Boolean(options.desvinculacionReason)
  );
}

function buildStatusPayload(
  input: ReturnType<typeof parsePropietarioBody>,
  existing?: {
    status?: string | null;
    isActive?: boolean;
    inactiveReason?: string | null;
    desvinculacionReason?: string | null;
    desvinculacionDays?: number | null;
    desvinculadoUntil?: Date | null;
  } | null,
) {
  return resolvePropietarioStatusFields(
    {
      status: input.status || undefined,
      isActive: input.isActive,
      inactiveReason: input.inactiveReason,
      desvinculacionReason: input.desvinculacionReason,
      desvinculacionDays: input.desvinculacionDays,
    },
    existing,
    getSantiagoDateString(),
  );
}

function validatePropietarioInput(input: ReturnType<typeof parsePropietarioBody>) {
  if (input.fullName.length < 3) {
    return "Ingresa una razón social válida.";
  }

  if (!isValidPropietarioPost(input.post)) {
    return "El código POST debe tener máximo 13 caracteres alfanuméricos.";
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

  const propietarios = await listPropietariosWithAutoStatus();

  return NextResponse.json({
    propietarios,
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

  const statusFields = buildStatusPayload({
    ...input,
    status: "revision",
    isActive: false,
  });
  const statusValidationMessage = validatePropietarioStatusFields(statusFields);

  if (statusValidationMessage) {
    return NextResponse.json({ message: statusValidationMessage }, { status: 400 });
  }

  const bankGuaranteeFields = resolveBankGuaranteeFields(input);
  const bankGuaranteeValidation = validateManualBankGuaranteePdf(bankGuaranteeFields);

  if (bankGuaranteeValidation) {
    return NextResponse.json({ message: bankGuaranteeValidation }, { status: 400 });
  }

  const createData = toPropietarioCreateData({
    ...input,
    ...statusFields,
    ...bankGuaranteeFields,
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

    return NextResponse.json(
      {
        propietario: toPropietario(propietario),
        notificationSent: false,
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

  const statusFields = buildStatusPayload(input, existingPropietario);
  const statusValidationMessage = validatePropietarioStatusFields(statusFields);

  if (statusValidationMessage) {
    return NextResponse.json({ message: statusValidationMessage }, { status: 400 });
  }

  const bankGuaranteeFields = resolveBankGuaranteeFields(input, existingPropietario);
  const bankGuaranteeValidation = validateManualBankGuaranteePdf(bankGuaranteeFields);

  if (bankGuaranteeValidation) {
    return NextResponse.json({ message: bankGuaranteeValidation }, { status: 400 });
  }

  const previousStatus =
    existingPropietario.status ||
    (existingPropietario.isActive ? "activo" : "inactivo");
  const createData = toPropietarioCreateData({
    ...input,
    importKey: existingPropietario.importKey,
    ...statusFields,
    ...bankGuaranteeFields,
    activationReason:
      statusFields.status === "activo" && previousStatus !== "activo"
        ? input.activationReason
        : "",
  });
  const changes = diffPropietarioChanges(existingPropietario, createData);
  const inactiveReasonForEmail =
    statusFields.status === "inactivo" &&
    statusFields.inactiveReason &&
    (previousStatus !== "inactivo" ||
      (existingPropietario.inactiveReason ?? "").trim() !==
        statusFields.inactiveReason)
      ? statusFields.inactiveReason
      : undefined;
  const desvinculacionReasonForEmail =
    statusFields.status === "desvinculado" &&
    statusFields.desvinculacionReason &&
    (previousStatus !== "desvinculado" ||
      (existingPropietario.desvinculacionReason ?? "").trim() !==
        statusFields.desvinculacionReason ||
      existingPropietario.desvinculacionDays !== statusFields.desvinculacionDays)
      ? statusFields.desvinculacionReason
      : undefined;
  const activationReasonForEmail =
    statusFields.status === "activo" && previousStatus !== "activo"
      ? input.activationReason.trim() ||
        (previousStatus === "revision"
          ? "Activación del propietario tras finalizar la revisión inicial."
          : "Reactivación manual del registro de propietario.")
      : undefined;
  const shouldNotify = shouldSendPropietarioUpdateNotification(
    previousStatus,
    statusFields.status,
    changes.length,
    {
      inactiveReason: inactiveReasonForEmail,
      activationReason: activationReasonForEmail,
      desvinculacionReason: desvinculacionReasonForEmail,
    },
  );

  try {
    const propietario = await prisma.propietario.update({
      where: { id },
      data: createData,
    });

    const notificationSent = shouldNotify
      ? await notifyPropietarioUpdateSafely({
          actor: getPropietarioNotifyActor(request),
          fullName: propietario.fullName,
          rut: propietario.rut,
          vehicleNumber: displayVehicleNumber(propietario.vehicleNumber),
          changes,
          inactiveReason: inactiveReasonForEmail,
          activationReason: activationReasonForEmail,
          desvinculacionReason: desvinculacionReasonForEmail,
          desvinculacionDays:
            statusFields.status === "desvinculado"
              ? statusFields.desvinculacionDays
              : undefined,
          desvinculadoUntil:
            statusFields.status === "desvinculado"
              ? statusFields.desvinculadoUntil
              : undefined,
        })
      : false;

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
