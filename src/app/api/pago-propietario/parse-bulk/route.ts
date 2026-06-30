import { requireAdminPermission } from "@/lib/admin-api-server";
import { readPagoPropietarioBulkFromBuffer } from "@/lib/pago-propietario-bulk-read";
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

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: "Debes adjuntar un archivo Excel." },
      { status: 400 },
    );
  }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = readPagoPropietarioBulkFromBuffer(file.name, buffer);

    return NextResponse.json(parsed);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo leer el archivo Excel.";

    return NextResponse.json({ message }, { status: 400 });
  }
}
