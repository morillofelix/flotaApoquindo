/** Días calendario del rango, contando el día de inicio y el de término. */
export function inclusiveRangeDayCount(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return null;
  }

  if (end < start) {
    return null;
  }

  const span =
    Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`);

  if (!Number.isFinite(span)) {
    return null;
  }

  return Math.round(span / 86_400_000) + 1;
}

export function formatMinRangeDays(days: number | null | undefined) {
  if (!days || days < 1) {
    return "";
  }

  return days === 1 ? "Mínimo 1 día" : `Mínimo ${days} días`;
}

export function minRangeDaysError(
  start: string,
  end: string,
  minDays: number | null | undefined,
) {
  if (!minDays || minDays < 1 || !start || !end || end < start) {
    return "";
  }

  const count = inclusiveRangeDayCount(start, end);

  if (count === null || count >= minDays) {
    return "";
  }

  const unit = minDays === 1 ? "día" : "días";
  return `Este motivo exige un mínimo de ${minDays} ${unit}.`;
}

/** Vacío o 0 = sin mínimo. Un número de 1 a 366 queda guardado. */
export function readMinRangeDays(value: unknown, usesDateRange: boolean) {
  if (!usesDateRange) {
    return { days: null as number | null, error: "" };
  }

  if (value === null || value === undefined) {
    return { days: null, error: "" };
  }

  const raw = String(value).trim();

  if (!raw || raw === "0") {
    return { days: null, error: "" };
  }

  if (!/^\d+$/.test(raw)) {
    return { days: null, error: "El mínimo de días debe ser un número entero." };
  }

  const parsed = Number.parseInt(raw, 10);

  if (parsed < 1 || parsed > 366) {
    return {
      days: null,
      error: "El mínimo de días debe estar entre 1 y 366, o quedar vacío.",
    };
  }

  return { days: parsed, error: "" };
}
