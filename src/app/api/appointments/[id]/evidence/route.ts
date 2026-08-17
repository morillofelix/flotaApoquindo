import { requireAdminPermission } from "@/lib/admin-api-server";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ message: "Solicitud no encontrada." }, { status: 404 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    select: {
      evidenceImageData: true,
      evidenceImageFileName: true,
      evidenceImageMimeType: true,
    },
  });

  if (!appointment?.evidenceImageData.trim()) {
    return NextResponse.json(
      { message: "Esta solicitud no tiene evidencia adjunta." },
      { status: 404 },
    );
  }

  const imageBuffer = Buffer.from(appointment.evidenceImageData, "base64");
  const mimeType = appointment.evidenceImageMimeType.trim() || "image/jpeg";
  const fileName = appointment.evidenceImageFileName.trim() || "evidencia.jpg";

  return new NextResponse(imageBuffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
