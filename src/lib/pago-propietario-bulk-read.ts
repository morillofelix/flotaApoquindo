import * as XLSX from "xlsx";
import {
  buildMatrixFromCsvContent,
  describeBulkMatrixHeaders,
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

function isSpreadsheetFileName(fileName: string) {
  return /\.(xls|xlsx)$/i.test(fileName);
}

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

function formatSheetCell(cell: XLSX.CellObject | undefined) {
  if (!cell) {
    return "";
  }

  if (typeof cell.w === "string" && cell.w.trim()) {
    return cell.w.trim();
  }

  if (cell.v === null || cell.v === undefined) {
    return "";
  }

  return String(cell.v).trim();
}

function readSheetMatrixFromRange(sheet: XLSX.WorkSheet) {
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
      const cell = sheet[cellAddress] as XLSX.CellObject | undefined;

      row.push(formatSheetCell(cell));
    }

    matrix.push(row);
  }

  return normalizeBulkMatrix(matrix);
}

function readSheetMatrixFromJson(sheet: XLSX.WorkSheet) {
  const jsonMatrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  return normalizeBulkMatrix(
    jsonMatrix.map((row) => (row ?? []).map((cell) => String(cell ?? "").trim())),
  );
}

function scoreMatrixShape(matrix: string[][]) {
  let score = matrix.length;

  for (const row of matrix.slice(0, 20)) {
    for (const cell of row) {
      const lower = cell.toLowerCase();

      if (lower.includes("facturar") || lower.includes("factura")) {
        score += 200;
      }

      if (lower.includes("preliq")) {
        score += 80;
      }

      if (lower.includes("periodo")) {
        score += 40;
      }
    }
  }

  return score;
}

function readBinarySpreadsheetMatrix(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    dense: false,
    codepage: 1252,
  });

  let bestMatrix: string[][] = [];
  let bestScore = -1;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      continue;
    }

    const candidates = [
      readSheetMatrixFromRange(sheet),
      readSheetMatrixFromJson(sheet),
    ];

    for (const matrix of candidates) {
      if (hasPagoBulkHeaderMatch(matrix)) {
        return matrix;
      }

      const score = scoreMatrixShape(matrix);

      if (score > bestScore) {
        bestScore = score;
        bestMatrix = matrix;
      }
    }
  }

  return bestMatrix;
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

function buildPagoBulkReadFailureMessage(
  bytes: Uint8Array,
  previewMatrix: string[][],
) {
  const headerPreview = describeBulkMatrixHeaders(previewMatrix);

  if (previewMatrix.length > 0) {
    return `No se detectó la columna del móvil junto a "Total Facturar". Encabezados leídos: ${headerPreview}.`;
  }

  const latin = new TextDecoder("latin1").decode(bytes).toLowerCase();
  const utf16 = new TextDecoder("utf-16le").decode(bytes).toLowerCase();
  const haystack = `${latin}\n${utf16}`;
  const hasTotalFacturar =
    haystack.includes("total facturar") || haystack.includes("total factura");

  if (!hasTotalFacturar) {
    return 'No se encontró la columna "Total Facturar" dentro del archivo. Confirma que estás subiendo Preliquidaciones exportado desde Access.';
  }

  return 'El archivo parece ser Excel binario de Access. Copia Preliquidaciones.xls a la carpeta fixtures/ del proyecto para ajustar el lector.';
}

export function readPagoPropietarioBulkFromBuffer(
  fileName: string,
  buffer: ArrayBuffer,
): PagoBulkParseResult {
  const bytes = new Uint8Array(buffer);
  let previewMatrix: string[][] = [];

  if (isSpreadsheetFileName(fileName) || isBinarySpreadsheetBytes(bytes)) {
    previewMatrix = readBinarySpreadsheetMatrix(buffer);

    if (hasPagoBulkHeaderMatch(previewMatrix)) {
      return parsePagoPropietarioBulkMatrix(previewMatrix);
    }
  }

  for (const rawContent of collectTextVariants(bytes)) {
    const parsed = tryParseAccessTextSpreadsheet(fileName, rawContent);

    if (parsed) {
      return parsed;
    }
  }

  if (!previewMatrix.length && (isSpreadsheetFileName(fileName) || isBinarySpreadsheetBytes(bytes))) {
    previewMatrix = readBinarySpreadsheetMatrix(buffer);
  }

  throw new Error(
    `No se pudo leer Preliquidaciones. ${buildPagoBulkReadFailureMessage(bytes, previewMatrix)}`,
  );
}

export async function readPagoPropietarioBulkFile(file: File) {
  const buffer = await file.arrayBuffer();

  return readPagoPropietarioBulkFromBuffer(file.name, buffer);
}
