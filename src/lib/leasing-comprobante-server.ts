import { createHash } from "node:crypto";
import {
  LEASING_ABSOLUTE_MAX_FILE_SIZE_MB,
  LEASING_DEFAULT_MAX_FILE_SIZE_MB,
} from "@/lib/leasing";

export type LeasingComprobanteMime = "application/pdf" | "image/jpeg" | "image/png";

export type ValidatedLeasingComprobante = {
  buffer: Buffer;
  mimeType: LeasingComprobanteMime;
  nombreOriginal: string;
  tamano: number;
  hash: string;
  origen: "PDF" | "IMAGEN";
};

const EXTENSIONS_BY_MIME: Record<LeasingComprobanteMime, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

const DANGEROUS_PDF_PATTERN = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b/;

export function getLeasingMaxFileBytes() {
  const configured = Number(process.env.LEASING_MAX_FILE_SIZE_MB ?? "");
  const megabytes =
    Number.isFinite(configured) && configured > 0
      ? Math.min(configured, LEASING_ABSOLUTE_MAX_FILE_SIZE_MB)
      : LEASING_DEFAULT_MAX_FILE_SIZE_MB;

  return Math.floor(megabytes * 1024 * 1024);
}

function detectMimeType(buffer: Buffer): LeasingComprobanteMime | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  return null;
}

export function sanitizeLeasingFileName(value: string) {
  const baseName = value.split(/[\\/]/).pop() ?? "";
  const cleaned = baseName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 120);

  return cleaned || "comprobante";
}

export async function validateLeasingComprobante(
  file: FormDataEntryValue | null,
): Promise<
  | { ok: true; value: ValidatedLeasingComprobante }
  | { ok: false; message: string }
> {
  if (!file || typeof file === "string") {
    return { ok: false, message: "Adjunta el comprobante de depósito o transferencia." };
  }

  const maxBytes = getLeasingMaxFileBytes();

  if (file.size <= 0) {
    return { ok: false, message: "El comprobante está vacío." };
  }

  if (file.size > maxBytes) {
    return {
      ok: false,
      message: `El comprobante no puede superar ${(maxBytes / (1024 * 1024)).toFixed(1)} MB.`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = detectMimeType(buffer);

  if (!mimeType) {
    return { ok: false, message: "El comprobante debe ser un PDF, JPG o PNG válido." };
  }

  const nombreOriginal = sanitizeLeasingFileName(file.name);
  const extension = nombreOriginal.includes(".")
    ? nombreOriginal.slice(nombreOriginal.lastIndexOf(".")).toLowerCase()
    : "";

  if (!EXTENSIONS_BY_MIME[mimeType].includes(extension)) {
    return {
      ok: false,
      message: "La extensión del archivo no coincide con su contenido.",
    };
  }

  if (
    mimeType === "application/pdf" &&
    DANGEROUS_PDF_PATTERN.test(buffer.toString("latin1"))
  ) {
    return {
      ok: false,
      message: "El PDF contiene elementos activos no permitidos. Descarga el comprobante nuevamente desde el banco.",
    };
  }

  return {
    ok: true,
    value: {
      buffer,
      mimeType,
      nombreOriginal,
      tamano: buffer.length,
      hash: createHash("sha256").update(buffer).digest("hex"),
      origen: mimeType === "application/pdf" ? "PDF" : "IMAGEN",
    },
  };
}
