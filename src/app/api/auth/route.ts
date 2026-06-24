import {
  clearDriverSessionCookie,
  readDriverSession,
  setDriverSessionCookie,
  toPublicDriverOwner,
} from "@/lib/driver-auth";
import {
  canSendTemporaryPassword,
  getTemporaryPasswordFromRut,
  hashPassword,
  normalizeEmail,
  validatePermanentPassword,
  verifyPassword,
} from "@/lib/password-utils";
import { prisma } from "@/lib/prisma";
import {
  isTemporaryPasswordMailConfigured,
  sendTemporaryPasswordEmail,
} from "@/lib/temporary-password-mail";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type AuthBody = {
  email?: unknown;
  password?: unknown;
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

async function findActiveDriverByEmail(email: string) {
  return prisma.driverOwner.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      isActive: true,
      isConductor: true,
    },
  });
}

async function handleLogin(body: AuthBody) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { message: "Correo y clave requeridos." },
      { status: 400 },
    );
  }

  const driverOwner = await findActiveDriverByEmail(normalizeEmail(email));

  if (
    !driverOwner ||
    !driverOwner.passwordHash ||
    !verifyPassword(password, driverOwner.passwordHash)
  ) {
    return NextResponse.json(
      { message: "Correo o clave incorrectos." },
      { status: 401 },
    );
  }

  const publicDriver = toPublicDriverOwner(driverOwner);
  const response = NextResponse.json({
    ok: true,
    driverOwner: publicDriver,
  });

  if (!publicDriver.mustChangePassword) {
    const cookieSet = setDriverSessionCookie(response, {
      vehicleNumber: driverOwner.vehicleNumber,
      email: normalizeEmail(driverOwner.email),
      fullName: driverOwner.fullName,
      mobilePhone: driverOwner.mobilePhone,
      landlinePhone: driverOwner.landlinePhone,
    });

    if (!cookieSet) {
      return NextResponse.json(
        { message: "Sesión no configurada en el servidor." },
        { status: 500 },
      );
    }
  }

  return response;
}

async function handleChangePassword(body: AuthBody) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!email || !currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json(
      { message: "Completa todos los campos." },
      { status: 400 },
    );
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { message: "La clave nueva y su confirmación no coinciden." },
      { status: 400 },
    );
  }

  const validationMessage = validatePermanentPassword(newPassword);

  if (validationMessage) {
    return NextResponse.json({ message: validationMessage }, { status: 400 });
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { message: "La clave nueva debe ser distinta a la clave temporal." },
      { status: 400 },
    );
  }

  const driverOwner = await findActiveDriverByEmail(normalizeEmail(email));

  if (
    !driverOwner ||
    !driverOwner.passwordHash ||
    !verifyPassword(currentPassword, driverOwner.passwordHash)
  ) {
    return NextResponse.json(
      { message: "La clave actual no es válida." },
      { status: 401 },
    );
  }

  const updated = await prisma.driverOwner.update({
    where: { id: driverOwner.id },
    data: {
      passwordHash: hashPassword(newPassword.trim()),
      mustChangePassword: false,
    },
  });

  const publicDriver = toPublicDriverOwner(updated);
  const response = NextResponse.json({
    message: "Clave actualizada correctamente.",
    driverOwner: publicDriver,
  });

  const cookieSet = setDriverSessionCookie(response, {
    vehicleNumber: updated.vehicleNumber,
    email: normalizeEmail(updated.email),
    fullName: updated.fullName,
    mobilePhone: updated.mobilePhone,
    landlinePhone: updated.landlinePhone,
  });

  if (!cookieSet) {
    return NextResponse.json(
      { message: "Sesión no configurada en el servidor." },
      { status: 500 },
    );
  }

  return response;
}

async function handleRecoverPassword(body: AuthBody) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const genericMessage =
    "Si el correo está registrado, recibirás una clave temporal en los próximos minutos.";

  if (!email) {
    return NextResponse.json({ message: "Ingresa tu correo." }, { status: 400 });
  }

  if (!isTemporaryPasswordMailConfigured()) {
    return NextResponse.json(
      {
        message:
          "El envío de correo no está configurado. Contacta al administrador del sistema.",
      },
      { status: 503 },
    );
  }

  const driverOwner = await findActiveDriverByEmail(normalizeEmail(email));

  if (!driverOwner || !driverOwner.email.trim()) {
    return NextResponse.json({ message: genericMessage });
  }

  const temporaryPassword = getTemporaryPasswordFromRut(driverOwner.rut);

  if (!temporaryPassword) {
    return NextResponse.json({ message: genericMessage });
  }

  if (!canSendTemporaryPassword(driverOwner.tempPasswordSentAt)) {
    return NextResponse.json(
      {
        message:
          "Ya se envió una clave recientemente. Espera unos minutos antes de reenviar.",
      },
      { status: 429 },
    );
  }

  try {
    await sendTemporaryPasswordEmail({
      to: driverOwner.email.trim(),
      fullName: driverOwner.fullName,
      temporaryPassword,
    });

    await prisma.driverOwner.update({
      where: { id: driverOwner.id },
      data: {
        passwordHash: hashPassword(temporaryPassword),
        mustChangePassword: true,
        tempPasswordSentAt: new Date(),
      },
    });

    return NextResponse.json({ message: genericMessage });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Error desconocido de correo.";

    return NextResponse.json(
      {
        message: "No se pudo enviar la clave temporal.",
        detail,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const session = readDriverSession(request);

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  const driverOwner = await prisma.driverOwner.findFirst({
    where: {
      vehicleNumber: session.vehicleNumber,
      email: {
        equals: session.email,
        mode: "insensitive",
      },
      isActive: true,
      isConductor: true,
    },
  });

  if (!driverOwner) {
    const response = NextResponse.json({ authenticated: false });
    clearDriverSessionCookie(response);
    return response;
  }

  return NextResponse.json({
    authenticated: true,
    driverOwner: toPublicDriverOwner(driverOwner),
  });
}

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  let body: AuthBody;

  try {
    body = (await request.json()) as AuthBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  if (action === "logout") {
    const response = NextResponse.json({ ok: true });
    clearDriverSessionCookie(response);
    return response;
  }

  if (action === "change-password") {
    return handleChangePassword(body);
  }

  if (action === "recover-password") {
    return handleRecoverPassword(body);
  }

  return handleLogin(body);
}
