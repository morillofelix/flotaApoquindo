export const PROPIETARIO_FIELD_LABELS: Record<string, string> = {
  vehicleNumber: "Móvil",
  fullName: "Nombre completo",
  firstName: "Nombre",
  lastName: "Apellido",
  secondLastName: "Segundo apellido",
  rut: "RUT propietario",
  email: "Correo propietario",
  landlinePhone: "Teléfono fijo",
  mobilePhone: "Teléfono móvil",
  address: "Dirección",
  postalCode: "Código postal",
  city: "Ciudad",
  province: "Provincia / región",
  bankName: "Banco propietario",
  bankAccount: "Cuenta propietario",
  accountHolder: "Titular cuenta",
  titularRut: "RUT titular",
  titularEmail: "Correo titular",
  titularBankName: "Banco titular",
  titularBankAccount: "Cuenta titular",
  bankBic: "BIC / SWIFT",
  paymentMethod: "Forma de pago",
  paymentDay: "Día de pago",
  notes: "Observaciones",
  branchOffice: "Sucursal",
  area: "Área",
  costCenter: "Centro de costo",
  accountingAccount: "Cuenta contable",
  isVip: "VIP",
  gender: "Género",
  recordStatus: "Estado registro",
  licenseExpiryDate: "Vencimiento licencia",
  birthDate: "Fecha de nacimiento",
  incorporationDate: "Fecha incorporación",
  deactivationDate: "Fecha desactivación",
  emergencyContactName: "Contacto emergencia",
  emergencyContactEmail: "Correo emergencia",
  emergencyContactPhone: "Teléfono emergencia",
  isActive: "Estado",
  inactiveReason: "Motivo de inactivación",
};

const TRACKED_FIELDS = Object.keys(PROPIETARIO_FIELD_LABELS).filter(
  (field) => field !== "inactiveReason",
);

const PHONE_FIELDS = new Set([
  "landlinePhone",
  "mobilePhone",
  "emergencyContactPhone",
]);

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

function normalizeComparableValue(value: unknown, field?: string) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return formatDateValue(value);
  }

  if (typeof value === "boolean") {
    if (field === "isActive") {
      return value ? "activo" : "inactivo";
    }

    return value ? "si" : "no";
  }

  const normalized = String(value).trim();

  if (field && PHONE_FIELDS.has(field)) {
    return normalized.replace(/\D/g, "");
  }

  if (field === "vehicleNumber") {
    return normalized.replace(/\D/g, "").replace(/^0+/, "") || "";
  }

  return normalized;
}

function displayComparableValue(
  value: unknown,
  field?: string,
  record?: Record<string, unknown>,
) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return formatDateValue(value);
  }

  if (typeof value === "boolean") {
    if (field === "isActive") {
      if (!value && record?.inactiveReason) {
        return `Inactivo — Motivo: ${String(record.inactiveReason).trim()}`;
      }

      return value ? "Activo" : "Inactivo";
    }

    return value ? "Sí" : "No";
  }

  const normalized = String(value).trim();

  if (field && PHONE_FIELDS.has(field) && normalized) {
    return normalized.replace(/\D/g, "");
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

  const beforeReason = String(before.inactiveReason ?? "").trim();
  const afterReason = String(after.inactiveReason ?? "").trim();

  if (beforeReason !== afterReason && afterReason) {
    const alreadyInStatusChange = changes.some(
      (change) =>
        change.field === "isActive" && change.after.includes(afterReason),
    );

    if (!alreadyInStatusChange) {
      changes.push({
        field: "inactiveReason",
        label: PROPIETARIO_FIELD_LABELS.inactiveReason ?? "Motivo de inactivación",
        before: displayValue(beforeReason),
        after: displayValue(afterReason),
      });
    }
  }

  return changes;
}

export function formatPropietarioChangesForEmail(changes: PropietarioChangeRecord[]) {
  return changes.map(
    (change, index) =>
      `${index + 1}. ${change.label}\n   Anterior: ${change.before}\n   Nuevo: ${change.after}`,
  );
}

export function formatSantiagoTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}
