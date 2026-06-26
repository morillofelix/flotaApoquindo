import {
  parsePropietariosCsv,
  toPropietario,
  toPropietarioCreateData,
  type ParsedPropietarioRow,
} from "@/lib/propietarios";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type BulkBody = {
  csvContent?: unknown;
  rows?: unknown;
};

function isParsedRow(value: unknown): value is ParsedPropietarioRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as ParsedPropietarioRow;

  return (
    typeof row.importKey === "string" &&
    typeof row.fullName === "string"
  );
}

export async function POST(request: NextRequest) {
  let body: BulkBody;

  try {
    body = (await request.json()) as BulkBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  let rows: ParsedPropietarioRow[] = [];
  const parseErrors: string[] = [];

  if (typeof body.csvContent === "string") {
    const parsedCsv = parsePropietariosCsv(body.csvContent);
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
    const createData = rows.map((row) => toPropietarioCreateData(row));

    await prisma.$transaction(async (transaction) => {
      await transaction.propietario.deleteMany();

      const chunkSize = 100;

      for (let index = 0; index < createData.length; index += chunkSize) {
        await transaction.propietario.createMany({
          data: createData.slice(index, index + chunkSize),
        });
      }
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Error desconocido de base de datos.";

    console.error("Bulk propietario import failed:", error);

    return NextResponse.json(
      {
        message: "No se pudo reemplazar la base de propietarios.",
        detail,
        errors: errors.length ? errors : [detail],
      },
      { status: 500 },
    );
  }

  const propietarios = await prisma.propietario.findMany({
    orderBy: [{ fullName: "asc" }],
  });

  return NextResponse.json({
    summary: {
      imported: rows.length,
      replaced: true,
      failed: errors.length,
      total: rows.length,
    },
    errors,
    propietarios: propietarios.map(toPropietario),
  });
}
