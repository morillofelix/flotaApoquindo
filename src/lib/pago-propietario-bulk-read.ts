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

const EMBEDDED_MARKERS = [
  "<?xml",
  "<html",
  "<table",
  "office:spreadsheet",
  "schemas-microsoft-com:office:spreadsheet",
];

function extractEmbeddedSpreadsheetMarkup(bytes: Uint8Array) {
  const slices: string[] = [];
  const seen = new Set<string>();
  const decoders = [
    () => new TextDecoder("utf-16le").decode(bytes),
    () => new TextDecoder("utf-8").decode(bytes),
    () => new TextDecoder("latin1").decode(bytes),
  ];

  for (const decode of decoders) {
    let text = "";

    try {
      text = decode();
    } catch {
      continue;
    }

    const lower = text.toLowerCase();

    for (const marker of EMBEDDED_MARKERS) {
      const index = lower.indexOf(marker);

      if (index === -1 || seen.has(`${marker}:${index}`)) {
        continue;
      }

      seen.add(`${marker}:${index}`);
      slices.push(text.slice(index));
    }
  }

  return slices;
}

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

  for (const slice of extractEmbeddedSpreadsheetMarkup(bytes)) {
    addVariant(slice);
  }

  try {
    addVariant(readSpreadsheetTextContent(bytes));
  } catch {
    // Binary OLE; embedded slices above should cover it.
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

function buildPagoBulkReadFailureMessage(bytes: Uint8Array) {
  const latin = new TextDecoder("latin1").decode(bytes).toLowerCase();
  const utf16 = new TextDecoder("utf-16le").decode(bytes).toLowerCase();
  const haystack = `${latin}\n${utf16}`;
  const hasTotalFacturar =
    haystack.includes("total facturar") || haystack.includes("total factura");
  const hasSpreadsheetMarkup =
    haystack.includes("<table") ||
    haystack.includes("office:spreadsheet") ||
    haystack.includes("schemas-microsoft-com:office:spreadsheet");

  if (hasTotalFacturar && hasSpreadsheetMarkup) {
    return 'El archivo contiene "Total Facturar", pero Access lo exportó en un formato que no se pudo armar. Guarda el archivo en la carpeta del proyecto o reexpórtalo desde Access como "Excel 97-2003 (.xls)".';
  }

  if (!hasTotalFacturar) {
    return 'No se encontró la columna "Total Facturar" dentro del archivo. Confirma que estás subiendo Preliquidaciones exportado desde Access.';
  }

  return 'Verifica que el archivo tenga una columna sin título con el móvil y la columna "Total Facturar".';
}

export function readPagoPropietarioBulkFromBuffer(
  fileName: string,
  buffer: ArrayBuffer,
): PagoBulkParseResult {
  const bytes = new Uint8Array(buffer);

  for (const rawContent of collectTextVariants(bytes)) {
    const parsed = tryParseAccessTextSpreadsheet(fileName, rawContent);

    if (parsed) {
      return parsed;
    }
  }

  if (isBinarySpreadsheetBytes(bytes)) {
    const matrix = readBinarySpreadsheetMatrix(buffer);

    if (hasPagoBulkHeaderMatch(matrix)) {
      return parsePagoPropietarioBulkMatrix(matrix);
    }
  }

  throw new Error(
    `No se pudo leer Preliquidaciones. ${buildPagoBulkReadFailureMessage(bytes)}`,
  );
}

export async function readPagoPropietarioBulkFile(file: File) {
  const buffer = await file.arrayBuffer();

  return readPagoPropietarioBulkFromBuffer(file.name, buffer);
}
