export type ShiftType = "diurno" | "nocturno" | "intermedio";

export type DriverOwnerConfig = {
  id?: string;
  vehicleNumber: string;
  fullName: string;
  email: string;
  rut: string;
  licenseExpiryDate: string;
  birthDate: string;
  landlinePhone: string;
  mobilePhone: string;
  address: string;
  recordStatus: string;
  isConductor: boolean;
  isPropietario: boolean;
  municipalLicense: string;
  shifts: ShiftType[];
  emergencyContactName: string;
  emergencyContactEmail: string;
  emergencyContactPhone: string;
  licensePlate: string;
  inspectionExpiryDate: string;
  vehicleType: string;
  subscriptionDate: string;
  isActive: boolean;
};

export const shiftOptions: Array<{ value: ShiftType; label: string }> = [
  { value: "diurno", label: "Diurno" },
  { value: "nocturno", label: "Nocturno" },
  { value: "intermedio", label: "Intermedio" },
];

export function getTemporaryPasswordFromRut(rut: string) {
  const digits = rut.replace(/\D/g, "");

  if (digits.length < 4) {
    return null;
  }

  return digits.slice(0, 4);
}

export const driverOwnerCsvTemplate = [
  "activo,nombre,correo,rut,fecha_vencimiento_carnet,fecha_nacimiento,telefono_fijo,telefono_movil,direccion,estado,tipo,licencia_municipal,turnos,nombre_contacto_emergencia,correo_contacto_emergencia,telefono_contacto_emergencia,patente,fecha_vencimiento_revision,tipo_vehiculo,fecha_suscripcion",
  '001,Juan Pérez,juan@ejemplo.com,12.345.678-9,31-12-2026,15-03-1985,22334455,912345678,Av. Principal 123,V,"Conductor; Propietario",LM-12345,"Diurno; Nocturno",María Pérez,maria@ejemplo.com,987654321,ABCD12,30-06-2026,Sedan,01-01-2024',
].join("\n");

const shiftAliases: Record<string, ShiftType> = {
  diurno: "diurno",
  diurnos: "diurno",
  nocturno: "nocturno",
  nocturnos: "nocturno",
  intermedio: "intermedio",
  intermedios: "intermedio",
};

const headerAliases: Record<string, string> = {
  numero_de_movil: "vehicleNumber",
  numero_movil: "vehicleNumber",
  n_movil: "vehicleNumber",
  movil: "vehicleNumber",
  mobile: "vehicleNumber",
  vehicleNumber: "vehicleNumber",
  activo: "catalogActive",
  nombre: "fullName",
  name: "fullName",
  fullName: "fullName",
  correo: "email",
  email: "email",
  rut: "rut",
  rut_id: "rut",
  "rut_/_id": "rut",
  fecha_vencimiento_carnet: "licenseExpiryDate",
  fecha_vencimiento_cedula: "licenseExpiryDate",
  fecha_nacimiento: "birthDate",
  telefono_fijo: "landlinePhone",
  telefono_movil: "mobilePhone",
  direccion: "address",
  estado: "recordStatus",
  genero: "gender",
  roles: "personTypes",
  tipo: "personTypes",
  licencia_municipal: "municipalLicense",
  turnos: "shifts",
  turno: "shifts",
  nombre_contacto_emergencia: "emergencyContactName",
  correo_contacto_emergencia: "emergencyContactEmail",
  telefono_contacto_emergencia: "emergencyContactPhone",
  patente: "licensePlate",
  fecha_vencimiento_revision: "inspectionExpiryDate",
  fecha_vencimiento_licencia: "inspectionExpiryDate",
  tipo_licencia: "vehicleType",
  tipo_vehiculo: "vehicleType",
  fecha_suscripcion: "subscriptionDate",
  fecha_de_suscripcion: "subscriptionDate",
  fecha_incorporacion: "subscriptionDate",
  sucursal: "branchOffice",
};

