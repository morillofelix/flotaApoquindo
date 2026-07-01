import {
  displayVehicleNumber,
  formatFileSize,
  normalizeVehicleNumber,
  parseSpreadsheetContentToMatrix,
  looksLikeAccessTextSpreadsheet,
  readSpreadsheetTextContent,
  isBinarySpreadsheetBytes,
  prepareDriverOwnerUploadContent,
  readDriverOwnerFileContent,
} from "@/lib/driver-owners";
import {
  formatBankRutForDisplay,
  formatCompanyRutForDisplay,
  formatMovilForTemplateExport,
  isPropietarioTemplateHeaderRow,
  normalizeDepositAccountType,
  normalizeTemplateHeader,
  PROPIETARIO_TEMPLATE_HEADERS,
} from "@/lib/propietarios-template";
import * as XLSX from "xlsx";

export {
  displayVehicleNumber,
  formatFileSize,
  normalizeVehicleNumber,
  parseSpreadsheetContentToMatrix,
  looksLikeAccessTextSpreadsheet,
  readSpreadsheetTextContent,
  isBinarySpreadsheetBytes,
  prepareDriverOwnerUploadContent as preparePropietarioUploadContent,
  readDriverOwnerFileContent as readPropietarioFileContent,
};

export type PropietarioConfig = {
  id?: string;
  importKey?: string;
  vehicleNumber: string;
  fullName: string;
  firstName: string;
  lastName: string;
  secondLastName: string;
  rut: string;
  email: string;
  landlinePhone: string;
  mobilePhone: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  bankName: string;
  bankAccount: string;
  accountHolder: string;
  titularRut: string;
  titularEmail: string;
  titularBankName: string;
  titularBankAccount: string;
  bankBic: string;
  paymentMethod: string;
  paymentDay: string;
  notes: string;
  branchOffice: string;
  area: string;
  costCenter: string;
  accountingAccount: string;
  isVip: boolean;
  gender: string;
  recordStatus: string;
  licenseExpiryDate: string;
  birthDate: string;
  incorporationDate: string;
  deactivationDate: string;
  emergencyContactName: string;
  emergencyContactEmail: string;
  emergencyContactPhone: string;
  isActive: boolean;
  inactiveReason: string;
  activationReason: string;
};

export type ParsedPropietarioRow = Omit<PropietarioConfig, "id" | "importKey"> & {
  rowNumber: number;
  importKey: string;
};

