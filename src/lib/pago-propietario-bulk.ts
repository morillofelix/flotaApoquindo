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
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ")
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

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return String(value).replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ").trim();
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

function isTotalFacturarHeader(header: string, rawHeader = "") {
  const normalized = normalizeHeader(rawHeader || header);

  if (!normalized) {
    return false;
  }

  if (normalized.includes("pagar") && !normalized.includes("factur")) {
    return false;
  }

  const excludedFragments = [
    "produccion",
    "vales",
    "efectivo",
    "tarjeta",
    "cristales",
    "peajes",
    "adicional",
    "gasto",
  ];

  if (
    excludedFragments.some((fragment) => normalized.includes(fragment)) &&
    !normalized.includes("factur")
  ) {
    return false;
  }

  return (
    normalized.includes("facturar") ||
    normalized.includes("total_factura") ||
    normalized.endsWith("_factura") ||
    normalized === "factura"
  );
}

function isMobileColumnHeader(value: string) {
  const normalized = normalizeHeader(value);

  return (
    normalized.includes("movil") ||
    normalized.includes("conductor")
  );
}

function isPreliqHeader(value: string) {
  return normalizeHeader(value).includes("preliq");
}

function isBlankHeader(value: string) {
  return !normalizeHeader(value);
}

function isConductorHeader(value: string) {
  return normalizeHeader(value).includes("conductor");
}

function isPeriodoHeader(value: string) {
  const normalized = normalizeHeader(value);

  return normalized === "periodo" || normalized.includes("periodo");
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
  const searchLimit = amountIndex >= 0 ? amountIndex : rawHeaders.length;
  const namedMobileIndices: number[] = [];
  const blankIndices: number[] = [];

  for (let columnIndex = 0; columnIndex < searchLimit; columnIndex += 1) {
    const header = rawHeaders[columnIndex] ?? "";

    if (isMobileColumnHeader(header)) {
      namedMobileIndices.push(columnIndex);
    }

    if (isBlankHeader(header)) {
      blankIndices.push(columnIndex);
    }
  }

  let bestIndex = -1;
  let bestScore = 0;

  for (const columnIndex of namedMobileIndices) {
    const score = countMobileValuesInColumn(matrix, columnIndex, headerIndex);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = columnIndex;
    }
  }

  if (bestIndex !== -1 && bestScore > 0) {
    return bestIndex;
  }

  const hasPreliquidacionesLayout = rawHeaders.some((header) => isPreliqHeader(header));

  if (hasPreliquidacionesLayout && 3 < searchLimit) {
    const scoreAtD = countMobileValuesInColumn(matrix, 3, headerIndex);

    if (scoreAtD > 0) {
      return 3;
    }
  }

  bestIndex = -1;
  bestScore = 0;

  for (const columnIndex of blankIndices) {
    const score = countMobileValuesInColumn(matrix, columnIndex, headerIndex);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = columnIndex;
    }
  }

  if (bestIndex !== -1 && bestScore > 0) {
    return bestIndex;
  }

  const conductorIndex = rawHeaders.findIndex((header) => isConductorHeader(header));

  if (conductorIndex >= 0 && conductorIndex < amountIndex) {
    const conductorScore = countMobileValuesInColumn(
      matrix,
      conductorIndex,
      headerIndex,
    );

    if (conductorScore > 0) {
      return conductorIndex;
    }

    if (conductorIndex > 0) {
      return conductorIndex - 1;
    }
  }

  const periodoIndex = rawHeaders.findIndex((header) => isPeriodoHeader(header));

  if (periodoIndex >= 0 && periodoIndex + 1 < amountIndex) {
    return periodoIndex + 1;
  }

  let dataBestIndex = -1;
  let dataBestScore = 0;

  for (let columnIndex = 0; columnIndex < searchLimit; columnIndex += 1) {
    const score = countMobileValuesInColumn(matrix, columnIndex, headerIndex);

    if (score > dataBestScore) {
      dataBestScore = score;
      dataBestIndex = columnIndex;
    }
  }

  if (dataBestIndex !== -1 && dataBestScore > 0) {
    return dataBestIndex;
  }

  if (blankIndices.length > 0) {
    return blankIndices[0] ?? -1;
  }

  if (hasPreliquidacionesLayout && 3 < searchLimit) {
    return 3;
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
        'No se encontró la fila de encabezados con la columna del móvil (columna D / Móviles o Conductor) y la columna "Total Facturar".',
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

export function describeBulkMatrixHeaders(matrix: string[][]): string {
  if (!matrix.length) {
    return "el archivo no generó filas legibles";
  }

  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 40); rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const hasFacturar = row.some((cell) =>
      cell.toLowerCase().includes("factur"),
    );

    if (!hasFacturar) {
      continue;
    }

    return `fila ${rowIndex + 1}: ${row
      .map((cell, columnIndex) =>
        cell.trim() ? `"${cell.trim()}"` : `[vacía col ${columnIndex + 1}]`,
      )
      .join(", ")}`;
  }

  const firstVisibleRow = matrix.find((row) => row.some((cell) => cell.trim()));

  if (!firstVisibleRow) {
    return "sin encabezados legibles";
  }

  return `primeras columnas: ${firstVisibleRow
    .map((cell) => cell.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(", ")}`;
}

export function hasPagoBulkHeaderMatch(matrix: string[][]): boolean {
  return findPagoBulkHeaderInMatrix(matrix) !== null;
}

export function buildMatrixFromCsvContent(content: string): string[][] {
  return csvContentToMatrix(content);
}

export function normalizeBulkMatrix(matrix: string[][]): string[][] {
  return padMatrix(matrix.map((row) => row.map((cell) => normalizeMatrixCell(cell))));
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