export function normalizeVehicleNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits.padStart(3, "0");
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeRolePart(value: string) {
  return stripAccents(value.trim().toLowerCase());
}

const movilRoleAliases = new Set([
  "conductor",
  "conductores",
  "driver",
  "movil",
  "moviles",
  "mobile",
  "chofer",
]);

const propietarioRoleAliases = new Set([
  "propietario",
  "propietarios",
  "owner",
]);

function rolePartIncludesConductor(part: string) {
  const normalized = normalizeRolePart(part);

  return movilRoleAliases.has(normalized) || normalized.includes("conductor");
}

function rolePartIncludesPropietario(part: string) {
  const normalized = normalizeRolePart(part);

  return (
    propietarioRoleAliases.has(normalized) || normalized.includes("propietario")
  );
}

function rolePartIncludesTitular(part: string) {
  return normalizeRolePart(part).includes("titular");
}

export function parsePersonTypes(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return { isConductor: false, isPropietario: false, isTitular: false };
  }

  const normalizedParts = trimmed
    .split(/[;,/|]/)
    .map((part) => normalizeRolePart(part))
    .filter(Boolean);
  const fullNormalized = normalizeRolePart(trimmed);
  const partsToCheck = normalizedParts.length
    ? normalizedParts
    : [fullNormalized];

  const isConductor = partsToCheck.some(rolePartIncludesConductor);
  const isTitular =
    partsToCheck.some(rolePartIncludesTitular) ||
    fullNormalized.includes("titular");
  const isPropietario =
    partsToCheck.some(rolePartIncludesPropietario) ||
    fullNormalized.includes("propietario");

  return { isConductor, isPropietario, isTitular };
}

function rutToVehicleKey(rut: string) {
  const digits = rut.replace(/\D/g, "");

  if (digits.length < 7) {
    return "";
  }

  return `R${digits}`;
}

function resolveImportVehicleNumber(
  rawVehicleNumber: string,
  rut: string,
  lineNumber: number,
) {
  const normalizedVehicleNumber = normalizeVehicleNumber(rawVehicleNumber);

  if (normalizedVehicleNumber) {
    return normalizedVehicleNumber;
  }

  const rutKey = rutToVehicleKey(rut);

  if (rutKey) {
    return rutKey;
  }

  return `INACT${String(lineNumber).padStart(5, "0")}`;
}

export type BulkImportFilters = {
  moviles: boolean;
  propietario: boolean;
  titular: boolean;
};

export function countImportCategories(
  rows: Array<
    Pick<ParsedDriverOwnerRow, "isConductor" | "isPropietario" | "isTitular">
  >,
) {
  return {
    moviles: rows.filter((row) => row.isConductor).length,
    propietario: rows.filter((row) => row.isPropietario).length,
    titular: rows.filter((row) => row.isTitular).length,
    total: rows.length,
  };
}

export function filterDriverOwnerImportRows(
  rows: ParsedDriverOwnerRow[],
  filters: BulkImportFilters,
) {
  if (!filters.moviles && !filters.propietario && !filters.titular) {
    return [];
  }

  return rows.filter((row) => {
    const matchesMovil = filters.moviles && row.isConductor;
    const matchesPropietario = filters.propietario && row.isPropietario;
    const matchesTitular = filters.titular && row.isTitular;

    return matchesMovil || matchesPropietario || matchesTitular;
  });
}

export function parseShifts(value: string): ShiftType[] {
  const parsed = value
    .split(/[;,/|]/)
    .map((part) => shiftAliases[part.trim().toLowerCase()])
    .filter((shift): shift is ShiftType => Boolean(shift));

  return [...new Set(parsed)];
}

export function shiftsToStorage(shifts: ShiftType[]) {
  return shifts.join(",");
}

export function shiftsFromStorage(value: string): ShiftType[] {
  if (!value.trim()) {
    return [];
  }

  return parseShifts(value.replace(/,/g, ";"));
}