const headerAliases: Record<string, string> = {
  activo: "catalogActive",
  nombre: "fullName",
  name: "fullName",
  propietario: "fullName",
  apellido: "lastName",
  apellido_1: "lastName",
  apellido1: "lastName",
  apellido_2: "secondLastName",
  apellido2: "secondLastName",
  rut: "rut",
  rut_id: "rut",
  "rut_/_id": "rut",
  rut_propietario: "rut",
  rut_: "rut",
  razon_social: "fullName",
  cta_deposito: "paymentMethod",
  rut_banco: "titularRut",
  nombre_cuenta_bancaria: "accountHolder",
  codigo_banco: "bankBic",
  nombre_banco: "bankName",
  nro_cta_banco: "bankAccount",
  nro_cta: "bankAccount",
  nif: "rut",
  dni: "rut",
  correo: "email",
  email: "email",
  correo_propietario: "email",
  telefono_fijo: "landlinePhone",
  telefono: "landlinePhone",
  telefono_movil: "mobilePhone",
  movil: "mobilePhone",
  mobile: "mobilePhone",
  direccion: "address",
  codigo_postal: "postalCode",
  cod_postal: "postalCode",
  cp: "postalCode",
  poblacion: "city",
  ciudad: "city",
  comuna: "city",
  provincia: "province",
  region: "province",
  banco_propietario: "bankName",
  banco_titular: "titularBankName",
  cuenta_propietario: "bankAccount",
  cuenta_titular: "titularBankAccount",
  cuenta_bancaria: "bankAccount",
  num_cuenta: "bankAccount",
  iban: "bankAccount",
  titular: "accountHolder",
  titular_cuenta: "accountHolder",
  rut_titular: "titularRut",
  correo_titular: "titularEmail",
  bic: "bankBic",
  swift: "bankBic",
  forma_de_pago: "paymentMethod",
  forma_pago: "paymentMethod",
  medio_de_pago: "paymentMethod",
  dia_de_pago: "paymentDay",
  dia_pago: "paymentDay",
  observaciones: "notes",
  notas: "notes",
  sucursal: "branchOffice",
  area: "area",
  centro_de_costo: "costCenter",
  centro_costo: "costCenter",
  cuenta_contable: "accountingAccount",
  telefono_propietario: "landlinePhone",
  telefono_fijo_propietario: "landlinePhone",
  telefono_movil_propietario: "mobilePhone",
  direccion_propietario: "address",
  comuna_propietario: "city",
  region_propietario: "province",
  vip: "isVip",
  genero: "gender",
  fecha_vencimiento_carnet: "licenseExpiryDate",
  fecha_vencimiento_cedula: "licenseExpiryDate",
  fecha_nacimiento: "birthDate",
  fecha_alta: "incorporationDate",
  fecha_incorporacion: "incorporationDate",
  fecha_de_suscripcion: "incorporationDate",
  fecha_suscripcion: "incorporationDate",
  fecha_baja: "deactivationDate",
  numero_de_movil: "vehicleNumber",
  numero_movil: "vehicleNumber",
  n_movil: "vehicleNumber",
  nro_de_movil: "vehicleNumber",
  nombre_contacto_emergencia: "emergencyContactName",
  correo_contacto_emergencia: "emergencyContactEmail",
  telefono_contacto_emergencia: "emergencyContactPhone",
};

const propietarioTemplateHeaderAliases: Record<string, string> = {
  movil: "vehicleNumber",
  mobile: "vehicleNumber",
  numero_de_movil: "vehicleNumber",
  n_movil: "vehicleNumber",
  nro_de_movil: "vehicleNumber",
};

function mapPropietarioImportField(normalizedHeader: string) {
  return (
    propietarioTemplateHeaderAliases[normalizedHeader] ??
    headerAliases[normalizedHeader] ??
    null
  );
}

function normalizeHeader(value: string) {
  return normalizeTemplateHeader(value);
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

function mapImportHeaders(rawHeaders: string[]) {
  return rawHeaders.map((header) => mapPropietarioImportField(header) ?? null);
}

function findImportHeader(lines: string[]) {
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
      if (delimiter === ";" && !line.includes(";")) {
        continue;
      }

      if (delimiter === "," && !line.includes(",") && !line.includes('"')) {
        continue;
      }

      const mappedHeaders = mapImportHeaders(
        parseCsvLine(line, delimiter).map(normalizeHeader),
      );

      if (
        mappedHeaders.includes("fullName") &&
        mappedHeaders.includes("rut") &&
        (mappedHeaders.includes("vehicleNumber") ||
          mappedHeaders.includes("paymentMethod") ||
          mappedHeaders.includes("titularRut"))
      ) {
        return { headerIndex, delimiter, mappedHeaders };
      }

      if (
        mappedHeaders.includes("fullName") &&
        (mappedHeaders.includes("rut") ||
          mappedHeaders.includes("email") ||
          mappedHeaders.includes("bankName") ||
          mappedHeaders.includes("titularRut") ||
          mappedHeaders.includes("accountHolder"))
      ) {
        return { headerIndex, delimiter, mappedHeaders };
      }
    }
  }

  return null;
}

function rutToImportKey(rut: string) {
  const digits = rut.replace(/\D/g, "");

  if (digits.length < 7) {
    return "";
  }

  return `R${digits}`;
}

