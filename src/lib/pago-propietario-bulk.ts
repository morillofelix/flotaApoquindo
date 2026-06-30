import {
  createPagoLineItem,
  getPropietarioKey,
  getTitularEmail,
  isValidEmail,
  parsePagoAmountInput,
  type PagoPropietarioLineItem,
} from "@/lib/pago-propietario";
import {
  displayVehicleNumber,
  normalizeVehicleNumber,
  preparePropietarioUploadContent,
  readPropietarioFileContent,
  type PropietarioConfig,
} from "@/lib/propietarios";

export type PagoBulkParsedRow = {
  rowNumber: number;
  vehicleNumber: string;
  amount: number;
};

export type PagoBulkParseResult = {
  rows: PagoBulkParsedRow[];
  errors: string[];
};

export type PagoBulkImportResult = {
  items: PagoPropietarioLineItem[];
  errors: string[];
  skippedDuplicates: number;
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue.trim());
  return values;
}

function detectDelimiter(headerLine: string) {
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;

  return semicolonCount > commaCount ? ";" : ",";
}

function isTotalFacturarHeader(header: string) {
  return (
    header === "total_facturar" ||
    header === "total_a_facturar" ||
    header.includes("total_facturar")
  );
}

function parseBulkAmount(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return 0;
  }

  if (/,\d{1,2}$/.test(trimmed)) {
    const normalized = trimmed.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }

  return parsePagoAmountInput(trimmed);
}

type PagoBulkHeaderMatch = {
  headerIndex: number;
  delimiter: string;
  mobileIndex: number;
  amountIndex: number;
};

function findPagoBulkHeader(lines: string[]): PagoBulkHeaderMatch | null {
  const maxScan = Math.min(lines.length, 50);

  for (let headerIndex = 0; headerIndex < maxScan; headerIndex += 1) {
    const line = lines[headerIndex] ?? "";
    const delimiters =
      line.includes(";") && line.includes(",")
        ? [detectDelimiter(line), detectDelimiter(line) === ";" ? "," : ";"]
        : line.includes(";")
          ? [";", ","]
          : [",", ";"];

    for (const delimiter of delimiters) {
      const rawHeaders = parseCsvLine(line, delimiter);
      const headers = rawHeaders.map(normalizeHeader);
      const amountIndex = headers.findIndex((header) =>
        isTotalFacturarHeader(header),
      );

      if (amountIndex === -1) {
        continue;
      }

      const mobileIndex = rawHeaders.findIndex((header) => !header.trim());

      if (mobileIndex === -1) {
        continue;
      }

      return {
        headerIndex,
        delimiter,
        mobileIndex,
        amountIndex,
      };
    }
  }

  return null;
}

export function parsePagoPropietarioBulkCsv(content: string): PagoBulkParseResult {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: ["El archivo debe incluir encabezados y al menos una fila de datos."],
    };
  }

  const headerMatch = findPagoBulkHeader(lines);

  if (!headerMatch) {
    return {
      rows: [],
      errors: [
        'No se encontró la fila de encabezados con una columna en blanco para el móvil y la columna "total facturar".',
      ],
    };
  }

  const { headerIndex, delimiter, mobileIndex, amountIndex } = headerMatch;
  const rows: PagoBulkParsedRow[] = [];
  const errors: string[] = [];
  const seenMobiles = new Set<string>();

  for (let lineIndex = headerIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const excelRowNumber = lineIndex + 1;
    const values = parseCsvLine(lines[lineIndex] ?? "", delimiter);

    if (!values.some((value) => value.trim().length > 0)) {
      continue;
    }

    const rawMobile = (values[mobileIndex] ?? "").trim();
    const normalizedMobile = normalizeVehicleNumber(rawMobile);

    if (!normalizedMobile) {
      continue;
    }

    if (seenMobiles.has(normalizedMobile)) {
      errors.push(
        `Fila ${excelRowNumber}: el móvil ${displayVehicleNumber(normalizedMobile)} está repetido en el archivo.`,
      );
      continue;
    }

    seenMobiles.add(normalizedMobile);

    const amount = parseBulkAmount(values[amountIndex] ?? "");

    if (amount <= 0) {
      errors.push(
        `Fila ${excelRowNumber}: el móvil ${displayVehicleNumber(normalizedMobile)} no tiene un monto válido en "total facturar".`,
      );
      continue;
    }

    rows.push({
      rowNumber: excelRowNumber,
      vehicleNumber: normalizedMobile,
      amount,
    });
  }

  if (!rows.length && !errors.length) {
    errors.push("No se encontraron filas válidas con móvil y monto en el archivo.");
  }

  return { rows, errors };
}

export async function readPagoPropietarioBulkFile(file: File) {
  const rawContent = await readPropietarioFileContent(file);
  const prepared = preparePropietarioUploadContent(file.name, rawContent);

  if ("error" in prepared) {
    throw new Error(prepared.error);
  }

  return parsePagoPropietarioBulkCsv(prepared.csvContent);
}

export function importPagoBulkRows(
  parsedRows: PagoBulkParsedRow[],
  propietarios: PropietarioConfig[],
  existingLineItems: PagoPropietarioLineItem[],
): PagoBulkImportResult {
  const propietariosByMobile = new Map<string, PropietarioConfig>();

  for (const propietario of propietarios) {
    const mobileKey = normalizeVehicleNumber(propietario.vehicleNumber);

    if (!mobileKey) {
      continue;
    }

    propietariosByMobile.set(mobileKey, propietario);
  }

  const existingIds = new Set(existingLineItems.map((item) => item.propietarioId));
  const items: PagoPropietarioLineItem[] = [];
  const errors: string[] = [];
  let skippedDuplicates = 0;

  for (const row of parsedRows) {
    const propietario = propietariosByMobile.get(row.vehicleNumber);

    if (!propietario) {
      errors.push(
        `Fila ${row.rowNumber}: el móvil ${displayVehicleNumber(row.vehicleNumber)} no está en propietarios.`,
      );
      continue;
    }

    const propietarioId = getPropietarioKey(propietario);

    if (existingIds.has(propietarioId)) {
      skippedDuplicates += 1;
      errors.push(
        `Fila ${row.rowNumber}: el móvil ${displayVehicleNumber(row.vehicleNumber)} ya está en el lote.`,
      );
      continue;
    }

    const titularEmail = getTitularEmail(propietario);

    if (!isValidEmail(titularEmail)) {
      errors.push(
        `Fila ${row.rowNumber}: el móvil ${displayVehicleNumber(row.vehicleNumber)} no tiene correo de titular válido en propietarios.`,
      );
      continue;
    }

    const lineItem = createPagoLineItem(propietario, row.amount);
    items.push(lineItem);
    existingIds.add(propietarioId);
  }

  return {
    items,
    errors,
    skippedDuplicates,
  };
}
