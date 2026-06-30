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
  isActive: "Activo",
};

const TRACKED_FIELDS = Object.keys(PROPIETARIO_FIELD_LABELS);

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

function normalizeComparableValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return formatDateValue(value);
  }

  if (typeof value === "boolean") {
    return value ? "Sí" : "No";
  }

  return String(value).trim();
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
    const previousValue = normalizeComparableValue(before[field]);
    const nextValue = normalizeComparableValue(after[field]);

    if (previousValue === nextValue) {
      continue;
    }

    changes.push({
      field,
      label: PROPIETARIO_FIELD_LABELS[field] ?? field,
      before: displayValue(previousValue),
      after: displayValue(nextValue),
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

export function formatSantiagoTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}