export function formatPersonTypes(
  isConductor: boolean,
  isPropietario: boolean,
  isTitular = false,
) {
  const labels = [
    isConductor ? "Móvil" : "",
    isPropietario ? "Propietario" : "",
    isTitular ? "Titular" : "",
  ].filter(Boolean);

  return labels.join(" · ") || "—";
}

export function formatShifts(shifts: ShiftType[]) {
  if (!shifts.length) {
    return "—";
  }

  return shifts
    .map(
      (shift) =>
        shiftOptions.find((option) => option.value === shift)?.label ?? shift,
    )
    .join(" · ");
}

export function parseDateValue(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  const datePart = trimmedValue.split(" ")[0] ?? trimmedValue;
  const isoMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    return datePart;
  }

  const localMatch = datePart.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (localMatch) {
    const day = localMatch[1] ?? "";
    const month = localMatch[2] ?? "";
    const year = localMatch[3] ?? "";
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return "";
}

export function normalizeCatalogActive(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) {
    return true;
  }

  if (["no", "false", "0", "inactivo"].includes(normalizedValue)) {
    return false;
  }

  return ["si", "sí", "true", "1", "activo", "yes"].includes(normalizedValue);
}

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

function normalizePhone(value: string) {
  return value.trim().replace(/\D/g, "");
}

export type ParsedDriverOwnerRow = Omit<DriverOwnerConfig, "id"> & {
  rowNumber: number;
  isTitular: boolean;
};

export function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeCsvCell(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes(";")) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function extractSlkCellValue(kSegment: string) {
  const valuePart = kSegment.startsWith("K") ? kSegment.slice(1) : kSegment;

  if (!valuePart.startsWith('"')) {
    return valuePart.split(";")[0] ?? "";
  }

  let value = "";

  for (let index = 1; index < valuePart.length; index += 1) {
    const character = valuePart[index];

    if (character === '"') {
      if (valuePart[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        break;
      }
    } else {
      value += character;
    }
  }

  return value;
}

function parseDelimitedTextToCsv(content: string) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return null;
  }

  const firstLine = lines[0] ?? "";

  if (firstLine.includes("\t")) {
    return lines
      .map((line) =>
        line
          .split("\t")
          .map((cell) => escapeCsvCell(cell.trim()))
          .join(","),
      )
      .join("\n");
  }

  if (
    firstLine.includes(";") &&
    !firstLine.toUpperCase().startsWith("ID;") &&
    firstLine.split(";").length > 3
  ) {
    return lines
      .map((line) =>
        line
          .split(";")
          .map((cell) => escapeCsvCell(cell.trim()))
          .join(","),
      )
      .join("\n");
  }

  return null;
}

function looksLikeSlkContent(content: string) {
  const sample = content.slice(0, 4000).toUpperCase();

  return sample.includes("ID;") && (sample.includes("C;Y") || sample.includes("C;X"));
}

export async function readDriverOwnerFileContent(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer);
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer);
  }

  const utf8Content = new TextDecoder("utf-8").decode(buffer);

  if (
    looksLikeSlkContent(utf8Content) ||
    utf8Content.trimStart().startsWith("ID;")
  ) {
    return utf8Content;
  }

  const latinContent = new TextDecoder("latin1").decode(buffer);

  if (looksLikeSlkContent(latinContent)) {
    return latinContent;
  }

  return utf8Content.replace(/^\uFEFF/, "");
}

