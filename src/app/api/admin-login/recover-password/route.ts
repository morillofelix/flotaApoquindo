import { isAccessUserMailConfigured } from "@/lib/access-user-mail";
import {
  canIssueAccessUserTemporaryPassword,
  findActiveAccessUserByEmail,
  issueAccessUserTemporaryPassword,
} from "@/lib/access-users-server";
import { normalizeEmail } from "@/lib/password-utils";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RecoverBody = {
  email?: unknown;
};

const GENERIC_RECOVER_MESSAGE =
  "Si el correo está registrado, recibirás una clave temporal en los próximos minutos.";

export async function POST(request: NextRequest) {
  let body: RecoverBody;

  try {
    body = (await request.json()) as RecoverBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!email) {
    return NextResponse.json({ message: "Ingresa tu correo." }, { status: 400 });
  }

  if (!isAccessUserMailConfigured()) {
    return NextResponse.json(
      {
        message:
          "El envío de correo no está configurado. Contacta al administrador del sistema.",
      },
      { status: 503 },
    );
  }

  const accessUser = await findActiveAccessUserByEmail(normalizeEmail(email));

  if (!accessUser || !accessUser.email.trim()) {
    return NextResponse.json({ message: GENERIC_RECOVER_MESSAGE });
  }

  if (!canIssueAccessUserTemporaryPassword(accessUser.tempPasswordSentAt)) {
    return NextResponse.json(
      {
        message:
          "Ya se envió una clave recientemente. Espera unos minutos antes de reenviar.",
      },
      { status: 429 },
    );
  }

  try {
    await issueAccessUserTemporaryPassword(accessUser);

    return NextResponse.json({ message: GENERIC_RECOVER_MESSAGE });
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
