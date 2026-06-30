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
  parseSpreadsheetContentToMatrix,
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

  if (
    normalized.includes("pagar") &&
    !normalized.includes("facturar")
  ) {
    return false;
  }

  return (
    normalized === "total_facturar" ||
    normalized === "total_a_facturar" ||
    normalized.includes("total_facturar") ||
    (normalized.includes("total") && normalized.includes("facturar"))
  );
}

function isBlankHeader(value: string) {
  return !value.trim();
}

function countMobileValuesInColumn(
  matrix: string[][],
  columnIndex: number,
  headerIndex: number,
) {
  let count = 0;

  for (
    let rowIndex = headerIndex + 1;
    rowIndex < Math.min(matrix.length, headerIndex + 40);
    rowIndex += 1
  ) {
    const rawValue = (matrix[rowIndex]?.[columnIndex] ?? "").trim();

    if (normalizeVehicleNumber(rawValue)) {
      count += 1;
    }
  }

  return count;
}

function findMobileColumnIndex(
  rawHeaders: string[],
  amountIndex: number,
  matrix: string[][],
  headerIndex: number,
) {
  const candidates: number[] = [];

  for (
    let columnIndex = 0;
    columnIndex < (amountIndex >= 0 ? amountIndex : rawHeaders.length);
    columnIndex += 1
  ) {
    if (isBlankHeader(rawHeaders[columnIndex] ?? "")) {
      candidates.push(columnIndex);
    }
  }

  let bestIndex = -1;
  let bestScore = 0;

  for (const columnIndex of candidates) {
    const score = countMobileValuesInColumn(matrix, columnIndex, headerIndex);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = columnIndex;
    }
  }

  if (bestIndex !== -1 && bestScore > 0) {
    return bestIndex;
  }

  if (candidates.length > 0) {
    return candidates[0] ?? -1;
  }

  return amountIndex > 0 ? 0 : -1;
}

function padRow(row: string[], minLength: number) {
  const paddedRow = [...row];

  while (paddedRow.length < minLength) {
    paddedRow.push("");
  }

  return paddedRow;
}

function findPagoBulkHeaderInMatrix(matrix: string[][]): PagoBulkHeaderMatch | null {
  const maxScan = Math.min(matrix.length, 120);
  const maxColumns = matrix.reduce(
    (max, row) => Math.max(max, row.length),
    0,
  );

  for (let headerIndex = 0; headerIndex < maxScan; headerIndex += 1) {
    const rawHeaders = padRow(matrix[headerIndex] ?? [], maxColumns);

    for (let columnIndex = 0; columnIndex < rawHeaders.length; columnIndex += 1) {
      const rawHeader = rawHeaders[columnIndex] ?? "";
      const header = normalizeHeader(rawHeader);

      if (!isTotalFacturarHeader(header, rawHeader)) {
        continue;
      }

      const mobileIndex = findMobileColumnIndex(
        rawHeaders,
        columnIndex,
        matrix,
        headerIndex,
      );

      if (mobileIndex === -1) {
        continue;
      }

      return {
        headerIndex,
        mobileIndex,
        amountIndex: columnIndex,
      };
    }
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
        'No se encontró la fila de encabezados con una columna sin título para el móvil y la columna "Total Facturar".',
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

function padMatrix(matrix: string[][]) {
  const maxColumns = matrix.reduce(
    (max, row) => Math.max(max, row.length),
    0,
  );

  return matrix.map((row) => {
    const paddedRow = [...row];

    while (paddedRow.length < maxColumns) {
      paddedRow.push("");
    }

    return paddedRow;
  });
}

async function readSpreadsheetMatrixWithXlsx(buffer: ArrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    dense: false,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return [] as string[][];
  }

  const sheet = workbook.Sheets[sheetName];

  if (!sheet || !sheet["!ref"]) {
    return [] as string[][];
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const matrix: string[][] = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: string[] = [];

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const cellAddress = XLSX.utils.encode_cell({
        r: rowIndex,
        c: columnIndex,
      });
      const cell = sheet[cellAddress] as { v?: unknown; w?: string } | undefined;
      const value =
        cell?.w ??
        (cell?.v === null || cell?.v === undefined ? "" : String(cell.v));

      row.push(normalizeMatrixCell(value));
    }

    matrix.push(row);
  }

  return padMatrix(matrix);
}

function decodeSpreadsheetBytes(bytes: Uint8Array) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }

  const utf8Content = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");

  if (
    utf8Content.toLowerCase().includes("<table") ||
    utf8Content.toLowerCase().includes("office:spreadsheet")
  ) {
    return utf8Content;
  }

  return new TextDecoder("latin1").decode(bytes).replace(/^\uFEFF/, "");
}

function matrixHasReadableData(matrix: string[][]) {
  return matrix.some((row) => row.some((cell) => cell.trim().length > 0));
}

async function readSpreadsheetMatrixFromFile(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const textContent = decodeSpreadsheetBytes(bytes);
  const shouldTryXlsx =
    isSpreadsheetFile(file.name) ||
    looksLikeBinaryExcel(bytes) ||
    looksLikeXlsxArchive(bytes);

  const attempts: Array<() => Promise<string[][]> | string[][]> = [];

  if (shouldTryXlsx) {
    attempts.push(() => readSpreadsheetMatrixWithXlsx(buffer));
  }

  attempts.push(() => padMatrix(parseSpreadsheetContentToMatrix(textContent) ?? []));

  let bestMatrix: string[][] = [];
  let bestHeaderMatch: PagoBulkHeaderMatch | null = null;

  for (const attempt of attempts) {
    try {
      const matrix = padMatrix(
        (await attempt()).map((row) => row.map((cell) => normalizeMatrixCell(cell))),
      );
      const headerMatch = findPagoBulkHeaderInMatrix(matrix);

      if (headerMatch) {
        return matrix;
      }

      if (matrixHasReadableData(matrix) && matrix.length > bestMatrix.length) {
        bestMatrix = matrix;
      }
    } catch {
      continue;
    }
  }

  if (bestMatrix.length >= 2) {
    bestHeaderMatch = findPagoBulkHeaderInMatrix(bestMatrix);

    if (bestHeaderMatch) {
      return bestMatrix;
    }
  }

  throw new Error(
    'No se pudo leer Preliquidaciones. Busca una columna sin título con el móvil y la columna "Total Facturar" (no usa "Total a pagar").',
  );
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
