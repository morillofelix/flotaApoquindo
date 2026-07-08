export type PropietarioStatus = "activo" | "inactivo" | "desvinculado";

export const PROPIETARIO_STATUS_OPTIONS: Array<{
  value: PropietarioStatus;
  label: string;
}> = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
  { value: "desvinculado", label: "Desvinculado" },
];

export function normalizePropietarioStatus(value: unknown): PropietarioStatus {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "inactivo" || normalized === "desvinculado") {
    return normalized;
  }

  return "activo";
}

export function resolvePropietarioStatusFromRecord(record: {
  status?: string | null;
  isActive?: boolean;
}): PropietarioStatus {
  if (record.status?.trim()) {
    return normalizePropietarioStatus(record.status);
  }

  return record.isActive === false ? "inactivo" : "activo";
}

export function isPropietarioActiveStatus(status: PropietarioStatus) {
  return status === "activo";
}

export function formatPropietarioStatusLabel(status: PropietarioStatus) {
  return (
    PROPIETARIO_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    "Activo"
  );
}

export function getSantiagoDateString(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(referenceDate);
}

function parseDateOnlyValue(dateValue: string) {
  const [yearValue, monthValue, dayValue] = dateValue.split("-").map(Number);
  return new Date(yearValue || 0, (monthValue || 1) - 1, dayValue || 1);
}

function formatDateOnlyValue(dateValue: Date) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(fromDate: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || days <= 0) {
    return fromDate;
  }

  const current = parseDateOnlyValue(fromDate);
  current.setDate(current.getDate() + days);
  return formatDateOnlyValue(current);
}

export function formatDateLabel(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue;
  }

  const formatted = new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateValue}T12:00:00`));

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatDateValue(date: Date | null | undefined) {
  if (!date) {
    return "";
  }

  return date.toISOString().split("T")[0] ?? "";
}

export type PropietarioStatusInput = {
  status?: unknown;
  isActive?: unknown;
  inactiveReason?: string;
  desvinculacionReason?: string;
  desvinculacionDays?: unknown;
};

export type ResolvedPropietarioStatusFields = {
  status: PropietarioStatus;
  isActive: boolean;
  inactiveReason: string;
  desvinculacionReason: string;
  desvinculacionDays: number;
  desvinculadoUntil: string;
};

function normalizeDesvinculacionDays(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 0;
  }

  return Math.min(parsed, 3650);
}

export function resolvePropietarioStatusFields(
  input: PropietarioStatusInput,
  existing?: {
    status?: string | null;
    isActive?: boolean;
    inactiveReason?: string | null;
    desvinculacionReason?: string | null;
    desvinculacionDays?: number | null;
    desvinculadoUntil?: Date | null;
  } | null,
  referenceDate = getSantiagoDateString(),
): ResolvedPropietarioStatusFields {
  const status = input.status
    ? normalizePropietarioStatus(input.status)
    : input.isActive === false
      ? resolvePropietarioStatusFromRecord(existing ?? { isActive: false })
      : resolvePropietarioStatusFromRecord({
          status: existing?.status,
          isActive:
            input.isActive === undefined
              ? existing?.isActive
              : input.isActive === true,
        });

  if (status === "activo") {
    return {
      status,
      isActive: true,
      inactiveReason: "",
      desvinculacionReason: "",
      desvinculacionDays: 0,
      desvinculadoUntil: "",
    };
  }

  if (status === "inactivo") {
    const inactiveReason = (input.inactiveReason ?? existing?.inactiveReason ?? "")
      .trim();

    return {
      status,
      isActive: false,
      inactiveReason,
      desvinculacionReason: "",
      desvinculacionDays: 0,
      desvinculadoUntil: "",
    };
  }

  const desvinculacionReason = (
    input.desvinculacionReason ??
    existing?.desvinculacionReason ??
    ""
  ).trim();
  const desvinculacionDays = normalizeDesvinculacionDays(
    input.desvinculacionDays ??
      (existing?.desvinculacionDays && existing.desvinculacionDays > 0
        ? existing.desvinculacionDays
        : 0),
  );
  const existingUntil = formatDateValue(existing?.desvinculadoUntil);
  const shouldRecalculateUntil =
    !existing ||
    existing.status !== "desvinculado" ||
    normalizeDesvinculacionDays(input.desvinculacionDays) > 0 ||
    desvinculacionReason !== (existing.desvinculacionReason ?? "").trim();
  const desvinculadoUntil = shouldRecalculateUntil
    ? addCalendarDays(referenceDate, desvinculacionDays)
    : existingUntil;

  return {
    status,
    isActive: false,
    inactiveReason: "",
    desvinculacionReason,
    desvinculacionDays,
    desvinculadoUntil,
  };
}

export function validatePropietarioStatusFields(
  fields: ResolvedPropietarioStatusFields,
) {
  if (fields.status === "inactivo" && fields.inactiveReason.length < 5) {
    return "Debes indicar el motivo de inactivación (mínimo 5 caracteres).";
  }

  if (fields.status === "desvinculado") {
    if (fields.desvinculacionReason.length < 5) {
      return "Debes indicar el motivo de desvinculación (mínimo 5 caracteres).";
    }

    if (fields.desvinculacionDays < 1) {
      return "Indica cuántos días durará la desvinculación (mínimo 1).";
    }
  }

  return null;
}

export function isDesvinculadoExpired(
  desvinculadoUntil: string,
  referenceDate = getSantiagoDateString(),
) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(desvinculadoUntil) &&
    referenceDate >= desvinculadoUntil
  );
}