function resolveImportKey(
  rawVehicleNumber: string,
  rut: string,
  lineNumber: number,
  titularRut = "",
  bankAccount = "",
) {
  const rutKey = rutToImportKey(rut) || rutToImportKey(titularRut);
  const normalizedVehicleNumber = normalizeVehicleNumber(rawVehicleNumber);
  const normalizedBankAccount = bankAccount.trim();

  if (rutKey && normalizedVehicleNumber) {
    return `${rutKey}|${normalizedVehicleNumber}`;
  }

  if (rutKey && normalizedBankAccount) {
    return `${rutKey}|${normalizedBankAccount}`;
  }

  if (rutKey) {
    return `${rutKey}|${String(lineNumber).padStart(5, "0")}`;
  }

  if (normalizedVehicleNumber) {
    return normalizedVehicleNumber;
  }

  return `INACT${String(lineNumber).padStart(5, "0")}`;
}

function resolvePersistedImportKey(
  row: {
    importKey?: string;
    vehicleNumber: string;
    rut: string;
    titularRut?: string;
    rowNumber?: number;
  },
) {
  if (row.importKey) {
    return row.importKey;
  }

  const rutKey = rutToImportKey(row.rut) || rutToImportKey(row.titularRut ?? "");
  const normalizedVehicleNumber = normalizeVehicleNumber(row.vehicleNumber);

  if (rutKey && normalizedVehicleNumber) {
    return `${rutKey}|${normalizedVehicleNumber}`;
  }

  if (rutKey) {
    return rutKey;
  }

  if (normalizedVehicleNumber) {
    return normalizedVehicleNumber;
  }

  if (row.rowNumber) {
    return `INACT${String(row.rowNumber).padStart(5, "0")}`;
  }

  return `PROP${Date.now()}`;
}

function looksLikeRut(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  return (
    /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/.test(trimmed) ||
    /^\d{7,8}-[\dkK]$/.test(trimmed) ||
    (/^\d{1,2}-\d$/.test(trimmed) && trimmed.length <= 5)
  );
}

function isInvalidOwnerName(value: string) {
  return looksLikeRut(value);
}

function buildFullName(record: Record<string, string>) {
  let directName = (record.fullName ?? "").trim();

  if (isInvalidOwnerName(directName)) {
    directName = "";
  }

  if (directName) {
    return directName;
  }

  const parts = [
    (record.firstName ?? "").trim(),
    (record.lastName ?? "").trim(),
    (record.secondLastName ?? "").trim(),
  ].filter(Boolean);

  return parts.join(" ").trim();
}

function createEmptyPropietarioFields(): Omit<ParsedPropietarioRow, "rowNumber" | "importKey"> {
  return {
    vehicleNumber: "",
    fullName: "",
    firstName: "",
    lastName: "",
    secondLastName: "",
    rut: "",
    email: "",
    landlinePhone: "",
    mobilePhone: "",
    address: "",
    postalCode: "",
    city: "",
    province: "",
    bankName: "",
    bankAccount: "",
    accountHolder: "",
    titularRut: "",
    titularEmail: "",
    titularBankName: "",
    titularBankAccount: "",
    bankBic: "",
    paymentMethod: "",
    paymentDay: "",
    notes: "",
    branchOffice: "",
    area: "",
    costCenter: "",
    accountingAccount: "",
    isVip: false,
    gender: "",
    recordStatus: "V",
    licenseExpiryDate: "",
    birthDate: "",
    incorporationDate: "",
    deactivationDate: "",
    emergencyContactName: "",
    emergencyContactEmail: "",
    emergencyContactPhone: "",
    isActive: true,
    inactiveReason: "",
    activationReason: "",
  };
}

