import { requireAdminPermission } from "@/lib/admin-api-server";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function buildPdfFileName(fileName: string, fullName: string) {
  const normalized = fileName.trim();

  if (normalized) {
    return normalized.toLowerCase().endsWith(".pdf")
      ? normalized
      : `${normalized}.pdf`;
  }

  const safeName = fullName.trim().replace(/[^\w\s.-]/g, "").replace(/\s+/g, "-");

  return safeName
    ? `certificado-bancario-${safeName}.pdf`
    : "certificado-bancario.pdf";
}

export async function GET(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdminPermission(request, "propietarios");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ message: "Registro no encontrado." }, { status: 404 });
  }

  const propietario = await prisma.propietario.findUnique({
    where: { id },
    select: {
      fullName: true,
      bankGuaranteePdfData: true,
      bankGuaranteePdfFileName: true,
    },
  });

  if (!propietario?.bankGuaranteePdfData?.trim()) {
    return NextResponse.json(
      { message: "No hay PDF de certificado bancario para este propietario." },
      { status: 404 },
    );
  }

  const pdfBuffer = Buffer.from(propietario.bankGuaranteePdfData, "base64");
  const fileName = buildPdfFileName(
    propietario.bankGuaranteePdfFileName,
    propietario.fullName,
  );
  const shouldDownload =
    new URL(request.url).searchParams.get("download") === "1";

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${shouldDownload ? "attachment" : "inline"}; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
