import { setAdminSessionCookie } from "@/lib/driver-auth";
import { NextResponse, type NextRequest } from "next/server";

type LoginBody = {
  user?: unknown;
  password?: unknown;
};

export async function POST(request: NextRequest) {
  const adminUser = process.env.ADMIN_USER;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUser || !adminPassword) {
    return NextResponse.json(
      { message: "Credenciales de administrador no configuradas." },
      { status: 500 },
    );
  }

  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const isValidLogin =
    body.user === adminUser && body.password === adminPassword;

  if (!isValidLogin) {
    return NextResponse.json(
      { message: "Usuario o clave incorrectos." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });

  if (!setAdminSessionCookie(response, adminUser)) {
    return NextResponse.json(
      { message: "Sesión de administrador no configurada." },
      { status: 500 },
    );
  }

  return response;
}