function buildParsedPropietarioRow(
  record: Record<string, string>,
  lineNumber: number,
  importedKeys: Set<string>,
  errors: string[],
): ParsedPropietarioRow | null {
  const fullName = buildFullName(record);
  const rut = formatCompanyRutForDisplay(record.rut ?? "");
  const titularRut = formatBankRutForDisplay(record.titularRut ?? "");
  const rawMobile = (record.vehicleNumber ?? record.mobilePhone ?? "").trim();
  const hasMobileNumber = Boolean(normalizeVehicleNumber(rawMobile));
  const importKey = resolveImportKey(
    rawMobile,
    rut,
    lineNumber,
    titularRut,
    record.bankAccount ?? "",
  );

  if (!fullName) {
    if (hasMobileNumber || rut || rawMobile.trim()) {
      errors.push(
        `Fila ${lineNumber}: sin razón social, fila omitida (móvil ${rawMobile || "sin número"}).`,
      );
    }

    return null;
  }

  if (importedKeys.has(importKey)) {
    errors.push(
      `Fila ${lineNumber}: la clave ${importKey} está repetida (mismo RUT y móvil).`,
    );
    return null;
  }

  importedKeys.add(importKey);

  return {
    rowNumber: lineNumber,
    importKey,
    ...createEmptyPropietarioFields(),
    vehicleNumber: hasMobileNumber ? normalizeVehicleNumber(rawMobile) : "",
    fullName,
    rut,
    bankName: (record.bankName ?? "").trim(),
    bankAccount: (record.bankAccount ?? "").trim(),
    accountHolder: (record.accountHolder ?? "").trim(),
    titularRut,
    bankBic: (record.bankBic ?? "").trim(),
    paymentMethod: normalizeDepositAccountType(record.paymentMethod ?? ""),
    email: (record.email ?? "").trim(),
    isActive: true,
  };
}

function mapMatrixRowByHeaders(headerRow: string[], values: string[]) {
  const record: Record<string, string> = {};
  const assignedFields = new Set<string>();

  headerRow.forEach((header, index) => {
    const normalizedHeader = normalizeHeader(header);

    if (!normalizedHeader) {
      return;
    }

    const field = mapPropietarioImportField(normalizedHeader);

    if (!field || assignedFields.has(field)) {
      return;
    }

    record[field] = String(values[index] ?? "").trim();
    assignedFields.add(field);
  });

  return record;
}

export function parsePropietariosMatrix(matrix: string[][]) {
  let headerIndex = -1;

  for (let index = 0; index < Math.min(matrix.length, 25); index += 1) {
    const row = (matrix[index] ?? []).map((cell) => String(cell ?? "").trim());

    if (isPropietarioTemplateHeaderRow(row)) {
      headerIndex = index;
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      rows: [] as ParsedPropietarioRow[],
      errors: [
        `No se encontró la fila de encabezados de la plantilla (${PROPIETARIO_TEMPLATE_HEADERS.join(", ")}).`,
      ],
    };
  }

  const rows: ParsedPropietarioRow[] = [];
  const errors: string[] = [];
  const importedKeys = new Set<string>();
  const headerRow = (matrix[headerIndex] ?? []).map((cell) =>
    String(cell ?? "").trim(),
  );

  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const values = (matrix[rowIndex] ?? []).map((cell) => String(cell ?? "").trim());

    const record = mapMatrixRowByHeaders(headerRow, values);
    const hasRowData =
      Boolean(record.fullName) ||
      Boolean(record.rut) ||
      Boolean(record.vehicleNumber) ||
      Boolean(record.bankAccount) ||
      Boolean(record.email);

    if (!hasRowData) {
      continue;
    }

    const parsedRow = buildParsedPropietarioRow(
      record,
      rowIndex + 1,
      importedKeys,
      errors,
    );

    if (parsedRow) {
      rows.push(parsedRow);
    }
  }

  if (!rows.length) {
    errors.unshift(
      "No se importó ninguna fila válida. Revisa que el archivo tenga Razón Social.",
    );
  }

  return { rows, errors };
}

export function parsePropietariosUploadBuffer(fileName: string, buffer: ArrayBuffer) {
  if (/\.xlsx?$/i.test(fileName) || isBinarySpreadsheetBytes(new Uint8Array(buffer))) {
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: false,
      raw: false,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];

    if (!sheet) {
      return {
        rows: [] as ParsedPropietarioRow[],
        errors: ["No se encontró una hoja válida en el archivo Excel."],
      };
    }

    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });

    return parsePropietariosMatrix(
      matrix.map((row) => (row ?? []).map((cell) => String(cell ?? ""))),
    );
  }

  const content = new TextDecoder("utf-8").decode(buffer);
  const matrix = parseSpreadsheetContentToMatrix(content);

  if (matrix?.length) {
    const parsedMatrix = parsePropietariosMatrix(matrix);

    if (parsedMatrix.rows.length > 0) {
      return parsedMatrix;
    }
  }

  return parsePropietariosCsv(content);
}