export function parseSlkToCsv(content: string) {
  const trimmedContent = content.replace(/^\uFEFF/, "").trim();

  if (!looksLikeSlkContent(trimmedContent)) {
    return parseDelimitedTextToCsv(trimmedContent);
  }

  const grid = new Map<string, string>();
  let maxRow = 0;
  let maxCol = 0;

  for (const line of trimmedContent.split(/\r?\n/)) {
    const normalizedLine = line.trim();

    if (!/^C;/i.test(normalizedLine)) {
      continue;
    }

    const parts = normalizedLine.split(";");
    let row = 0;
    let col = 0;
    let value = "";

    for (let index = 1; index < parts.length; index += 1) {
      const part = parts[index] ?? "";

      if (/^Y\d+$/i.test(part)) {
        row = Number(part.slice(1));
      } else if (/^X\d+$/i.test(part)) {
        col = Number(part.slice(1));
      } else if (/^K/i.test(part)) {
        value = extractSlkCellValue(parts.slice(index).join(";"));
        break;
      }
    }

    if (!row || !col) {
      continue;
    }

    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
    grid.set(`${row},${col}`, value);
  }

  if (maxRow < 2 || maxCol < 1) {
    return parseDelimitedTextToCsv(trimmedContent);
  }

  const lines: string[] = [];

  for (let row = 1; row <= maxRow; row += 1) {
    const rowValues: string[] = [];

    for (let col = 1; col <= maxCol; col += 1) {
      rowValues.push(escapeCsvCell(grid.get(`${row},${col}`) ?? ""));
    }

    lines.push(rowValues.join(","));
  }

  return lines.join("\n");
}

export function prepareDriverOwnerUploadContent(
  fileName: string,
  rawContent: string,
) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isSlkFile = extension === "slk" || looksLikeSlkContent(rawContent);

  if (isSlkFile) {
    const csvContent = parseSlkToCsv(rawContent);

    if (!csvContent) {
      return {
        error:
          "No se pudo interpretar el archivo SLK. En Access usa Archivo > Exportar > Archivo de texto o Excel, y guarda como CSV.",
      };
    }

    return { csvContent, format: "slk" as const };
  }

  if (
    extension &&
    !["csv", "txt"].includes(extension)
  ) {
    return {
      error: `El archivo ".${extension}" no es compatible. Usa CSV o SLK exportado desde Access.`,
    };
  }

  return { csvContent: rawContent, format: "csv" as const };
}

