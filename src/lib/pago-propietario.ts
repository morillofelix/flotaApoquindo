import type { PropietarioConfig } from "@/lib/propietarios";
import { displayVehicleNumber } from "@/lib/propietarios";

export type PagoPropietarioLineItem = {
  id: string;
  propietarioId: string;
  vehicleNumber: string;
  fullName: string;
  titularName: string;
  titularEmail: string;
  amount: number;
  sent: boolean;
  sending: boolean;
  sendError: string;
};

export type SendPagoPropietarioEmailItem = {
  id: string;
  to: string;
  titularName: string;
  amount: number;
};

export type SendPagoPropietarioEmailPayload = {
  periodFrom: string;
  periodTo: string;
  items: SendPagoPropietarioEmailItem[];
};

export type SendPagoPropietarioEmailResult = {
  id: string;
  ok: boolean;
  messageId?: string;
  error?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function formatPagoDate(value: string) {
  if (!value) {
    return "";
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function formatPagoAmount(amount: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function parsePagoAmountInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return 0;
  }

  return Number(digits);
}

export function getTitularName(propietario: PropietarioConfig) {
  return propietario.accountHolder.trim() || propietario.fullName.trim();
}

export function getTitularEmail(propietario: PropietarioConfig) {
  return propietario.titularEmail.trim() || propietario.email.trim();
}

export function isValidEmail(value: string) {
  return emailPattern.test(value.trim());
}

export function buildComprobanteMessage(input: {
  titularName: string;
  amount: number;
  periodFrom: string;
  periodTo: string;
}) {
  const periodLabel =
    input.periodFrom && input.periodTo
      ? ` correspondiente al período del ${formatPagoDate(input.periodFrom)} al ${formatPagoDate(input.periodTo)},`
      : "";

  return `Estimado titular ${input.titularName},${periodLabel} su monto a facturar es ${formatPagoAmount(input.amount)}.`;
}

export function getPropietarioKey(propietario: PropietarioConfig) {
  return (
    propietario.id ??
    propietario.importKey ??
    `${propietario.vehicleNumber}-${propietario.rut}`
  );
}

export function createPagoLineItem(
  propietario: PropietarioConfig,
  amount: number,
): PagoPropietarioLineItem {
  return {
    id: crypto.randomUUID(),
    propietarioId: getPropietarioKey(propietario),
    vehicleNumber: displayVehicleNumber(propietario.vehicleNumber),
    fullName: propietario.fullName,
    titularName: getTitularName(propietario),
    titularEmail: getTitularEmail(propietario),
    amount,
    sent: false,
    sending: false,
    sendError: "",
  };
}

export async function sendPagoPropietarioEmails(
  payload: SendPagoPropietarioEmailPayload,
) {
  const response = await fetch("/api/send-pago-propietario-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    results?: SendPagoPropietarioEmailResult[];
  };

  if (!response.ok) {
    throw new Error(data.message ?? "No se pudieron enviar los correos.");
  }

  return data.results ?? [];
}
