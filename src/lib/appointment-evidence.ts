export const APPOINTMENT_EVIDENCE_MAX_BYTES = 2.5 * 1024 * 1024;
export const APPOINTMENT_EVIDENCE_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AppointmentEvidencePayload = {
  data: string;
  fileName: string;
  mimeType: string;
};

function normalizeBase64(value: unknown) {
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

function normalizeFileName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function normalizeMimeType(value: unknown) {
  const mime = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (mime === "image/jpg") {
    return "image/jpeg";
  }

  return mime;
}

export function getAppointmentEvidenceByteLength(base64Data: string) {
  const normalized = normalizeBase64(base64Data);

  if (!normalized) {
    return 0;
  }

  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;

  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function looksLikeAllowedImage(base64Data: string, mimeType: string) {
  try {
    const header = Buffer.from(base64Data.slice(0, 32), "base64");

    if (mimeType === "image/jpeg") {
      return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }

    if (mimeType === "image/png") {
      return (
        header.length >= 8 &&
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47
      );
    }

    if (mimeType === "image/webp") {
      return (
        header.length >= 12 &&
        header[0] === 0x52 &&
        header[1] === 0x49 &&
        header[2] === 0x46 &&
        header[3] === 0x46 &&
        header[8] === 0x57 &&
        header[9] === 0x45 &&
        header[10] === 0x42 &&
        header[11] === 0x50
      );
    }
  } catch {
    return false;
  }

  return false;
}

export function validateAppointmentEvidence(
  value: {
    data?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
  },
  options: { allowed: boolean; required: boolean },
) {
  if (!options.allowed) {
    return {
      ok: true as const,
      value: { data: "", fileName: "", mimeType: "" },
    };
  }

  const data = normalizeBase64(value.data);
  const fileName = normalizeFileName(value.fileName);
  const mimeType = normalizeMimeType(value.mimeType);

  if (!data) {
    if (options.required) {
      return {
        ok: false as const,
        message: "Adjunta una foto como evidencia de esta solicitud.",
      };
    }

    return {
      ok: true as const,
      value: { data: "", fileName: "", mimeType: "" },
    };
  }

  if (
    !APPOINTMENT_EVIDENCE_ALLOWED_MIME_TYPES.includes(
      mimeType as (typeof APPOINTMENT_EVIDENCE_ALLOWED_MIME_TYPES)[number],
    )
  ) {
    return {
      ok: false as const,
      message: "La evidencia debe ser una imagen JPG, PNG o WEBP.",
    };
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return {
      ok: false as const,
      message: "La imagen adjunta no es válida.",
    };
  }

  const byteLength = getAppointmentEvidenceByteLength(data);

  if (byteLength <= 0) {
    return {
      ok: false as const,
      message: "La imagen adjunta no es válida.",
    };
  }

  if (byteLength > APPOINTMENT_EVIDENCE_MAX_BYTES) {
    return {
      ok: false as const,
      message: "La evidencia no puede superar 2,5 MB. Toma o elige una foto más liviana.",
    };
  }

  if (!looksLikeAllowedImage(data, mimeType)) {
    return {
      ok: false as const,
      message: "La imagen adjunta no es válida.",
    };
  }

  return {
    ok: true as const,
    value: {
      data,
      fileName: fileName || "evidencia.jpg",
      mimeType,
    },
  };
}