export function parsePropietariosCsv(content: string) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      rows: [] as ParsedPropietarioRow[],
      errors: ["El archivo debe incluir encabezados y al menos una fila."],
    };
  }

  const headerMatch = findImportHeader(lines);

  if (!headerMatch) {
    return {
      rows: [] as ParsedPropietarioRow[],
      errors: [
        `No se encontró la fila de encabezados de la plantilla (${PROPIETARIO_TEMPLATE_HEADERS.join(", ")}).`,
      ],
    };
  }

  const { headerIndex, delimiter, mappedHeaders } = headerMatch;
  const rows: ParsedPropietarioRow[] = [];
  const errors: string[] = [];
  const importedKeys = new Set<string>();

  for (let lineIndex = headerIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const values = parseCsvLine(lines[lineIndex] ?? "", delimiter);

    if (!values.some((value) => value.trim().length > 0)) {
      continue;
    }

    const record: Record<string, string> = {};

    mappedHeaders.forEach((field, fieldIndex) => {
      if (!field) {
        return;
      }

      record[field] = values[fieldIndex] ?? "";
    });

    const parsedRow = buildParsedPropietarioRow(
      record,
      lineIndex + 1,
      importedKeys,
      errors,
    );

    if (parsedRow) {
      rows.push(parsedRow);
    }
  }

  if (!rows.length) {
    errors.unshift(
      "No se importó ninguna fila válida. Revisa que el archivo tenga Razón Social.",
    );
  }

  return { rows, errors };
}

function parseOptionalDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toPropietario(value: {
  id: string;
  importKey: string;
  vehicleNumber: string;
  fullName: string;
  firstName: string;
  lastName: string;
  secondLastName: string;
  rut: string;
  email: string;
  landlinePhone: string;
  mobilePhone: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  bankName: string;
  bankAccount: string;
  accountHolder: string;
  titularRut: string;
  titularEmail: string;
  titularBankName: string;
  titularBankAccount: string;
  bankBic: string;
  paymentMethod: string;
  paymentDay: string;
  notes: string;
  branchOffice: string;
  area: string;
  costCenter: string;
  accountingAccount: string;
  isVip: boolean;
  gender: string;
  recordStatus: string;
  licenseExpiryDate: Date | null;
  birthDate: Date | null;
  incorporationDate: Date | null;
  deactivationDate: Date | null;
  emergencyContactName: string;
  emergencyContactEmail: string;
  emergencyContactPhone: string;
  isActive: boolean;
  inactiveReason: string;
  activationReason: string;
}): PropietarioConfig {
  const formatDate = (date: Date | null) =>
    date ? date.toISOString().split("T")[0] ?? "" : "";

  return {
    id: value.id,
    importKey: value.importKey,
    vehicleNumber: displayVehicleNumber(value.vehicleNumber),
    fullName: value.fullName,
    firstName: value.firstName,
    lastName: value.lastName,
    secondLastName: value.secondLastName,
    rut: value.rut,
    email: value.email,
    landlinePhone: value.landlinePhone,
    mobilePhone: value.mobilePhone,
    address: value.address,
    postalCode: value.postalCode,
    city: value.city,
    province: value.province,
    bankName: value.bankName,
    bankAccount: value.bankAccount,
    accountHolder: value.accountHolder,
    titularRut: value.titularRut,
    titularEmail: value.titularEmail,
    titularBankName: value.titularBankName,
    titularBankAccount: value.titularBankAccount,
    bankBic: value.bankBic,
    paymentMethod: value.paymentMethod,
    paymentDay: value.paymentDay,
    notes: value.notes,
    branchOffice: value.branchOffice,
    area: value.area,
    costCenter: value.costCenter,
    accountingAccount: value.accountingAccount,
    isVip: value.isVip,
    gender: value.gender,
    recordStatus: value.recordStatus,
    licenseExpiryDate: formatDate(value.licenseExpiryDate),
    birthDate: formatDate(value.birthDate),
    incorporationDate: formatDate(value.incorporationDate),
    deactivationDate: formatDate(value.deactivationDate),
    emergencyContactName: value.emergencyContactName,
    emergencyContactEmail: value.emergencyContactEmail,
    emergencyContactPhone: value.emergencyContactPhone,
    isActive: value.isActive,
    inactiveReason: value.inactiveReason,
    activationReason: value.activationReason,
  };
}