export function parseDriverOwnersCsv(content: string) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      rows: [] as ParsedDriverOwnerRow[],
      errors: ["El archivo debe incluir encabezados y al menos una fila."],
    };
  }

  const delimiter = detectDelimiter(lines[0] ?? "");
  const headers = parseCsvLine(lines[0] ?? "", delimiter).map(normalizeHeader);
  const mappedHeaders = headers.map((header) => headerAliases[header] ?? null);

  if (!mappedHeaders.includes("fullName")) {
    return {
      rows: [] as ParsedDriverOwnerRow[],
      errors: [
        'Falta la columna "Nombre". Columnas detectadas: ' + headers.join(", "),
      ],
    };
  }

  if (!mappedHeaders.includes("personTypes")) {
    return {
      rows: [] as ParsedDriverOwnerRow[],
      errors: [
        'Falta la columna "Roles" o "tipo". Columnas detectadas: ' +
          headers.join(", "),
      ],
    };
  }

  const rows: ParsedDriverOwnerRow[] = [];
  const errors: string[] = [];
  const importedVehicleNumbers = new Set<string>();

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const values = parseCsvLine(lines[lineIndex] ?? "", delimiter);

    if (!values.some((value) => value.trim().length > 0)) {
      continue;
    }

    const record: Record<string, string> = {};

    mappedHeaders.forEach((field, fieldIndex) => {
      if (!field || ["gender", "branchOffice"].includes(field)) {
        return;
      }

      record[field] = values[fieldIndex] ?? "";
    });

    const rawMobile = (record.vehicleNumber ?? "").trim();
    const hasMobileNumber = Boolean(normalizeVehicleNumber(rawMobile));
    const vehicleNumber = resolveImportVehicleNumber(
      rawMobile,
      record.rut ?? "",
      lineIndex + 1,
    );
    const fullName = (record.fullName ?? "").trim();
    const personTypes = parsePersonTypes(record.personTypes ?? "");
    const shifts = parseShifts(record.shifts ?? "");

    if (!fullName) {
      errors.push(`Fila ${lineIndex + 1}: el nombre es obligatorio.`);
      continue;
    }

    if (!personTypes.isConductor) {
      errors.push(
        `Fila ${lineIndex + 1}: omitida — el rol debe incluir conductor.`,
      );
      continue;
    }

    if (importedVehicleNumbers.has(vehicleNumber)) {
      errors.push(
        `Fila ${lineIndex + 1}: la clave ${vehicleNumber} está repetida.`,
      );
      continue;
    }

    importedVehicleNumbers.add(vehicleNumber);

    rows.push({
      rowNumber: lineIndex + 1,
      vehicleNumber,
      fullName,
      email: (record.email ?? "").trim(),
      rut: (record.rut ?? "").trim(),
      licenseExpiryDate: parseDateValue(record.licenseExpiryDate ?? ""),
      birthDate: parseDateValue(record.birthDate ?? ""),
      landlinePhone: normalizePhone(record.landlinePhone ?? ""),
      mobilePhone: normalizePhone(record.mobilePhone ?? ""),
      address: (record.address ?? "").trim(),
      recordStatus: (record.recordStatus ?? "V").trim().toUpperCase() || "V",
      isConductor: personTypes.isConductor,
      isPropietario: personTypes.isPropietario,
      isTitular: personTypes.isTitular,
      municipalLicense: (record.municipalLicense ?? "").trim(),
      shifts,
      emergencyContactName: (record.emergencyContactName ?? "").trim(),
      emergencyContactEmail: (record.emergencyContactEmail ?? "").trim(),
      emergencyContactPhone: normalizePhone(record.emergencyContactPhone ?? ""),
      licensePlate: (record.licensePlate ?? "").trim().toUpperCase(),
      inspectionExpiryDate: parseDateValue(record.inspectionExpiryDate ?? ""),
      vehicleType: (record.vehicleType ?? "").trim(),
      subscriptionDate: parseDateValue(record.subscriptionDate ?? ""),
      isActive: hasMobileNumber
        ? normalizeCatalogActive(record.catalogActive ?? "si")
        : false,
    });
  }

  if (!rows.length) {
    errors.unshift(
      "No se importó ninguna fila válida. Revisa que el archivo tenga Nombre y Roles con conductor.",
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

export function toDriverOwner(value: {
  id: string;
  vehicleNumber: string;
  fullName: string;
  email: string;
  rut: string;
  licenseExpiryDate: Date | null;
  birthDate: Date | null;
  landlinePhone: string;
  mobilePhone: string;
  address: string;
  recordStatus: string;
  isConductor: boolean;
  isPropietario: boolean;
  municipalLicense: string;
  shifts: string;
  emergencyContactName: string;
  emergencyContactEmail: string;
  emergencyContactPhone: string;
  licensePlate: string;
  inspectionExpiryDate: Date | null;
  vehicleType: string;
  subscriptionDate: Date | null;
  isActive: boolean;
}): DriverOwnerConfig {
  const formatDate = (date: Date | null) =>
    date ? date.toISOString().split("T")[0] ?? "" : "";

  return {
    id: value.id,
    vehicleNumber: value.vehicleNumber,
    fullName: value.fullName,
    email: value.email,
    rut: value.rut,
    licenseExpiryDate: formatDate(value.licenseExpiryDate),
    birthDate: formatDate(value.birthDate),
    landlinePhone: value.landlinePhone,
    mobilePhone: value.mobilePhone,
    address: value.address,
    recordStatus: value.recordStatus,
    isConductor: value.isConductor,
    isPropietario: value.isPropietario,
    municipalLicense: value.municipalLicense,
    shifts: shiftsFromStorage(value.shifts),
    emergencyContactName: value.emergencyContactName,
    emergencyContactEmail: value.emergencyContactEmail,
    emergencyContactPhone: value.emergencyContactPhone,
    licensePlate: value.licensePlate,
    inspectionExpiryDate: formatDate(value.inspectionExpiryDate),
    vehicleType: value.vehicleType,
    subscriptionDate: formatDate(value.subscriptionDate),
    isActive: value.isActive,
  };
}

export function toDriverOwnerCreateData(
  row: Omit<ParsedDriverOwnerRow, "rowNumber" | "isTitular"> & {
    isTitular?: boolean;
  },
) {
  return {
    vehicleNumber: row.vehicleNumber,
    fullName: row.fullName,
    email: row.email,
    rut: row.rut,
    licenseExpiryDate: parseOptionalDate(row.licenseExpiryDate),
    birthDate: parseOptionalDate(row.birthDate),
    landlinePhone: row.landlinePhone,
    mobilePhone: row.mobilePhone,
    address: row.address,
    recordStatus: row.recordStatus,
    isConductor: row.isConductor,
    isPropietario: row.isPropietario,
    municipalLicense: row.municipalLicense,
    shifts: shiftsToStorage(row.shifts),
    emergencyContactName: row.emergencyContactName,
    emergencyContactEmail: row.emergencyContactEmail,
    emergencyContactPhone: row.emergencyContactPhone,
    licensePlate: row.licensePlate,
    inspectionExpiryDate: parseOptionalDate(row.inspectionExpiryDate),
    vehicleType: row.vehicleType,
    subscriptionDate: parseOptionalDate(row.subscriptionDate),
    isActive: row.isActive,
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

export function downloadDriverOwnersExcel(
  rows: DriverOwnerConfig[],
  fileName: string,
) {
  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeExcelHtml(row.vehicleNumber)}</td>
          <td>${escapeExcelHtml(row.fullName)}</td>
          <td>${escapeExcelHtml(formatPersonTypes(row.isConductor, row.isPropietario))}</td>
          <td>${escapeExcelHtml(formatShifts(row.shifts))}</td>
          <td>${escapeExcelHtml(row.isActive ? "Activo" : "Inactivo")}</td>
          <td>${escapeExcelHtml(row.email)}</td>
          <td>${escapeExcelHtml(row.rut)}</td>
          <td>${escapeExcelHtml(row.landlinePhone)}</td>
          <td>${escapeExcelHtml(row.mobilePhone)}</td>
          <td>${escapeExcelHtml(row.address)}</td>
          <td>${escapeExcelHtml(row.municipalLicense)}</td>
          <td>${escapeExcelHtml(row.licensePlate)}</td>
          <td>${escapeExcelHtml(row.vehicleType)}</td>
          <td>${escapeExcelHtml(row.licenseExpiryDate)}</td>
          <td>${escapeExcelHtml(row.birthDate)}</td>
          <td>${escapeExcelHtml(row.inspectionExpiryDate)}</td>
          <td>${escapeExcelHtml(row.subscriptionDate)}</td>
          <td>${escapeExcelHtml(row.emergencyContactName)}</td>
          <td>${escapeExcelHtml(row.emergencyContactEmail)}</td>
          <td>${escapeExcelHtml(row.emergencyContactPhone)}</td>
        </tr>`,
    )
    .join("");

  const htmlTable = `
    <html>
      <head>
        <meta charset="UTF-8" />
      </head>
      <body>
        <table border="1">
          <thead>
            <tr>
              <th>Móvil</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Turnos</th>
              <th>Estado</th>
              <th>Correo</th>
              <th>RUT</th>
              <th>Teléfono fijo</th>
              <th>Teléfono móvil</th>
              <th>Dirección</th>
              <th>Licencia municipal</th>
              <th>Patente</th>
              <th>Tipo vehículo</th>
              <th>Fecha venc. carnet</th>
              <th>Fecha nacimiento</th>
              <th>Fecha venc. revisión</th>
              <th>Fecha suscripción</th>
              <th>Contacto emergencia</th>
              <th>Correo emergencia</th>
              <th>Teléfono emergencia</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>`;

  const blob = new Blob([htmlTable], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
