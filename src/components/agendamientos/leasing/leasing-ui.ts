import { adminFetchInit } from "@/lib/admin-fetch";

export const leasingInputClass =
  "h-9 w-full rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 disabled:bg-slate-50 disabled:text-slate-500";

export const leasingTextareaClass =
  "w-full rounded-2xl border border-[#9fb8d9] bg-white px-3 py-2 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

export const leasingLabelClass = "text-xs font-semibold text-[#173b68]";

export const leasingPrimaryButton =
  "inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60";

export const leasingSecondaryButton =
  "inline-flex h-9 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-4 text-xs font-semibold text-[#173b68] transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60";

export const leasingDangerButton =
  "inline-flex h-9 items-center justify-center rounded-2xl border border-red-200 bg-white px-4 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60";

export const leasingBadgeClass =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold";

export async function leasingFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...adminFetchInit, cache: "no-store", ...init });
  const data = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null;

  if (!response.ok) {
    throw new Error(data?.message || "No se pudo completar la operación.");
  }

  return data as T;
}

export function leasingJsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function formatMontoInput(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? new Intl.NumberFormat("es-CL").format(Number(digits)) : "";
}

export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
