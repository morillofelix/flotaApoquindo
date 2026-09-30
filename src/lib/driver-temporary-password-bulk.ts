import {
  getTemporaryPasswordFromRut,
  type DriverOwnerConfig,
} from "@/lib/driver-owners";

/**
 * El hosting suspende la casilla cita@ si detecta envío masivo (ocurrió con
 * 160 correos a 1 cada 5 s). Mantener tandas chicas y pausas largas.
 */
export const DRIVER_TEMP_PASSWORD_BULK_DELAY_MS = 60_000;
export const DRIVER_TEMP_PASSWORD_BULK_MAX = 20;

/** Usa el mismo endpoint y correo PWA que el envío individual en Datos generales. */

export type DriverTemporaryPasswordSendResult = {
  id: string;
  ok: boolean;
  message?: string;
  error?: string;
};

export function isDriverTemporaryPasswordEligible(
  driverOwner: DriverOwnerConfig,
) {
  return Boolean(
    driverOwner.id &&
      driverOwner.isConductor &&
      driverOwner.email.trim() &&
      getTemporaryPasswordFromRut(driverOwner.rut),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendDriverTemporaryPasswordsBatched(
  driverOwnerIds: string[],
  options?: {
    onProgress?: (processedCount: number, totalCount: number) => void;
    delayMs?: number;
  },
) {
  if (!driverOwnerIds.length) {
    return [] as DriverTemporaryPasswordSendResult[];
  }

  const results: DriverTemporaryPasswordSendResult[] = [];
  const delayMs = options?.delayMs ?? DRIVER_TEMP_PASSWORD_BULK_DELAY_MS;
  const totalCount = driverOwnerIds.length;

  for (let index = 0; index < driverOwnerIds.length; index += 1) {
    const driverOwnerId = driverOwnerIds[index];

    if (!driverOwnerId) {
      continue;
    }

    try {
      const response = await fetch("/api/driver-owners/temporary-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ driverOwnerId }),
      });

      const data = (await response.json()) as {
        message?: string;
        detail?: string;
      };

      if (!response.ok) {
        results.push({
          id: driverOwnerId,
          ok: false,
          error:
            [data.message, data.detail].filter(Boolean).join(" — ") ||
            "No se pudo enviar la clave de acceso.",
        });
      } else {
        results.push({
          id: driverOwnerId,
          ok: true,
          message: data.message,
        });
      }
    } catch (error) {
      results.push({
        id: driverOwnerId,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo enviar la clave de acceso.",
      });
    }

    options?.onProgress?.(index + 1, totalCount);

    if (index < driverOwnerIds.length - 1) {
      await sleep(delayMs);
    }
  }

  return results;
}
