import * as XLSX from "xlsx";
import {
  buildMatrixFromCsvContent,
  hasPagoBulkHeaderMatch,
  normalizeBulkMatrix,
  parsePagoPropietarioBulkMatrix,
  type PagoBulkParseResult,
} from "@/lib/pago-propietario-bulk";
import {
  isBinarySpreadsheetBytes,
  parseSpreadsheetContentToMatrix,
  preparePropietarioUploadContent,
  readSpreadsheetTextContent,
} from "@/lib/propietarios";

function collectTextVariants(bytes: Uint8Array) {
  const variants: string[] = [];
  const seen = new Set<string>();

  const addVariant = (value: string) => {
    const normalized = value.replace(/^\uFEFF/, "");

    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    variants.push(normalized);
  };

  try {
    addVariant(readSpreadsheetTextContent(bytes));
  } catch {
    // Binary or unreadable as text; handled elsewhere.
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    addVariant(new TextDecoder("utf-16le").decode(bytes));
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    addVariant(new TextDecoder("utf-16be").decode(bytes));
  }

  addVariant(new TextDecoder("utf-16le").decode(bytes));
  addVariant(new TextDecoder("utf-8").decode(bytes));
  addVariant(new TextDecoder("latin1").decode(bytes));

  return variants;
}

function readSheetMatrixFromXlsx(sheet: XLSX.WorkSheet) {
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
        (cell?.v === null || cell?.v === undefined ? "" : cell.v);

      row.push(String(value ?? "").trim());
    }

    matrix.push(row);
  }

  return normalizeBulkMatrix(matrix);
}

function readBinarySpreadsheetMatrix(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    dense: false,
  });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      continue;
    }

    const matrix = readSheetMatrixFromXlsx(sheet);

    if (hasPagoBulkHeaderMatch(matrix)) {
      return matrix;
    }
  }

  return [] as string[][];
}

function tryParseAccessTextSpreadsheet(
  fileName: string,
  rawContent: string,
): PagoBulkParseResult | null {
  const candidates: string[][][] = [];
  const parsedMatrix = parseSpreadsheetContentToMatrix(rawContent);

  if (parsedMatrix?.length) {
    candidates.push(parsedMatrix);
  }

  const prepared = preparePropietarioUploadContent(fileName, rawContent);

  if (!("error" in prepared)) {
    candidates.push(buildMatrixFromCsvContent(prepared.csvContent));
  }

  for (const candidate of candidates) {
    const matrix = normalizeBulkMatrix(candidate);

    if (!hasPagoBulkHeaderMatch(matrix)) {
      continue;
    }

    return parsePagoPropietarioBulkMatrix(matrix);
  }

  return null;
}

export function readPagoPropietarioBulkFromBuffer(
  fileName: string,
  buffer: ArrayBuffer,
): PagoBulkParseResult {
  const bytes = new Uint8Array(buffer);

  if (isBinarySpreadsheetBytes(bytes)) {
    const matrix = readBinarySpreadsheetMatrix(buffer);

    if (hasPagoBulkHeaderMatch(matrix)) {
      return parsePagoPropietarioBulkMatrix(matrix);
    }
  }

  for (const rawContent of collectTextVariants(bytes)) {
    const parsed = tryParseAccessTextSpreadsheet(fileName, rawContent);

    if (parsed) {
      return parsed;
    }
  }

  if (isBinarySpreadsheetBytes(bytes)) {
    const matrix = readBinarySpreadsheetMatrix(buffer);
    const parsed = parsePagoPropietarioBulkMatrix(matrix);

    if (parsed.rows.length > 0) {
      return parsed;
    }
  }

  throw new Error(
    'No se pudo leer Preliquidaciones. Verifica que el archivo tenga una columna sin título con el móvil y la columna "Total Facturar".',
  );
}

export async function readPagoPropietarioBulkFile(file: File) {
  const buffer = await file.arrayBuffer();

  return readPagoPropietarioBulkFromBuffer(file.name, buffer);
}
