import {
  formatDateLabel,
  formatPropietarioStatusLabel,
  resolvePropietarioStatusFromRecord,
} from "@/lib/propietario-status";

export const PROPIETARIO_FIELD_LABELS: Record<string, string> = {
  rut: "RUT.-",
  vehicleNumber: "Móvil",
  fullName: "Razón Social",
  email: "Correo",
  paymentMethod: "Cta Depósito",
  titularRut: "RUT BANCO",
  accountHolder: "NOMBRE CUENTA BANCARIA",
  bankBic: "CODIGO BANCO",
  bankName: "Nombre Banco",
  bankAccount: "Nro. Cta. Banco",
  status: "Estado",
  inactiveReason: "Motivo de inactivación",
  desvinculacionReason: "Motivo de desvinculación",
  desvinculacionDays: "Días de desvinculación",
  desvinculadoUntil: "Desvinculado hasta",
};

const TRACKED_FIELDS = Object.keys(PROPIETARIO_FIELD_LABELS).filter(
  (field) =>
    field !== "inactiveReason" &&
    field !== "desvinculacionReason" &&
    field !== "desvinculacionDays" &&
    field !== "desvinculadoUntil",
);

const PHONE_FIELDS = new Set(["vehicleNumber"]);

export type PropietarioChangeRecord = {
  field: string;
  label: string;
  before: string;
  after: string;
};

function formatDateValue(value: Date | null | undefined) {
  if (!value) {
    return "";
  }

  return value.toISOString().split("T")[0] ?? "";
}

function formatStatusDisplay(record: Record<string, unknown>) {
  const status = resolvePropietarioStatusFromRecord({
    status: typeof record.status === "string" ? record.status : null,
    isActive: record.isActive === true,
  });

  if (status === "inactivo" && record.inactiveReason) {
    return `Inactivo — Motivo: ${String(record.inactiveReason).trim()}`;
  }

  if (status === "desvinculado") {
    const reason = String(record.desvinculacionReason ?? "").trim();
    const days = Number(record.desvinculacionDays ?? 0);
    const until = formatDateValue(record.desvinculadoUntil as Date | null | undefined);
    const parts = [formatPropietarioStatusLabel(status)];

    if (reason) {
      parts.push(`Motivo: ${reason}`);
    }

    if (days > 0) {
      parts.push(`${days} días`);
    }

    if (until) {
      parts.push(`Hasta: ${formatDateLabel(until)}`);
    }

    return parts.join(" — ");
  }

  return formatPropietarioStatusLabel(status);
}

function normalizeComparableValue(value: unknown, field?: string) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return formatDateValue(value);
  }

  if (field === "status") {
    return String(value).trim().toLowerCase();
  }

  const normalized = String(value).trim();

  if (field && PHONE_FIELDS.has(field)) {
    return normalized.replace(/\D/g, "").replace(/^0+/, "") || "";
  }

  if (field === "titularRut") {
    return normalized.replace(/\D/g, "");
  }

  return normalized;
}

function displayComparableValue(
  value: unknown,
  field?: string,
  record?: Record<string, unknown>,
) {
  if (field === "status" && record) {
    return formatStatusDisplay(record);
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return formatDateLabel(formatDateValue(value));
  }

  const normalized = String(value).trim();

  if (field === "titularRut") {
    return normalized.replace(/\D/g, "");
  }

  if (field === "desvinculadoUntil" && normalized) {
    return formatDateLabel(normalized);
  }

  return normalized;
}

function displayValue(value: string) {
  return value || "(vacío)";
}

export function diffPropietarioChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const changes: PropietarioChangeRecord[] = [];

  for (const field of TRACKED_FIELDS) {
    const previousValue = normalizeComparableValue(before[field], field);
    const nextValue = normalizeComparableValue(after[field], field);

    if (previousValue === nextValue) {
      continue;
    }

    changes.push({
      field,
      label: PROPIETARIO_FIELD_LABELS[field] ?? field,
      before: displayValue(displayComparableValue(before[field], field, before)),
      after: displayValue(displayComparableValue(after[field], field, after)),
    });
  }

  const detailFields: Array<keyof typeof PROPIETARIO_FIELD_LABELS> = [
    "inactiveReason",
    "desvinculacionReason",
    "desvinculacionDays",
    "desvinculadoUntil",
  ];

  for (const field of detailFields) {
    const beforeValue = normalizeComparableValue(before[field], field);
    const afterValue = normalizeComparableValue(after[field], field);

    if (beforeValue === afterValue || !afterValue) {
      continue;
    }

    changes.push({
      field,
      label: PROPIETARIO_FIELD_LABELS[field] ?? field,
      before: displayValue(displayComparableValue(before[field], field, before)),
      after: displayValue(displayComparableValue(after[field], field, after)),
    });
  }

  return changes;
}

export function formatPropietarioChangesForEmail(changes: PropietarioChangeRecord[]) {
  return changes.map(
    (change, index) =>
      `${index + 1}. ${change.label}\n   Anterior: ${change.before}\n   Nuevo: ${change.after}`,
  );
}

export function formatPropietarioCreateForEmail(record: Record<string, unknown>) {
  const changes = diffPropietarioChanges({}, record);

  if (!changes.length) {
    return [];
  }

  return [
    "",
    "Detalle del registro:",
    "",
    ...changes.map(
      (change, index) => `${index + 1}. ${change.label}: ${change.after}`,
    ),
  ];
}

export function formatSantiagoTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}
