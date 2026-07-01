import * as XLSX from "xlsx";
import {
  buildMatrixFromCsvContent,
  describeBulkMatrixHeaders,
  hasPagoBulkHeaderMatch,
  matrixLooksLikeGarbage,
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
  "<workbook",
  "office:spreadsheet",
  "schemas-microsoft-com:office:spreadsheet",
];

function isLegacyXlsFileName(fileName: string) {
  return /\.xls$/i.test(fileName);
}

function isModernXlsxFileName(fileName: string) {
  return /\.xlsx$/i.test(fileName);
}

function extractMarkupAroundTotalFacturar(text: string) {
  const lower = text.toLowerCase();
  const facturarIndex = lower.indexOf("total facturar");

  if (facturarIndex === -1) {
    return null;
  }

  const before = text.slice(0, facturarIndex);
  const anchors = [
    before.lastIndexOf("<table"),
    before.lastIndexOf("<?xml"),
    before.lastIndexOf("<html"),
    before.lastIndexOf("<workbook"),
  ];
  const start = Math.max(...anchors);

  if (start >= 0) {
    return text.slice(start);
  }

  return text.slice(Math.max(0, facturarIndex - 80_000));
}

function extractEmbeddedSpreadsheetMarkup(bytes: Uint8Array) {
  const slices: string[] = [];
  const seen = new Set<string>();
  const decoders = [
    () => new TextDecoder("utf-16le").decode(bytes),
    () => new TextDecoder("utf-8").decode(bytes),
    () => new TextDecoder("latin1").decode(bytes),
  ];

  const addSlice = (value: string) => {
    const normalized = value.replace(/^\uFEFF/, "");

    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    slices.push(normalized);
  };

  for (const decode of decoders) {
    let text = "";

    try {
      text = decode();
    } catch {
      continue;
    }

    const aroundFacturar = extractMarkupAroundTotalFacturar(text);

    if (aroundFacturar) {
      addSlice(aroundFacturar);
    }

    const lower = text.toLowerCase();

    for (const marker of EMBEDDED_MARKERS) {
      const index = lower.indexOf(marker);

      if (index === -1 || seen.has(`${marker}:${index}`)) {
        continue;
      }

      seen.add(`${marker}:${index}`);
      addSlice(text.slice(index));
    }
  }

  return slices;
}

export function isExcelFramesetContainer(content: string) {
  const lower = content.toLowerCase();

  return (
    lower.includes("<frameset") &&
    (lower.includes("worksheetsource") ||
      lower.includes(".files/") ||
      lower.includes("sheet001.htm"))
  );
}

function extractWorksheetSourceHref(content: string) {
  const worksheetSourceMatch = content.match(
    /<x:WorksheetSource[^>]*href="([^"]+)"/i,
  );
  const frameMatch = content.match(/<frame[^>]*src="([^"]+\.htm)"/i);

  return worksheetSourceMatch?.[1] ?? frameMatch?.[1] ?? null;
}

