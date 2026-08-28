import type { OperationalStatusConfig } from "@/lib/operational-status";

export type MonthlyPlanningCalendarDay = {
  day: number;
  date: string;
  weekday: string;
  weekend: boolean;
};

export type MonthlyPlanningExportDay = {
  effectiveStatus: { code: string; color: string } | null;
  observation?: string;
};

export type MonthlyPlanningExportRow = {
  vehicle: string;
  driverName: string;
  groupName: string;
  shift: string;
  observation: string;
  byDate: Map<string, MonthlyPlanningExportDay | null | undefined>;
};

type ExportParams = {
  rows: MonthlyPlanningExportRow[];
  calendarDays: MonthlyPlanningCalendarDay[];
  holidayDates: Set<string>;
  todayDate: string;
  statuses: OperationalStatusConfig[];
  year: number;
  month: number;
};

const COLORS = {
  headerBlue: "#D7E7F8",
  headerText: "#0F2747",
  border: "#B7CCE4",
  weekendHeader: "#E2E8F0",
  weekendCell: "#F8FAFC",
  holidayHeader: "#FECDD3",
  todayHeader: "#FDE68A",
  white: "#FFFFFF",
  mutedText: "#94A3B8",
  defaultStatus: "#64748B",
} as const;

const STICKY_HEADERS = ["Móvil", "Conductor", "Grupo", "Turno", "Observación"] as const;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeHex(color: string) {
  const value = color.trim().replace("#", "");
  return value.length === 6 ? `#${value.toUpperCase()}` : COLORS.defaultStatus;
}

function blendWithWhite(hex: string, amount: number) {
  const normalized = normalizeHex(hex).slice(1);
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const mix = (channel: number) =>
    Math.round(channel * amount + 255 * (1 - amount));

  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function styleAttr(styles: Record<string, string>) {
  return ` style="${Object.entries(styles)
    .map(([key, value]) => `${key}:${value}`)
    .join(";")}"`;
}

function headerFillForDay(
  date: string,
  weekend: boolean,
  holidayDates: Set<string>,
  todayDate: string,
) {
  if (holidayDates.has(date)) {
    return COLORS.holidayHeader;
  }
  if (date === todayDate) {
    return COLORS.todayHeader;
  }
  if (weekend) {
    return COLORS.weekendHeader;
  }
  return COLORS.headerBlue;
}

function stickyHeaderStyle() {
  return styleAttr({
    "background-color": COLORS.headerBlue,
    color: COLORS.headerText,
    "font-weight": "700",
    "text-align": "center",
    "vertical-align": "middle",
    border: `1px solid ${COLORS.border}`,
    padding: "4px 6px",
    "white-space": "nowrap",
  });
}

function stickyBodyStyle(align: "left" | "center" = "left") {
  return styleAttr({
    "background-color": COLORS.white,
    color: COLORS.headerText,
    "text-align": align,
    "vertical-align": "middle",
    border: `1px solid ${COLORS.border}`,
    padding: "3px 6px",
  });
}

function dayHeaderStyle(
  date: string,
  weekend: boolean,
  holidayDates: Set<string>,
  todayDate: string,
) {
  return styleAttr({
    "background-color": headerFillForDay(date, weekend, holidayDates, todayDate),
    color: COLORS.headerText,
    "font-weight": "700",
    "text-align": "center",
    "vertical-align": "middle",
    border: `1px solid ${COLORS.border}`,
    padding: "4px 2px",
    "white-space": "pre-line",
    "min-width": "34px",
  });
}

function statusCellStyle(color: string | undefined) {
  const statusColor = normalizeHex(color ?? COLORS.defaultStatus);

  return styleAttr({
    "background-color": blendWithWhite(statusColor, 0.125),
    color: statusColor,
    "font-weight": "700",
    "text-align": "center",
    "vertical-align": "middle",
    border: `1px solid ${statusColor}88`,
    padding: "3px 2px",
    "white-space": "nowrap",
  });
}

function emptyDayStyle(weekend: boolean) {
  return styleAttr({
    "background-color": weekend ? COLORS.weekendCell : COLORS.white,
    color: COLORS.mutedText,
    "text-align": "center",
    "vertical-align": "middle",
    border: `1px solid ${COLORS.border}`,
    padding: "3px 2px",
  });
}

function buildLegendTable(statuses: OperationalStatusConfig[]) {
  const rows = statuses
    .filter((status) => status.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (status) => `
        <tr>
          <td${statusCellStyle(status.color)}>${escapeHtml(status.code)}</td>
          <td${stickyBodyStyle()}>${escapeHtml(status.name)}</td>
          <td${statusCellStyle(status.color)}>${escapeHtml(status.code)}</td>
        </tr>`,
    )
    .join("");

  return `
    <table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:24px;">
      <thead>
        <tr>
          <th colspan="3"${stickyHeaderStyle()}>Leyenda de estados</th>
        </tr>
        <tr>
          <th${stickyHeaderStyle()}>Código</th>
          <th${stickyHeaderStyle()}>Nombre</th>
          <th${stickyHeaderStyle()}>Muestra</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export async function downloadMonthlyPlanningExcel({
  rows,
  calendarDays,
  holidayDates,
  todayDate,
  statuses,
  year,
  month,
}: ExportParams) {
  const headerCells = [
    ...STICKY_HEADERS.map(
      (label) => `<th${stickyHeaderStyle()}>${escapeHtml(label)}</th>`,
    ),
    ...calendarDays.map(
      (column) =>
        `<th${dayHeaderStyle(column.date, column.weekend, holidayDates, todayDate)}>${escapeHtml(`${column.day}\n${column.weekday}`)}</th>`,
    ),
  ].join("");

  const bodyRows = rows
    .map((row) => {
      const stickyCells = [
        `<td${stickyBodyStyle("center")}>${escapeHtml(row.vehicle)}</td>`,
        `<td${stickyBodyStyle()}>${escapeHtml(row.driverName)}</td>`,
        `<td${stickyBodyStyle()}>${escapeHtml(row.groupName)}</td>`,
        `<td${stickyBodyStyle()}>${escapeHtml(row.shift)}</td>`,
        `<td${stickyBodyStyle()}>${escapeHtml(row.observation || "—")}</td>`,
      ].join("");

      const dayCells = calendarDays
        .map((column) => {
          const day = row.byDate.get(column.date);
          const code = day?.effectiveStatus?.code ?? "";

          if (code) {
            return `<td${statusCellStyle(day?.effectiveStatus?.color)}>${escapeHtml(code)}</td>`;
          }

          return `<td${emptyDayStyle(column.weekend)}>—</td>`;
        })
        .join("");

      return `<tr>${stickyCells}${dayCells}</tr>`;
    })
    .join("");

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Planificación</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt; }
          td, th { mso-number-format:"\\@"; }
        </style>
      </head>
      <body>
        <table border="1" cellspacing="0" cellpadding="0">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
        ${buildLegendTable(statuses)}
      </body>
    </html>`;

  const blob = new Blob([html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `planificacion-${year}-${String(month).padStart(2, "0")}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}
