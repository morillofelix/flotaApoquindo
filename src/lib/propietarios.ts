import {
  displayVehicleNumber,
  formatFileSize,
  normalizeCatalogActive,
  normalizeVehicleNumber,
  parseDateValue,
  parseSpreadsheetContentToMatrix,
  prepareDriverOwnerUploadContent,
  readDriverOwnerFileContent,
} from "@/lib/driver-owners";

export {
  displayVehicleNumber,
  formatFileSize,
  normalizeVehicleNumber,
  parseSpreadsheetContentToMatrix,
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

function mapImportHeaders(rawHeaders: string[]) {
  return rawHeaders.map((header) => headerAliases[header] ?? null);
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

function normalizePhone(value: string) {
  return value.trim().replace(/\D/g, "");
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
) {
  const rutKey = rutToImportKey(rut) || rutToImportKey(titularRut);
  const normalizedVehicleNumber = normalizeVehicleNumber(rawVehicleNumber);

  if (rutKey && normalizedVehicleNumber) {
    return `${rutKey}|${normalizedVehicleNumber}`;
  }

  if (rutKey) {
    return rutKey;
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

function normalizeVip(value: string) {
  const normalized = value.trim().toLowerCase();

  return ["si", "sí", "true", "1", "vip", "yes"].includes(normalized);
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseCombinedAccountField(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      accountNumber: "",
      holderName: "",
      email: "",
    };
  }

  const withEmail = trimmed.match(/^([\d][\d-]*)\s+(.+?)\s*\(([^)]+)\)\s*$/);

  if (withEmail) {
    return {
      accountNumber: withEmail[1] ?? "",
      holderName: (withEmail[2] ?? "").trim(),
      email: (withEmail[3] ?? "").trim(),
    };
  }

  const accountAndName = trimmed.match(/^([\d][\d-]*)\s+(.+)$/);

  if (accountAndName) {
    return {
      accountNumber: accountAndName[1] ?? "",
      holderName: (accountAndName[2] ?? "").trim(),
      email: "",
    };
  }

  return {
    accountNumber: trimmed,
    holderName: "",
    email: "",
  };
}

function normalizeTitularFields(record: Record<string, string>) {
  let fields = realignTitularFields(record);
  const parsedTitularAccount = parseCombinedAccountField(fields.titularBankAccount);

  if (parsedTitularAccount.accountNumber) {
    fields = {
      ...fields,
      titularBankAccount: parsedTitularAccount.accountNumber,
      accountHolder: parsedTitularAccount.holderName || fields.accountHolder,
      titularEmail: parsedTitularAccount.email || fields.titularEmail,
    };
  }

  if (looksLikeRut(fields.accountHolder)) {
    fields.titularRut = fields.titularRut || fields.accountHolder;
    if (!parsedTitularAccount.holderName) {
      fields.accountHolder = "";
    }
  }

  if (looksLikeEmail(fields.titularRut) && !fields.titularEmail) {
    fields.titularEmail = fields.titularRut;
    fields.titularRut = "";
  }

  return fields;
}

function normalizeOwnerBankAccount(value: string) {
  const parsed = parseCombinedAccountField(value);
  return parsed.accountNumber || value.trim();
}

function realignTitularFields(record: Record<string, string>) {
  const accountHolder = (record.accountHolder ?? "").trim();
  const titularRut = (record.titularRut ?? "").trim();
  const titularEmail = (record.titularEmail ?? "").trim();
  const titularBankName = (record.titularBankName ?? "").trim();
  const titularBankAccount = (record.titularBankAccount ?? "").trim();

  if (looksLikeEmail(titularRut) && !looksLikeEmail(titularEmail)) {
    return {
      accountHolder,
      titularRut: "",
      titularEmail: titularRut,
      titularBankName: titularEmail,
      titularBankAccount: titularBankName,
    };
  }

  return {
    accountHolder,
    titularRut,
    titularEmail,
    titularBankName,
    titularBankAccount,
  };
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
        'No se encontró una fila de encabezados con "Nombre" o "Propietario".',
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

    const fullName = buildFullName(record);
    const titularFields = normalizeTitularFields(record);
    const rut = (record.rut ?? "").trim();
    const titularRut = titularFields.titularRut;
    const rawMobile = (record.vehicleNumber ?? "").trim();
    const hasMobileNumber = Boolean(normalizeVehicleNumber(rawMobile));
    const importKey = resolveImportKey(rawMobile, rut, lineIndex + 1, titularRut);

    if (!fullName) {
      if (hasMobileNumber || (record.rut ?? "").trim() || rawMobile.trim()) {
        errors.push(
          `Fila ${lineIndex + 1}: sin propietario, fila omitida (móvil ${rawMobile || "sin número"}).`,
        );
      }
      continue;
    }

    if (importedKeys.has(importKey)) {
      errors.push(`Fila ${lineIndex + 1}: la clave ${importKey} está repetida.`);
      continue;
    }

    importedKeys.add(importKey);

    rows.push({
      rowNumber: lineIndex + 1,
      importKey,
      vehicleNumber: hasMobileNumber ? normalizeVehicleNumber(rawMobile) : "",
      fullName,
      firstName: (record.firstName ?? "").trim(),
      lastName: (record.lastName ?? "").trim(),
      secondLastName: (record.secondLastName ?? "").trim(),
      rut,
      email: (record.email ?? "").trim(),
      landlinePhone: normalizePhone(record.landlinePhone ?? ""),
      mobilePhone: normalizePhone(record.mobilePhone ?? ""),
      address: (record.address ?? "").trim(),
      postalCode: (record.postalCode ?? "").trim(),
      city: (record.city ?? "").trim(),
      province: (record.province ?? "").trim(),
      bankName: (record.bankName ?? "").trim(),
      bankAccount: normalizeOwnerBankAccount(record.bankAccount ?? ""),
      accountHolder: titularFields.accountHolder,
      titularRut,
      titularEmail: titularFields.titularEmail,
      titularBankName: titularFields.titularBankName,
      titularBankAccount: titularFields.titularBankAccount,
      bankBic: (record.bankBic ?? "").trim(),
      paymentMethod: (record.paymentMethod ?? "").trim(),
      paymentDay: (record.paymentDay ?? "").trim(),
      notes: (record.notes ?? "").trim(),
      branchOffice: (record.branchOffice ?? "").trim(),
      area: (record.area ?? "").trim(),
      costCenter: (record.costCenter ?? "").trim(),
      accountingAccount: (record.accountingAccount ?? "").trim(),
      isVip: normalizeVip(record.isVip ?? ""),
      gender: (record.gender ?? "").trim(),
      recordStatus: (record.recordStatus ?? "V").trim().toUpperCase() || "V",
      licenseExpiryDate: parseDateValue(record.licenseExpiryDate ?? ""),
      birthDate: parseDateValue(record.birthDate ?? ""),
      incorporationDate: parseDateValue(record.incorporationDate ?? ""),
      deactivationDate: parseDateValue(record.deactivationDate ?? ""),
      emergencyContactName: (record.emergencyContactName ?? "").trim(),
      emergencyContactEmail: (record.emergencyContactEmail ?? "").trim(),
      emergencyContactPhone: normalizePhone(record.emergencyContactPhone ?? ""),
      isActive: normalizeCatalogActive(record.catalogActive ?? "si"),
      inactiveReason: "",
      activationReason: "",
    });
  }

  if (!rows.length) {
    errors.unshift("No se importó ninguna fila válida. Revisa que el archivo tenga Nombre.");
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
  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeExcelHtml(displayVehicleNumber(row.vehicleNumber))}</td>
          <td>${escapeExcelHtml(row.fullName)}</td>
          <td>${escapeExcelHtml(row.rut)}</td>
          <td>${escapeExcelHtml(row.isActive ? "Activo" : "Inactivo")}</td>
          <td>${escapeExcelHtml(row.email)}</td>
          <td>${escapeExcelHtml(row.landlinePhone)}</td>
          <td>${escapeExcelHtml(row.mobilePhone)}</td>
          <td>${escapeExcelHtml(row.address)}</td>
          <td>${escapeExcelHtml(row.postalCode)}</td>
          <td>${escapeExcelHtml(row.city)}</td>
          <td>${escapeExcelHtml(row.province)}</td>
          <td>${escapeExcelHtml(row.bankName)}</td>
          <td>${escapeExcelHtml(row.bankAccount)}</td>
          <td>${escapeExcelHtml(row.accountHolder)}</td>
          <td>${escapeExcelHtml(row.titularRut)}</td>
          <td>${escapeExcelHtml(row.titularEmail)}</td>
          <td>${escapeExcelHtml(row.titularBankName)}</td>
          <td>${escapeExcelHtml(row.titularBankAccount)}</td>
          <td>${escapeExcelHtml(row.branchOffice)}</td>
          <td>${escapeExcelHtml(row.accountingAccount)}</td>
          <td>${escapeExcelHtml(row.costCenter)}</td>
          <td>${escapeExcelHtml(row.paymentMethod)}</td>
          <td>${escapeExcelHtml(row.paymentDay)}</td>
          <td>${escapeExcelHtml(row.notes)}</td>
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
              <th>RUT</th>
              <th>Estado</th>
              <th>Correo</th>
              <th>Teléfono fijo</th>
              <th>Teléfono móvil</th>
              <th>Dirección</th>
              <th>Código postal</th>
              <th>Población</th>
              <th>Provincia</th>
              <th>Banco propietario</th>
              <th>Cuenta propietario</th>
              <th>Nombre titular</th>
              <th>RUT titular</th>
              <th>Correo titular</th>
              <th>Banco titular</th>
              <th>N° cuenta titular</th>
              <th>Sucursal</th>
              <th>Cuenta contable</th>
              <th>Centro de costo</th>
              <th>Medio de pago</th>
              <th>Día de pago</th>
              <th>Observaciones</th>
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