function detectExcelFramesetHref(bytes: Uint8Array) {
  for (const rawContent of collectTextVariants(bytes)) {
    if (!isExcelFramesetContainer(rawContent)) {
      continue;
    }

    return (
      extractWorksheetSourceHref(rawContent) ??
      "Preliquidaciones.files/sheet001.htm"
    );
  }

  return null;
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
    // Access .xls OLE: usar extractores embebidos arriba.
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
      if (matrixLooksLikeGarbage(matrix)) {
        continue;
      }

      if (hasPagoBulkHeaderMatch(matrix)) {
        return matrix;
      }

      let score = matrix.length;

      for (const row of matrix.slice(0, 20)) {
        for (const cell of row) {
          const lower = cell.toLowerCase();

          if (lower.includes("facturar")) {
            score += 200;
          }
        }
      }

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

function tryReadWithBinaryParser(buffer: ArrayBuffer) {
  const matrix = readBinarySpreadsheetMatrix(buffer);

  if (matrixLooksLikeGarbage(matrix) || !hasPagoBulkHeaderMatch(matrix)) {
    return null;
  }

  return parsePagoPropietarioBulkMatrix(matrix);
}

function buildPagoBulkReadFailureMessage(
  bytes: Uint8Array,
  previewMatrix: string[][],
) {
  if (previewMatrix.length > 0 && !matrixLooksLikeGarbage(previewMatrix)) {
    const headerPreview = describeBulkMatrixHeaders(previewMatrix);

    return `No se detectó la columna del móvil junto a "Total Facturar". Encabezados leídos: ${headerPreview}.`;
  }

  const latin = new TextDecoder("latin1").decode(bytes).toLowerCase();
  const utf16 = new TextDecoder("utf-16le").decode(bytes).toLowerCase();
  const haystack = `${latin}\n${utf16}`;
  const hasTotalFacturar =
    haystack.includes("total facturar") || haystack.includes("total factura");

  if (hasTotalFacturar) {
    return 'El archivo contiene "Total Facturar" pero Access lo exportó en un formato que aún no se pudo abrir. Copia Preliquidaciones.xls en la carpeta fixtures/ del proyecto para ajustarlo.';
  }

  return 'No se encontró "Total Facturar" en el archivo. Confirma que subes Preliquidaciones exportado desde Access.';
}

export type PagoBulkUploadFile = {
  fileName: string;
  buffer: ArrayBuffer;
};

type ReadPagoBulkOptions = {
  allowFramesetContainer?: boolean;
};

function normalizeUploadPath(fileName: string) {
  return fileName.replace(/\\/g, "/").toLowerCase();
}

function isIrrelevantBulkCompanion(fileName: string) {
  const lower = normalizeUploadPath(fileName);

  return (
    lower.includes("tabstrip.htm") ||
    lower.endsWith("/stylesheet.css") ||
    lower.endsWith("filelist.xml") ||
    lower.endsWith("/editdata.mso") ||
    lower.endsWith("/oledata.mso")
  );
}

function isRelevantBulkUploadFile(fileName: string) {
  const lower = normalizeUploadPath(fileName);

  if (isIrrelevantBulkCompanion(fileName)) {
    return false;
  }

  return /\.(xlsx?|htm|html|csv|txt|slk)$/i.test(lower);
}

function rankBulkUploadFile(fileName: string) {
  const lower = normalizeUploadPath(fileName);
  let score = 0;

  if (/sheet\d+\.htm$/i.test(lower)) {
    score += 800;
  }

  if (lower.includes(".files/")) {
    score += 300;
  }

  if (lower.endsWith(".htm") || lower.endsWith(".html")) {
    score += 250;
  }

  if (lower.endsWith(".xlsx")) {
    score += 200;
  }

  if (lower.endsWith(".xls")) {
    score += 100;
  }

  if (lower.includes("preliquidaciones")) {
    score += 50;
  }

  return score;
}

function scoreBulkParseResult(result: PagoBulkParseResult) {
  return result.rows.length * 1_000 - result.errors.length * 5;
}

function tryReadPagoPropietarioBulkFromBuffer(
  fileName: string,
  buffer: ArrayBuffer,
  options: ReadPagoBulkOptions = {},
): PagoBulkParseResult | null {
  const bytes = new Uint8Array(buffer);
  const framesetHref = detectExcelFramesetHref(bytes);

  for (const rawContent of collectTextVariants(bytes)) {
    if (isExcelFramesetContainer(rawContent)) {
      continue;
    }

    const parsed = tryParseAccessTextSpreadsheet(fileName, rawContent);

    if (parsed) {
      return parsed;
    }
  }

  if (framesetHref && !options.allowFramesetContainer) {
    return null;
  }

  if (isModernXlsxFileName(fileName)) {
    const parsed = tryReadWithBinaryParser(buffer);

    if (parsed) {
      return parsed;
    }
  }

  if (isLegacyXlsFileName(fileName) && isBinarySpreadsheetBytes(bytes)) {
    const parsed = tryReadWithBinaryParser(buffer);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function readPagoPropietarioBulkFromUploads(
  files: PagoBulkUploadFile[],
): PagoBulkParseResult {
  const relevantFiles = files.filter((file) =>
    isRelevantBulkUploadFile(file.fileName),
  );

  if (relevantFiles.length === 0) {
    throw new Error(
      "No se encontró un archivo de Preliquidaciones válido en la carga.",
    );
  }

  const sortedFiles = [...relevantFiles].sort(
    (left, right) =>
      rankBulkUploadFile(right.fileName) - rankBulkUploadFile(left.fileName),
  );

  let bestResult: PagoBulkParseResult | null = null;
  let bestScore = -1;

  for (const file of sortedFiles) {
    const parsed = tryReadPagoPropietarioBulkFromBuffer(
      file.fileName,
      file.buffer,
    );

    if (!parsed) {
      continue;
    }

    const score = scoreBulkParseResult(parsed);

    if (score > bestScore) {
      bestScore = score;
      bestResult = parsed;
    }
  }

  if (bestResult && bestResult.rows.length > 0) {
    return bestResult;
  }

  const onlyFrameset =
    relevantFiles.length === 1 &&
    relevantFiles[0] !== undefined &&
    detectExcelFramesetHref(new Uint8Array(relevantFiles[0].buffer));

  if (onlyFrameset) {
    throw new Error(
      "Preliquidaciones.xls no trae los datos dentro del archivo. Vuelve a subirlo y, cuando el navegador lo pida, selecciona la carpeta de descarga (por ejemplo Descargas).",
    );
  }

  const previewFile = sortedFiles[0];

  if (!previewFile) {
    throw new Error(
      "No se pudo leer Preliquidaciones. No se encontró una hoja válida en la carga.",
    );
  }

  const previewBytes = new Uint8Array(previewFile.buffer);
  let previewMatrix: string[][] = [];

  if (
    isModernXlsxFileName(previewFile.fileName) ||
    isBinarySpreadsheetBytes(previewBytes)
  ) {
    previewMatrix = readBinarySpreadsheetMatrix(previewFile.buffer);
  }

  throw new Error(
    `No se pudo leer Preliquidaciones. ${buildPagoBulkReadFailureMessage(previewBytes, previewMatrix)}`,
  );
}

export function readPagoPropietarioBulkFromBuffer(
  fileName: string,
  buffer: ArrayBuffer,
): PagoBulkParseResult {
  const parsed = tryReadPagoPropietarioBulkFromBuffer(fileName, buffer);

  if (parsed) {
    return parsed;
  }

  return readPagoPropietarioBulkFromUploads([{ fileName, buffer }]);
}

export async function readPagoPropietarioBulkFile(file: File) {
  const buffer = await file.arrayBuffer();

  return readPagoPropietarioBulkFromBuffer(file.name, buffer);
}
