import { adminFetchInit } from "@/lib/admin-fetch";
import {
  type Appointment,
  type AppointmentReasonConfig,
  type ExecutiveConfig,
  defaultAppointmentReasons,
  defaultExecutives,
  formatRestrictedWeekdays,
  formatBusinessDayAdvanceSummary,
} from "@/lib/appointments";
import { type DriverOwnerConfig, type ShiftType } from "@/lib/driver-owners";
import { type PropietarioConfig } from "@/lib/propietarios";
import { type PropietarioBankConfig } from "@/lib/propietarios-banks";
import { type BlockReasonConfig } from "@/lib/block-reasons";
import { type OperationalStatusConfig } from "@/lib/operational-status";
import { type ShiftDefinitionConfig } from "@/lib/shift-definitions";
import { type ShiftPatternConfig } from "@/lib/shift-patterns";

export async function loadAppointments() {
  const response = await fetch("/api/appointments", {
    ...adminFetchInit,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar las solicitudes.");
  }

  const data = (await response.json()) as {
    appointments?: Appointment[];
    vehicleShiftByNumber?: Record<string, string>;
    vehicleShiftsByNumber?: Record<string, ShiftType[]>;
  };

  return {
    appointments: data.appointments ?? [],
    vehicleShiftByNumber: data.vehicleShiftByNumber ?? {},
    vehicleShiftsByNumber: data.vehicleShiftsByNumber ?? {},
  };
}

export async function loadAppointmentReasons() {
  const response = await fetch("/api/appointment-reasons", {
    ...adminFetchInit,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los motivos.");
  }

  const data = (await response.json()) as {
    reasons?: AppointmentReasonConfig[];
  };

  return data.reasons ?? defaultAppointmentReasons;
}

export async function loadExecutives() {
  const response = await fetch("/api/executives", {
    ...adminFetchInit,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los ejecutivos.");
  }

  const data = (await response.json()) as {
    executives?: ExecutiveConfig[];
  };

  return data.executives ?? defaultExecutives;
}

export async function loadDriverOwners() {
  const response = await fetch("/api/driver-owners", {
    ...adminFetchInit,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los conductores y propietarios.");
  }

  const data = (await response.json()) as {
    driverOwners?: DriverOwnerConfig[];
  };

  return data.driverOwners ?? [];
}

export async function loadPropietarios() {
  const response = await fetch("/api/propietarios", {
    ...adminFetchInit,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los propietarios.");
  }

  const data = (await response.json()) as {
    propietarios?: PropietarioConfig[];
  };

  return data.propietarios ?? [];
}

export async function loadPropietarioBanks() {
  const response = await fetch("/api/propietarios/banks", {
    ...adminFetchInit,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los bancos.");
  }

  const data = (await response.json()) as {
    banks?: PropietarioBankConfig[];
  };

  return data.banks ?? [];
}

export async function loadDriverGroups() {
  const response = await fetch("/api/driver-groups", {
    ...adminFetchInit,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los grupos.");
  }

  const data = (await response.json()) as {
    groups?: import("@/lib/driver-groups").DriverGroupConfig[];
  };

  return data.groups ?? [];
}

export async function loadDriverSubgroups(filters?: {
  groupId?: string;
  type?: string;
}) {
  const params = new URLSearchParams();

  if (filters?.groupId) {
    params.set("groupId", filters.groupId);
  }

  if (filters?.type) {
    params.set("type", filters.type);
  }

  const query = params.toString();
  const response = await fetch(
    `/api/driver-subgroups${query ? `?${query}` : ""}`,
    {
      ...adminFetchInit,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("No se pudieron cargar los subgrupos.");
  }

  const data = (await response.json()) as {
    subgroups?: import("@/lib/driver-groups").DriverSubgroupConfig[];
    types?: Array<{ value: string; label: string }>;
  };

  return {
    subgroups: data.subgroups ?? [],
    types: data.types ?? [],
  };
}

async function loadFleetConfig<T>(url: string, key: string, errorMessage: string) {
  const response = await fetch(url, { ...adminFetchInit, cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || errorMessage);
  }
  const data = (await response.json()) as Record<string, unknown>;
  return (Array.isArray(data[key]) ? data[key] : []) as T[];
}

export function loadShiftDefinitions() {
  return loadFleetConfig<ShiftDefinitionConfig>(
    "/api/shift-definitions",
    "shifts",
    "No se pudieron cargar los turnos.",
  );
}

export function loadShiftPatterns() {
  return loadFleetConfig<ShiftPatternConfig>(
    "/api/shift-patterns",
    "patterns",
    "No se pudieron cargar los patrones.",
  );
}

export function loadOperationalStatuses() {
  return loadFleetConfig<OperationalStatusConfig>(
    "/api/operational-statuses",
    "statuses",
    "No se pudieron cargar los estados operativos.",
  );
}

export function loadBlockReasons() {
  return loadFleetConfig<BlockReasonConfig>(
    "/api/block-reasons",
    "reasons",
    "No se pudieron cargar los motivos de bloqueo.",
  );
}

export async function loadMonthlySchedule(year: number, month: number) {
  const response = await fetch(
    `/api/monthly-schedules?year=${year}&month=${month}`,
    { ...adminFetchInit, cache: "no-store" },
  );
  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    schedule?: unknown;
    days?: unknown[];
    summary?: unknown;
  };
  if (!response.ok) {
    throw new Error(data.message || "No se pudo cargar la planificación.");
  }
  return {
    schedule: data.schedule ?? null,
    days: data.days ?? [],
    summary:
      data.summary ??
      ({ totalDays: 0, drivers: 0, manualOverrides: 0, byStatus: {} } as const),
  };
}

function escapeExcelHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatExcelBoolean(value: boolean) {
  return value ? "Sí" : "No";
}

function formatExcelActiveStatus(value: boolean) {
  return value ? "Activo" : "Inactivo";
}

function downloadExcelHtmlTable(htmlTable: string, fileName: string) {
  const blob = new Blob([htmlTable], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadAppointmentReasonsExcel(
  reasons: AppointmentReasonConfig[],
  fileName: string,
) {
  const tableRows = reasons
    .map(
      (reason) => `
        <tr>
          <td>${escapeExcelHtml(reason.label)}</td>
          <td>${escapeExcelHtml(reason.value)}</td>
          <td>${escapeExcelHtml(formatExcelBoolean(reason.allowsExecutiveAssignment))}</td>
          <td>${escapeExcelHtml(formatExcelBoolean(reason.usesDateRange))}</td>
          <td>${escapeExcelHtml(formatExcelBoolean(reason.usesPermitDetails))}</td>
          <td>${escapeExcelHtml(formatExcelBoolean(reason.usesDaySwap))}</td>
          <td>${escapeExcelHtml(formatExcelBoolean(reason.requiresObservation))}</td>
          <td>${escapeExcelHtml(formatExcelBoolean(reason.allowsAttachment))}</td>
          <td>${escapeExcelHtml(formatExcelBoolean(reason.requiresAttachment))}</td>
          <td>${escapeExcelHtml(formatExcelBoolean(reason.visibleToDriver !== false))}</td>
          <td>${escapeExcelHtml(formatExcelActiveStatus(reason.isActive))}</td>
          <td>${escapeExcelHtml(formatRestrictedWeekdays(reason.restrictedWeekdays))}</td>
          <td>${escapeExcelHtml(formatBusinessDayAdvanceSummary(reason.weekdayBusinessAdvance) || "—")}</td>
          <td>${escapeExcelHtml(String(reason.sortOrder))}</td>
        </tr>`,
    )
    .join("");

  const htmlTable = `
    <html>
      <head>
        <meta charset="UTF-8" />
      </head>
      <body>
        <table border="1">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Código</th>
              <th>Deriva</th>
              <th>Rango fechas</th>
              <th>Permiso horas/días</th>
              <th>Cambio de día</th>
              <th>Observación</th>
              <th>Adjuntar</th>
              <th>Adjunto obligatorio</th>
              <th>Visualiza conductor</th>
              <th>Estado</th>
              <th>Días restringidos</th>
              <th>Anticipación por día</th>
              <th>Orden</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>`;

  downloadExcelHtmlTable(htmlTable, fileName);
}

export function downloadExecutivesExcel(
  executives: ExecutiveConfig[],
  fileName: string,
) {
  const tableRows = executives
    .map(
      (executive) => `
        <tr>
          <td>${escapeExcelHtml(executive.name)}</td>
          <td>${escapeExcelHtml(executive.email)}</td>
          <td>${escapeExcelHtml(formatExcelActiveStatus(executive.isActive))}</td>
          <td>${escapeExcelHtml(executive.dailyLimitEnabled ? "Sí" : "No")}</td>
          <td>${escapeExcelHtml(executive.dailyLimitEnabled && executive.dailyLimitMax !== null ? String(executive.dailyLimitMax) : "")}</td>
          <td>${escapeExcelHtml(executive.lunchBreakEnabled ? "Sí" : "No")}</td>
          <td>${escapeExcelHtml(executive.lunchBreakEnabled ? executive.lunchBreakStart : "")}</td>
          <td>${escapeExcelHtml(executive.lunchBreakEnabled ? executive.lunchBreakEnd : "")}</td>
          <td>${escapeExcelHtml(String(executive.sortOrder))}</td>
        </tr>`,
    )
    .join("");

  const htmlTable = `
    <html>
      <head>
        <meta charset="UTF-8" />
      </head>
      <body>
        <table border="1">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Estado</th>
              <th>Tope diario activo</th>
              <th>Máximo por día</th>
              <th>Colación activa</th>
              <th>Colación desde</th>
              <th>Colación hasta</th>
              <th>Orden</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>`;

  downloadExcelHtmlTable(htmlTable, fileName);
}
