import { defaultAppointmentReasons } from "@/lib/appointments";

const reasonLabels = new Map(
  defaultAppointmentReasons.map((reason) => [reason.value, reason.label]),
);

export type PlanningDriverBlockSummary = {
  observation?: string;
  isHourBlock?: boolean;
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
};

export function planningBlockDetailLabel(block: PlanningDriverBlockSummary | null | undefined) {
  if (!block) {
    return "";
  }
  if (block.isHourBlock && block.startTime && block.endTime) {
    return `${block.startTime} – ${block.endTime}`;
  }
  if (block.startDate && block.endDate && block.startDate !== block.endDate) {
    return `${block.startDate} al ${block.endDate}`;
  }
  return block.startDate ?? "";
}

export type PlanningDayTooltipSource = {
  effectiveStatus?: { code?: string; name?: string } | null;
  startTime?: string;
  endTime?: string;
  observation?: string;
  changeOrigin?: string;
  isManualOverride?: boolean;
  driverBlock?: PlanningDriverBlockSummary | null;
  appointment?: {
    appointmentReason?: string;
    permitType?: string;
    observation?: string;
    permitStartTime?: string;
    permitEndTime?: string;
  } | null;
};

function formatHours(start?: string, end?: string) {
  const a = start?.trim() ?? "";
  const b = end?.trim() ?? "";
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

function reasonLabel(value?: string) {
  const key = value?.trim().toLowerCase() ?? "";
  if (!key) return "";
  return reasonLabels.get(key) ?? value!.trim();
}

/** Texto corto para tooltip nativo (title) en celdas de la matriz. */
export function planningDayTooltip(day: PlanningDayTooltipSource): string {
  const parts: string[] = [];
  const code = day.effectiveStatus?.code ?? "";
  const name = day.effectiveStatus?.name ?? "Sin estado";

  parts.push(name);

  if (code === "TRABAJA") {
    const hours = formatHours(day.startTime, day.endTime);
    if (hours) parts.push(hours);
  }

  const appt = day.appointment;
  if (
    appt &&
    (code === "PERMISO" ||
      code === "VACACIONES" ||
      code === "OTRO" ||
      day.changeOrigin === "appointment")
  ) {
    const label = reasonLabel(appt.appointmentReason);
    if (label) parts.push(label);
    if (appt.permitType?.trim()) parts.push(appt.permitType.trim());
    const permitHours = formatHours(appt.permitStartTime, appt.permitEndTime);
    if (permitHours) parts.push(permitHours);
    if (appt.observation?.trim()) parts.push(appt.observation.trim());
  }

  if (code === "FERIADO") {
    parts.push("Feriado");
  }

  if (code === "BLOQUEADO") {
    const blockDetail = planningBlockDetailLabel(day.driverBlock);
    if (blockDetail) parts.push(blockDetail);
    const blockObservation =
      day.driverBlock?.observation?.trim() || day.observation?.trim() || "";
    if (blockObservation) parts.push(blockObservation);
    else parts.push("Bloqueo activo");
  }

  if (code === "LIBRE" || code === "TURNO_DIA_LIBRE") {
    parts.push("Día libre según turno");
  }

  if (day.observation?.trim() && !appt?.observation?.trim() && code !== "BLOQUEADO") {
    parts.push(day.observation.trim());
  }

  if (day.isManualOverride) {
    parts.push("Ajuste manual");
  }

  return [...new Set(parts.filter(Boolean))].join(" · ");
}
