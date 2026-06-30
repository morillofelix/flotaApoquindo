import { adminFetchInit } from "@/lib/admin-fetch";
import {
  displayVehicleNumber,
  type PropietarioConfig,
} from "@/lib/propietarios";

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

export const PAGO_EMAIL_MAX_ITEMS_PER_REQUEST = 100;

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

export const PROPIETARIO_PORTAL_URL = "https://apoquindo.aquivoyexpress.com/";

export function buildPortalAccessText() {
  return [
    "Para consultar el detalle de sus servicios, le invitamos a ingresar al siguiente enlace",
    "utilizando su correo electrónico y su clave de propietario o titular:",
    PROPIETARIO_PORTAL_URL,
  ].join(" ");
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
    credentials: adminFetchInit.credentials,
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

export function sortPagoLineItemsForComprobante<
  T extends { vehicleNumber: string; fullName: string },
>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftMobile = left.vehicleNumber.replace(/\D/g, "");
    const rightMobile = right.vehicleNumber.replace(/\D/g, "");

    if (leftMobile && rightMobile) {
      const mobileCompare = leftMobile.localeCompare(rightMobile, "es", {
        numeric: true,
      });

      if (mobileCompare !== 0) {
        return mobileCompare;
      }
    }

    return left.fullName.localeCompare(right.fullName, "es");
  });
}

export function mapPagoLineItemsToComprobantePdfItems(
  items: PagoPropietarioLineItem[],
) {
  return sortPagoLineItemsForComprobante(items).map((item) => ({
    vehicleNumber: item.vehicleNumber,
    fullName: item.fullName,
    titularName: item.titularName,
    titularEmail: item.titularEmail,
    amount: item.amount,
  }));
}

export async function sendPagoPropietarioEmailsBatched(
  payload: SendPagoPropietarioEmailPayload,
  options?: {
    onProgress?: (processedCount: number, totalCount: number) => void;
  },
) {
  if (!payload.items.length) {
    return [] as SendPagoPropietarioEmailResult[];
  }

  const results: SendPagoPropietarioEmailResult[] = [];

  for (
    let index = 0;
    index < payload.items.length;
    index += PAGO_EMAIL_MAX_ITEMS_PER_REQUEST
  ) {
    const chunk = payload.items.slice(
      index,
      index + PAGO_EMAIL_MAX_ITEMS_PER_REQUEST,
    );
    const chunkResults = await sendPagoPropietarioEmails({
      periodFrom: payload.periodFrom,
      periodTo: payload.periodTo,
      items: chunk,
    });

    results.push(...chunkResults);
    options?.onProgress?.(
      Math.min(index + chunk.length, payload.items.length),
      payload.items.length,
    );
  }

  return results;
}
