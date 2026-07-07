import {
  clearDriverSessionCookie,
  readDriverSession,
  setDriverSessionCookie,
  toPublicDriverOwner,
} from "@/lib/driver-auth";
import {
  hashPassword,
  normalizeEmail,
  validatePermanentPassword,
  verifyPassword,
} from "@/lib/password-utils";
import { prisma } from "@/lib/prisma";
import {
  GENERIC_RECOVER_PASSWORD_MESSAGE,
  RecoverPasswordRateLimitError,
  RecoverPasswordSmtpError,
  recoverPasswordByEmail,
} from "@/lib/recover-password";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/rate-limit";
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
  const password =
    typeof body.password === "string" ? body.password.trim() : "";

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
    typeof body.currentPassword === "string" ? body.currentPassword.trim() : "";
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

  if (!email) {
    return NextResponse.json({ message: "Ingresa tu correo." }, { status: 400 });
  }

  try {
    await recoverPasswordByEmail(email, "admin");

    return NextResponse.json({ message: GENERIC_RECOVER_PASSWORD_MESSAGE });
  } catch (error) {
    if (error instanceof RecoverPasswordSmtpError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }

    if (error instanceof RecoverPasswordRateLimitError) {
      return NextResponse.json({ message: error.message }, { status: 429 });
    }

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

  const driverOwner = await findActiveDriverByEmail(session.email);

  if (
    !driverOwner ||
    driverOwner.vehicleNumber !== session.vehicleNumber ||
    driverOwner.mustChangePassword
  ) {
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

  if (action === "logout") {
    const response = NextResponse.json({ ok: true });
    clearDriverSessionCookie(response);
    return response;
  }

  let body: AuthBody;

  try {
    body = (await request.json()) as AuthBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  if (action === "change-password") {
    return handleChangePassword(body);
  }

  if (action === "recover-password") {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const rate = checkRateLimit(
      getClientRateLimitKey(request, "recover-password", email),
      { limit: 5, windowMs: 60 * 60 * 1000 },
    );

    if (!rate.allowed) {
      return NextResponse.json(
        { message: "Demasiados intentos. Intenta más tarde." },
        { status: 429 },
      );
    }

    return handleRecoverPassword(body);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const loginRate = checkRateLimit(
    getClientRateLimitKey(request, "driver-login", email),
    { limit: 10, windowMs: 15 * 60 * 1000 },
  );

  if (!loginRate.allowed) {
    return NextResponse.json(
      { message: "Demasiados intentos. Intenta más tarde." },
      { status: 429 },
    );
  }

  return handleLogin(body);
}
