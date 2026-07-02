import {
  GENERIC_RECOVER_PASSWORD_MESSAGE,
  RecoverPasswordAudienceError,
  RecoverPasswordRateLimitError,
  RecoverPasswordSmtpError,
  parseRecoverPasswordAudience,
  recoverPasswordByEmail,
} from "@/lib/recover-password";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RecoverBody = {
  email?: unknown;
  audience?: unknown;
};

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

  let audience;

  try {
    audience = parseRecoverPasswordAudience(body.audience);
  } catch (error) {
    if (error instanceof RecoverPasswordAudienceError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }

  try {
    await recoverPasswordByEmail(email, audience);

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
