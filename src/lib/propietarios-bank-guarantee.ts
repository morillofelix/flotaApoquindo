export const PROPIETARIO_BANK_GUARANTEE_PDF_MAX_BYTES = 5 * 1024 * 1024;

export function normalizePropietarioBankGuaranteeFileName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePropietarioBankGuaranteePdfData(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const base64 = trimmed.includes(",")
    ? (trimmed.split(",").pop() ?? "").trim()
    : trimmed;

  return base64.replace(/\s+/g, "");
}

export function getPropietarioBankGuaranteePdfByteLength(base64Data: string) {
  const normalized = normalizePropietarioBankGuaranteePdfData(base64Data);

  if (!normalized) {
    return 0;
  }

  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;

  return Math.floor((normalized.length * 3) / 4) - padding;
}

export function isValidPropietarioBankGuaranteePdf(
  base64Data: string,
  fileName = "",
) {
  const normalizedData = normalizePropietarioBankGuaranteePdfData(base64Data);
  const normalizedFileName = normalizePropietarioBankGuaranteeFileName(fileName);

  if (!normalizedData) {
    return false;
  }

  if (normalizedFileName && !/\.pdf$/i.test(normalizedFileName)) {
    return false;
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedData)) {
    return false;
  }

  const byteLength = getPropietarioBankGuaranteePdfByteLength(normalizedData);

  if (byteLength <= 0 || byteLength > PROPIETARIO_BANK_GUARANTEE_PDF_MAX_BYTES) {
    return false;
  }

  try {
    const header = Buffer.from(normalizedData.slice(0, 24), "base64")
      .toString("utf8")
      .trimStart();

    return header.startsWith("%PDF");
  } catch {
    return false;
  }
}

export function validatePropietarioBankGuaranteePdf(
  base64Data: string,
  fileName = "",
) {
  const normalizedData = normalizePropietarioBankGuaranteePdfData(base64Data);
  const normalizedFileName = normalizePropietarioBankGuaranteeFileName(fileName);

  if (!normalizedData) {
    return "Debes adjuntar el documento PDF de garantía bancaria.";
  }

  if (normalizedFileName && !/\.pdf$/i.test(normalizedFileName)) {
    return "La garantía bancaria debe ser un archivo PDF.";
  }

  const byteLength = getPropietarioBankGuaranteePdfByteLength(normalizedData);

  if (byteLength <= 0) {
    return "El archivo PDF de garantía bancaria no es válido.";
  }

  if (byteLength > PROPIETARIO_BANK_GUARANTEE_PDF_MAX_BYTES) {
    return "El PDF de garantía bancaria no puede superar 5 MB.";
  }

  if (!isValidPropietarioBankGuaranteePdf(normalizedData, normalizedFileName)) {
    return "El archivo PDF de garantía bancaria no es válido.";
  }

  return null;
}
