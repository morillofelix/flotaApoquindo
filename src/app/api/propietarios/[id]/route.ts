import { requireAdminSession } from "@/lib/admin-api";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdminSession(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ message: "Registro no encontrado." }, { status: 404 });
  }

  try {
    await prisma.propietario.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Registro eliminado." });
  } catch {
    return NextResponse.json(
      { message: "No se pudo eliminar el registro." },
      { status: 500 },
    );
  }
}
