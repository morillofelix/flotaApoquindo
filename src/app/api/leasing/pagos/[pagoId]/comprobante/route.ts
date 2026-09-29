import { leasingErrorResponse, requireLeasingAccess } from "@/lib/leasing-api-server";
import { getLeasingActor, writeLeasingAuditStandalone } from "@/lib/leasing-server";
import { getLeasingStorageProvider } from "@/lib/leasing-storage-server";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ pagoId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const unauthorized = requireLeasingAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { pagoId } = await context.params;
    const comprobante = await prisma.leasingComprobante.findUnique({
      where: { pagoId },
      select: {
        storageKey: true,
        nombreOriginal: true,
        pago: { select: { leasingId: true, cuotaId: true } },
      },
    });

    if (!comprobante) {
      return NextResponse.json({ message: "Comprobante no encontrado." }, { status: 404 });
    }

    const archivo = await getLeasingStorageProvider().read(comprobante.storageKey);

    if (!archivo) {
      return NextResponse.json({ message: "Comprobante no encontrado." }, { status: 404 });
    }

    const download = new URL(request.url).searchParams.get("download") === "1";

    if (download) {
      await writeLeasingAuditStandalone({
        actor: getLeasingActor(request),
        accion: "COMPROBANTE_DESCARGADO",
        leasingId: comprobante.pago.leasingId,
        cuotaId: comprobante.pago.cuotaId,
        pagoId,
      }).catch(() => undefined);
    }

    const fileName = comprobante.nombreOriginal.replace(/["\r\n]/g, "") || "comprobante";

    return new NextResponse(new Uint8Array(archivo.buffer), {
      status: 200,
      headers: {
        "Content-Type": archivo.mimeType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return leasingErrorResponse(error, "No se pudo abrir el comprobante.");
  }
}
