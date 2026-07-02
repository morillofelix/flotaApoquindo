import { adminFetchInit } from "@/lib/admin-fetch";
import {
  type Appointment,
  type AppointmentReasonConfig,
  type ExecutiveConfig,
  defaultAppointmentReasons,
  defaultExecutives,
  formatRestrictedWeekdays,
} from "@/lib/appointments";
import { type DriverOwnerConfig } from "@/lib/driver-owners";
import { type PropietarioConfig } from "@/lib/propietarios";
import { type PropietarioBankConfig } from "@/lib/propietarios-banks";

export async function loadAppointments() {
  const response = await fetch("/api/appointments", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar las solicitudes.");
  }

  const data = (await response.json()) as { appointments?: Appointment[] };
  return data.appointments ?? [];
}

export async function loadAppointmentReasons() {
  const response = await fetch("/api/appointment-reasons", {
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
    cache: "no-store",
    credentials: adminFetchInit.credentials,
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
    cache: "no-store",
    credentials: adminFetchInit.credentials,
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los bancos.");
  }

  const data = (await response.json()) as {
    banks?: PropietarioBankConfig[];
  };

  return data.banks ?? [];
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
          <td>${escapeExcelHtml(formatExcelActiveStatus(reason.isActive))}</td>
          <td>${escapeExcelHtml(formatRestrictedWeekdays(reason.restrictedWeekdays))}</td>
          <td>${escapeExcelHtml(reason.requiresBusinessDayAdvance ? "Sí" : "No")}</td>
          <td>${escapeExcelHtml(reason.requiresBusinessDayAdvance ? String(reason.businessDaysAdvance) : "0")}</td>
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
              <th>Estado</th>
              <th>Días restringidos</th>
              <th>Anticip. activa</th>
              <th>Días háb. anticip.</th>
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
