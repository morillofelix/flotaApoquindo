export const PROPIETARIO_TEMPLATE_HEADERS = [
  "RUT.-",
  "Móvil",
  "Razón Social",
  "Cta Depósito",
  "RUT BANCO",
  "NOMBRE CUENTA BANCARIA",
  "CODIGO BANCO",
  "Nombre Banco",
  "Nro. Cta. Banco",
  "Correo",
] as const;

export const PROPIETARIO_DEPOSIT_ACCOUNT_TYPES = ["Jurídica", "Personal"] as const;

export type PropietarioDepositAccountType =
  (typeof PROPIETARIO_DEPOSIT_ACCOUNT_TYPES)[number];

export function normalizeTemplateHeader(value: string) {
  return value
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function isPropietarioTemplateHeaderRow(cells: string[]) {
  const normalized = cells
    .slice(0, PROPIETARIO_TEMPLATE_HEADERS.length)
    .map((cell) => normalizeTemplateHeader(cell));

  const expected = PROPIETARIO_TEMPLATE_HEADERS.map((header) =>
    normalizeTemplateHeader(header),
  );

  let matches = 0;

  for (let index = 0; index < expected.length; index += 1) {
    if (normalized[index] === expected[index]) {
      matches += 1;
    }
  }

  return matches >= 7;
}

export function formatCompanyRutForDisplay(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length < 8) {
    return trimmed;
  }

  const body = digits.slice(0, -1);
  const verifier = digits.slice(-1).toUpperCase();

  if (body.length === 8) {
    return `${body.slice(0, 2)}.${body.slice(2, 5)}.${body.slice(5)}-${verifier}`;
  }

  if (body.length === 7) {
    return `${body.slice(0, 1)}.${body.slice(1, 4)}.${body.slice(4)}-${verifier}`;
  }

  return trimmed;
}

export function formatBankRutForDisplay(value: string) {
  return value.replace(/\D/g, "");
}

export function formatMovilForTemplateExport(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return String(Number.parseInt(digits, 10));
}

export function normalizeDepositAccountType(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized.startsWith("jur")) {
    return "Jurídica";
  }

  if (normalized.startsWith("per")) {
    return "Personal";
  }

  return value.trim();
}
