import {
  parseDriverOwnersCsv,
  toDriverOwner,
  toDriverOwnerCreateData,
  type ParsedDriverOwnerRow,
} from "@/lib/driver-owners";
import { requireAdminPermission } from "@/lib/admin-api-server";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type BulkBody = {
  csvContent?: unknown;
  rows?: unknown;
};

function isParsedRow(value: unknown): value is ParsedDriverOwnerRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as ParsedDriverOwnerRow;

  return (
    typeof row.vehicleNumber === "string" &&
    typeof row.fullName === "string" &&
    typeof row.isConductor === "boolean" &&
    typeof row.isPropietario === "boolean" &&
    typeof row.isTitular === "boolean"
  );
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");

  if (unauthorized) {
    return unauthorized;
  }

  let body: BulkBody;

  try {
    body = (await request.json()) as BulkBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  let rows: ParsedDriverOwnerRow[] = [];
  const parseErrors: string[] = [];

  if (typeof body.csvContent === "string") {
    const parsedCsv = parseDriverOwnersCsv(body.csvContent);
    rows = parsedCsv.rows;
    parseErrors.push(...parsedCsv.errors);
  } else if (Array.isArray(body.rows)) {
    rows = body.rows.filter(isParsedRow);
  }

  if (!rows.length) {
    return NextResponse.json(
      {
        message: "No hay filas válidas para importar.",
        errors: parseErrors,
      },
      { status: 400 },
    );
  }

  const errors = [...parseErrors];

  try {
    const createData = rows.map((row) => toDriverOwnerCreateData(row));

    await prisma.$transaction(async (transaction) => {
      await transaction.driverOwner.deleteMany();

      const chunkSize = 100;

      for (let index = 0; index < createData.length; index += chunkSize) {
        await transaction.driverOwner.createMany({
          data: createData.slice(index, index + chunkSize),
        });
      }
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Error desconocido de base de datos.";

    console.error("Bulk driver-owner import failed:", error);

    const needsServerRestart = detail.includes("Unknown argument");

    return NextResponse.json(
      {
        message: needsServerRestart
          ? "El servidor está desactualizado. Detén la app y ejecuta npm run dev:clean."
          : "No se pudo reemplazar la base de conductores y propietarios.",
        detail: needsServerRestart
          ? "Reinicia el servidor de desarrollo para cargar el esquema actualizado de conductores."
          : detail,
      },
      { status: 500 },
    );
  }

  const driverOwners = await prisma.driverOwner.findMany({
    orderBy: [{ vehicleNumber: "asc" }],
  });

  return NextResponse.json({
    summary: {
      imported: rows.length,
      replaced: true,
      failed: errors.length,
      total: rows.length,
    },
    errors,
    driverOwners: driverOwners.map(toDriverOwner),
  });
}
