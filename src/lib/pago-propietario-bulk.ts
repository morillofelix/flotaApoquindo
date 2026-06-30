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

type PagoBulkHeaderMatch = {
  headerIndex: number;
  mobileIndex: number;
  amountIndex: number;
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeMatrixCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
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

function looksLikeBinaryExcel(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  );
}

function looksLikeXlsxArchive(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isSpreadsheetFile(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  return extension === "xls" || extension === "xlsx";
}

function isTotalFacturarHeader(header: string, rawHeader = "") {
  const normalized = normalizeHeader(rawHeader || header);

  return (
    normalized === "total_facturar" ||
    normalized === "total_a_facturar" ||
    normalized.includes("total_facturar") ||
    (normalized.includes("total") && normalized.includes("facturar"))
  );
}

function findPagoBulkHeaderInMatrix(matrix: string[][]): PagoBulkHeaderMatch | null {
  const maxScan = Math.min(matrix.length, 80);

  for (let headerIndex = 0; headerIndex < maxScan; headerIndex += 1) {
    const rawHeaders = matrix[headerIndex] ?? [];
    const headers = rawHeaders.map((header) => normalizeHeader(header));
    const amountIndex = headers.findIndex((header, index) =>
      isTotalFacturarHeader(header, rawHeaders[index] ?? ""),
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
      mobileIndex,
      amountIndex,
    };
  }

  return null;
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

export function parsePagoPropietarioBulkMatrix(
  matrix: string[][],
): PagoBulkParseResult {
  const normalizedMatrix = matrix.map((row) =>
    row.map((cell) => normalizeMatrixCell(cell)),
  );

  if (normalizedMatrix.length < 2) {
    return {
      rows: [],
      errors: ["El archivo debe incluir encabezados y al menos una fila de datos."],
    };
  }

  const headerMatch = findPagoBulkHeaderInMatrix(normalizedMatrix);

  if (!headerMatch) {
    return {
      rows: [],
      errors: [
        'No se encontró la fila de encabezados con una columna en blanco para el móvil y la columna "total facturar".',
      ],
    };
  }

  const { headerIndex, mobileIndex, amountIndex } = headerMatch;
  const rows: PagoBulkParsedRow[] = [];
  const errors: string[] = [];
  const seenMobiles = new Set<string>();

  for (
    let rowIndex = headerIndex + 1;
    rowIndex < normalizedMatrix.length;
    rowIndex += 1
  ) {
    const excelRowNumber = rowIndex + 1;
    const values = normalizedMatrix[rowIndex] ?? [];

    if (!values.some((value) => value.length > 0)) {
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

function csvContentToMatrix(content: string) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return [] as string[][];
  }

  const delimiter = detectDelimiter(lines[0] ?? ",");

  return lines.map((line) => parseCsvLine(line, delimiter));
}

export function parsePagoPropietarioBulkCsv(content: string): PagoBulkParseResult {
  return parsePagoPropietarioBulkMatrix(csvContentToMatrix(content));
}

async function readSpreadsheetMatrixWithXlsx(buffer: ArrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    dense: true,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return [] as string[][];
  }

  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return [] as string[][];
  }

  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  return matrix.map((row) => (row ?? []).map((cell) => normalizeMatrixCell(cell)));
}

async function readSpreadsheetMatrixFromFile(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const shouldTryXlsx =
    isSpreadsheetFile(file.name) ||
    looksLikeBinaryExcel(bytes) ||
    looksLikeXlsxArchive(bytes);

  if (shouldTryXlsx) {
    try {
      const matrix = await readSpreadsheetMatrixWithXlsx(buffer);

      if (matrix.length >= 2) {
        return matrix;
      }
    } catch {
      // Fallback to text-based parsers below.
    }
  }

  let rawContent = "";

  try {
    rawContent = await readPropietarioFileContent(file);
  } catch (error) {
    if (shouldTryXlsx) {
      const matrix = await readSpreadsheetMatrixWithXlsx(buffer);

      if (matrix.length >= 2) {
        return matrix;
      }
    }

    throw error instanceof Error
      ? error
      : new Error("No se pudo leer el archivo Excel.");
  }

  const prepared = preparePropietarioUploadContent(file.name, rawContent);

  if ("error" in prepared) {
    if (shouldTryXlsx) {
      try {
        const matrix = await readSpreadsheetMatrixWithXlsx(buffer);

        if (matrix.length >= 2) {
          return matrix;
        }
      } catch {
        throw new Error(prepared.error);
      }
    }

    throw new Error(prepared.error);
  }

  return csvContentToMatrix(prepared.csvContent);
}

export async function readPagoPropietarioBulkFile(file: File) {
  const matrix = await readSpreadsheetMatrixFromFile(file);

  return parsePagoPropietarioBulkMatrix(matrix);
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