export function toPropietarioCreateData(
  row: ParsedPropietarioRow | (PropietarioConfig & { importKey?: string; rowNumber?: number }),
) {
  const importKey = resolvePersistedImportKey({
    importKey: row.importKey ?? "",
    vehicleNumber: row.vehicleNumber,
    rut: row.rut,
    titularRut: row.titularRut,
    rowNumber: "rowNumber" in row ? row.rowNumber : undefined,
  });

  return {
    importKey,
    vehicleNumber: row.vehicleNumber
      ? normalizeVehicleNumber(row.vehicleNumber)
      : "",
    fullName: row.fullName,
    firstName: row.firstName,
    lastName: row.lastName,
    secondLastName: row.secondLastName,
    rut: row.rut,
    email: row.email,
    landlinePhone: row.landlinePhone,
    mobilePhone: row.mobilePhone,
    address: row.address,
    postalCode: row.postalCode,
    city: row.city,
    province: row.province,
    bankName: row.bankName,
    bankAccount: row.bankAccount,
    accountHolder: row.accountHolder,
    titularRut: row.titularRut,
    titularEmail: row.titularEmail,
    titularBankName: row.titularBankName,
    titularBankAccount: row.titularBankAccount,
    bankBic: row.bankBic,
    paymentMethod: row.paymentMethod,
    paymentDay: row.paymentDay,
    notes: row.notes,
    branchOffice: row.branchOffice,
    area: row.area,
    costCenter: row.costCenter,
    accountingAccount: row.accountingAccount,
    isVip: row.isVip,
    gender: row.gender,
    recordStatus: row.recordStatus,
    licenseExpiryDate: parseOptionalDate(row.licenseExpiryDate),
    birthDate: parseOptionalDate(row.birthDate),
    incorporationDate: parseOptionalDate(row.incorporationDate),
    deactivationDate: parseOptionalDate(row.deactivationDate),
    emergencyContactName: row.emergencyContactName,
    emergencyContactEmail: row.emergencyContactEmail,
    emergencyContactPhone: row.emergencyContactPhone,
    isActive: row.isActive,
    inactiveReason: row.isActive ? "" : (row.inactiveReason ?? "").trim(),
    activationReason: row.isActive ? (row.activationReason ?? "").trim() : "",
  };
}

function escapeExcelHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function downloadPropietariosExcel(
  rows: PropietarioConfig[],
  fileName: string,
) {
  const headerCells = PROPIETARIO_TEMPLATE_HEADERS.map(
    (header) => `<th>${escapeExcelHtml(header)}</th>`,
  ).join("");
  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeExcelHtml(formatCompanyRutForDisplay(row.rut))}</td>
          <td>${escapeExcelHtml(formatMovilForTemplateExport(row.vehicleNumber))}</td>
          <td>${escapeExcelHtml(row.fullName)}</td>
          <td>${escapeExcelHtml(normalizeDepositAccountType(row.paymentMethod))}</td>
          <td>${escapeExcelHtml(formatBankRutForDisplay(row.titularRut))}</td>
          <td>${escapeExcelHtml(row.accountHolder)}</td>
          <td>${escapeExcelHtml(row.bankBic)}</td>
          <td>${escapeExcelHtml(row.bankName)}</td>
          <td>${escapeExcelHtml(row.bankAccount)}</td>
          <td>${escapeExcelHtml(row.email)}</td>
        </tr>`,
    )
    .join("");

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <!--[if gte mso 9]><xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Propietarios</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml><![endif]-->
      </head>
      <body>
        <table border="1">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>`;

  const blob = new Blob([html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
