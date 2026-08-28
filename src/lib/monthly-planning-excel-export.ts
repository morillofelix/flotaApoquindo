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
  headerBlue: "D7E7F8",
  headerText: "0F2747",
  border: "B7CCE4",
  weekendHeader: "E2E8F0",
  weekendCell: "F8FAFC",
  holidayHeader: "FECDD3",
  todayHeader: "FDE68A",
  white: "FFFFFF",
  groupHeader: "EEF3F9",
  defaultStatus: "64748B",
} as const;

const STICKY_HEADERS = ["Móvil", "Conductor", "Grupo", "Turno", "Observación"] as const;

function normalizeHex(color: string) {
  const value = color.trim().replace("#", "");
  return value.length === 6 ? value.toUpperCase() : COLORS.defaultStatus;
}

function blendWithWhite(hex: string, amount: number) {
  const normalized = normalizeHex(hex);
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const mix = (channel: number) =>
    Math.round(channel * amount + 255 * (1 - amount));
  const toHex = (channel: number) => channel.toString(16).padStart(2, "0");

  return `${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`.toUpperCase();
}

function cellStyle(options: {
  fill?: string;
  fontColor?: string;
  bold?: boolean;
  horizontal?: "left" | "center" | "right";
  border?: boolean;
}) {
  const border = options.border
    ? {
        top: { style: "thin", color: { rgb: COLORS.border } },
        bottom: { style: "thin", color: { rgb: COLORS.border } },
        left: { style: "thin", color: { rgb: COLORS.border } },
        right: { style: "thin", color: { rgb: COLORS.border } },
      }
    : undefined;

  return {
    fill: options.fill
      ? {
          patternType: "solid",
          fgColor: { rgb: options.fill },
        }
      : undefined,
    font: {
      bold: options.bold ?? false,
      color: { rgb: options.fontColor ?? COLORS.headerText },
      sz: 10,
    },
    alignment: {
      horizontal: options.horizontal ?? "center",
      vertical: "center",
      wrapText: true,
    },
    border,
  };
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

function statusCellStyle(color: string | undefined) {
  const statusColor = normalizeHex(color ?? COLORS.defaultStatus);

  return cellStyle({
    fill: blendWithWhite(statusColor, 0.125),
    fontColor: statusColor,
    bold: true,
    border: true,
  });
}

function statusDisplayCode(code: string) {
  if (!code) {
    return "—";
  }
  return code.length <= 4 ? code : code.slice(0, 1);
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
  const XLSX = await import("xlsx-js-style");

  const headerRow = [
    ...STICKY_HEADERS,
    ...calendarDays.map((column) => `${column.day}\n${column.weekday}`),
  ];

  const bodyRows = rows.map((row) => [
    row.vehicle,
    row.driverName,
    row.groupName,
    row.shift,
    row.observation || "—",
    ...calendarDays.map((column) => {
      const day = row.byDate.get(column.date);
      const code = day?.effectiveStatus?.code ?? "";
      return code ? statusDisplayCode(code) : "—";
    }),
  ]);

  const sheetData = [headerRow, ...bodyRows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const columnWidths = [
    { wch: 8 },
    { wch: 24 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    ...calendarDays.map(() => ({ wch: 5 })),
  ];
  worksheet["!cols"] = columnWidths;

  const stickyHeaderStyle = cellStyle({
    fill: COLORS.headerBlue,
    fontColor: COLORS.headerText,
    bold: true,
    border: true,
  });

  const stickyBodyStyle = cellStyle({
    fill: COLORS.white,
    fontColor: COLORS.headerText,
    horizontal: "left",
    border: true,
  });

  for (let columnIndex = 0; columnIndex < headerRow.length; columnIndex += 1) {
    const headerRef = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    const headerCell = worksheet[headerRef];
    if (!headerCell) {
      continue;
    }

    if (columnIndex < STICKY_HEADERS.length) {
      headerCell.s = stickyHeaderStyle;
      continue;
    }

    const dayColumn = calendarDays[columnIndex - STICKY_HEADERS.length];
    if (!dayColumn) {
      continue;
    }
    headerCell.s = cellStyle({
      fill: headerFillForDay(
        dayColumn.date,
        dayColumn.weekend,
        holidayDates,
        todayDate,
      ),
      fontColor: COLORS.headerText,
      bold: true,
      border: true,
    });
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) {
      continue;
    }
    const sheetRowIndex = rowIndex + 1;

    for (let columnIndex = 0; columnIndex < STICKY_HEADERS.length; columnIndex += 1) {
      const ref = XLSX.utils.encode_cell({ r: sheetRowIndex, c: columnIndex });
      const cell = worksheet[ref];
      if (cell) {
        cell.s = stickyBodyStyle;
      }
    }

    for (let dayIndex = 0; dayIndex < calendarDays.length; dayIndex += 1) {
      const column = calendarDays[dayIndex];
      if (!column) {
        continue;
      }
      const columnIndex = STICKY_HEADERS.length + dayIndex;
      const ref = XLSX.utils.encode_cell({ r: sheetRowIndex, c: columnIndex });
      const cell = worksheet[ref];
      if (!cell) {
        continue;
      }

      const day = row.byDate.get(column.date);
      const statusColor = day?.effectiveStatus?.color;

      if (day?.effectiveStatus?.code) {
        cell.s = statusCellStyle(statusColor);
        continue;
      }

      cell.s = cellStyle({
        fill: column.weekend ? COLORS.weekendCell : COLORS.white,
        fontColor: "94A3B8",
        border: true,
      });
    }
  }

  worksheet["!rows"] = [{ hpt: 28 }];

  const legendRows: Array<Array<string>> = [
    [],
    ["Leyenda de estados"],
    ["Código", "Nombre", "Muestra"],
    ...statuses
      .filter((status) => status.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((status) => [status.code, status.name, status.code]),
  ];

  const legendSheet = XLSX.utils.aoa_to_sheet(legendRows);
  legendSheet["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 10 }];

  for (let rowIndex = 3; rowIndex < legendRows.length; rowIndex += 1) {
    const statusCode = legendRows[rowIndex]?.[0];
    const status = statuses.find((item) => item.code === statusCode);
    if (!status) {
      continue;
    }

    const codeRef = XLSX.utils.encode_cell({ r: rowIndex, c: 0 });
    const nameRef = XLSX.utils.encode_cell({ r: rowIndex, c: 1 });
    const sampleRef = XLSX.utils.encode_cell({ r: rowIndex, c: 2 });
    const styled = statusCellStyle(status.color);

    if (legendSheet[codeRef]) legendSheet[codeRef].s = styled;
    if (legendSheet[nameRef]) {
      legendSheet[nameRef].s = cellStyle({
        fill: COLORS.white,
        fontColor: COLORS.headerText,
        horizontal: "left",
        border: true,
      });
    }
    if (legendSheet[sampleRef]) {
      legendSheet[sampleRef].s = styled;
    }
  }

  if (legendSheet.A2) {
    legendSheet.A2.s = cellStyle({
      fill: COLORS.headerBlue,
      fontColor: COLORS.headerText,
      bold: true,
      horizontal: "left",
      border: true,
    });
  }
  for (const columnIndex of [0, 1, 2]) {
    const ref = XLSX.utils.encode_cell({ r: 2, c: columnIndex });
    if (legendSheet[ref]) {
      legendSheet[ref].s = stickyHeaderStyle;
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Planificación");
  XLSX.utils.book_append_sheet(workbook, legendSheet, "Leyenda");
  XLSX.writeFile(
    workbook,
    `planificacion-${year}-${String(month).padStart(2, "0")}.xlsx`,
  );
}
