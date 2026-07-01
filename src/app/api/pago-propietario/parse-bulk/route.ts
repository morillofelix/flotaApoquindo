import { requireAdminPermission } from "@/lib/admin-api-server";
import { readPagoPropietarioBulkFromUploads } from "@/lib/pago-propietario-bulk-read";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "pagoPropietario");

  if (unauthorized) {
    return unauthorized;
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const uploads = formData
    .getAll("file")
    .filter((entry): entry is File => entry instanceof File);

  if (uploads.length === 0) {
    return NextResponse.json(
      { message: "Debes adjuntar Preliquidaciones." },
      { status: 400 },
    );
  }

  try {
    const files = await Promise.all(
      uploads.map(async (file) => ({
        fileName: file.name.replace(/\\/g, "/"),
        buffer: await file.arrayBuffer(),
      })),
    );
    const parsed = readPagoPropietarioBulkFromUploads(files);

    return NextResponse.json(parsed);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo leer el archivo Excel.";

    return NextResponse.json({ message }, { status: 400 });
  }
}
