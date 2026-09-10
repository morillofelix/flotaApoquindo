import ExcelJS from "exceljs";

export type SpecialShiftCalendarDay = {
  day: number;
  date: string;
  weekday: string;
  weekend: boolean;
};

export type SpecialShiftExportDay = {
  effectiveStatus: { code: string; color: string } | null;
  shift?: { code?: string; name?: string } | null;
};

export type SpecialShiftExportRow = {
  vehicle: string;
  driverName: string;
  groupName: string;
  shift: string;
  observation: string;
  byDate: Map<string, SpecialShiftExportDay | null | undefined>;
};

type ExportParams = {
  rows: SpecialShiftExportRow[];
  calendarDays: SpecialShiftCalendarDay[];
  year: number;
  month: number;
};

const GRID_COLS = 19;
const BLOCK_GAP = 2;

const COLORS = {
  border: "FF000000",
  yellow: "FFFFFF00",
  red: "FFFF0000",
  headerBlue: "FFD7E7F8",
  headerText: "FF0F2747",
  legendYellow: "FFFFFF00",
  legendBlue: "FF9DC3E6",
  legendGreen: "FFA9D08E",
  legendPurple: "FF8EA9DB",
  legendBrown: "FFC65911",
  legendOrange: "FFED7D31",
} as const;

const LEGEND_ITEMS: Array<{ color: string; text: string }> = [
  {
    color: COLORS.legendYellow,
    text: "SOLO REALIZAN TURNO LOS DIAS SABADOS",
  },
  {
    color: COLORS.legendBlue,
    text: "SOLO REALIZAN TURNO LOS DIAS DOMINGOS",
  },
  {
    color: COLORS.legendGreen,
    text: "NO REALIZAN TURNO FINES DE SEMANA NI FERIADOS POR UN LAPSO DE TIEMPO, AUTORIZADO POR GERENCIA",
  },
  {
    color: COLORS.legendPurple,
    text: "REALIZAN TURNO FINES DE SEMANA Y FERIADOS, PERO CON CALENDARIOS ESPECIALES, AUTORIZADOS POR GERENCIA",
  },
  {
    color: COLORS.legendBrown,
    text: "NO REALIZAN TURNO LOS FINES DE SEMANA SOLO REALIZAN TURNO LOS FERIADOS, SIEMPRE Y CUANDO LE CORRESPONDA A SU TURNO",
  },
  {
    color: COLORS.legendOrange,
    text: "NO REALIZAN TURNO LOS FINES DE SEMANA NI FERIADOS",
  },
];

type GridRow =
  | { type: "data"; cells: string[] }
  | { type: "yellow"; cells: string[] };

type ShiftBlock = {
  title: string;
  vehicles: string[];
  startCol: number;
  gridRows: GridRow[];
};

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function compareVehicle(a: string, b: string) {
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

function resolveShiftLabel(
  row: SpecialShiftExportRow,
  day: SpecialShiftExportDay | null | undefined,
) {
  const fromDay = day?.shift?.name || day?.shift?.code || "";
  const label = (fromDay || row.shift || "Sin turno").trim();
  return label || "Sin turno";
}

function formatBlockTitle(date: string, dayNumber: number, shiftLabel: string) {
  const parsed = new Date(`${date}T12:00:00`);
  const weekday = stripAccents(
    new Intl.DateTimeFormat("es-CL", { weekday: "long" }).format(parsed),
  ).toUpperCase();
  const shift = stripAccents(shiftLabel).toUpperCase();
  return `${weekday} ${dayNumber} ${shift}`;
}

function vehicleNumber(vehicle: string) {
  const digits = vehicle.replace(/\D/g, "");
  const value = Number.parseInt(digits || "NaN", 10);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/** Agrupa por centena: 001-099, 100-199, 200-299, … */
function vehicleHundredsBucket(vehicle: string) {
  const value = vehicleNumber(vehicle);
  if (!Number.isFinite(value)) return Number.MAX_SAFE_INTEGER;
  return Math.floor(value / 100);
}

function buildGridRows(vehicles: string[]): GridRow[] {
  const byHundreds = new Map<number, string[]>();

  for (const vehicle of vehicles) {
    const bucket = vehicleHundredsBucket(vehicle);
    const list = byHundreds.get(bucket) ?? [];
    list.push(vehicle);
    byHundreds.set(bucket, list);
  }

  const buckets = [...byHundreds.keys()].sort((a, b) => a - b);
  const rows: GridRow[] = [];

  buckets.forEach((bucket, bucketIndex) => {
    const groupVehicles = (byHundreds.get(bucket) ?? []).sort(compareVehicle);

    for (let index = 0; index < groupVehicles.length; index += GRID_COLS) {
      rows.push({
        type: "data",
        cells: groupVehicles.slice(index, index + GRID_COLS),
      });
    }

    const hasMoreBuckets = bucketIndex < buckets.length - 1;
    if (hasMoreBuckets) {
      rows.push({
        type: "yellow",
        cells: Array.from({ length: GRID_COLS }, () => ""),
      });
    }
  });

  return rows;
}

function buildBlocks(
  rows: SpecialShiftExportRow[],
  calendarDays: SpecialShiftCalendarDay[],
): ShiftBlock[] {
  const blocks: Array<Omit<ShiftBlock, "startCol" | "gridRows">> = [];

  for (const column of calendarDays) {
    const byShift = new Map<string, string[]>();

    for (const row of rows) {
      const day = row.byDate.get(column.date);
      if (!day) continue;

      const shiftLabel = resolveShiftLabel(row, day);
      const list = byShift.get(shiftLabel) ?? [];
      list.push(row.vehicle);
      byShift.set(shiftLabel, list);
    }

    const shiftEntries = [...byShift.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "es", { sensitivity: "base" }),
    );

    for (const [shiftLabel, vehicles] of shiftEntries) {
      const uniqueSorted = [...new Set(vehicles)].sort(compareVehicle);
      if (!uniqueSorted.length) continue;
      blocks.push({
        title: formatBlockTitle(column.date, column.day, shiftLabel),
        vehicles: uniqueSorted,
      });
    }
  }

  return blocks.map((block, index) => ({
    ...block,
    startCol: index * (GRID_COLS + BLOCK_GAP) + 1,
    gridRows: buildGridRows(block.vehicles),
  }));
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: COLORS.border } },
    left: { style: "thin", color: { argb: COLORS.border } },
    bottom: { style: "thin", color: { argb: COLORS.border } },
    right: { style: "thin", color: { argb: COLORS.border } },
  };
}

/** Texto puro para IDs de móvil: Excel no los interpreta como número ni los suma. */
function setVehicleIdCell(cell: ExcelJS.Cell, vehicle: string) {
  // Prefijo invisible + formato texto: bloquea conversión numérica y AutoSum.
  cell.value = vehicle ? `\u200B${String(vehicle)}` : "";
  cell.numFmt = "@";
  cell.alignment = { vertical: "middle", horizontal: "center" };
  cell.font = { name: "Arial", size: 10 };
  cell.border = thinBorder();
}

/** Cantidad de móviles (conteo), no suma de IDs. */
function setMobileCountCell(cell: ExcelJS.Cell, count: number) {
  cell.value = count;
  cell.numFmt = "0";
  cell.alignment = { vertical: "middle", horizontal: "center" };
  cell.font = {
    name: "Arial",
    size: 12,
    bold: true,
    color: { argb: COLORS.red },
  };
}

function setTextCell(
  cell: ExcelJS.Cell,
  value: string,
  options?: {
    bold?: boolean;
    size?: number;
    color?: string;
    fill?: string;
    align?: "left" | "center";
    border?: boolean;
  },
) {
  cell.value = String(value);
  cell.numFmt = "@";
  cell.alignment = {
    vertical: "middle",
    horizontal: options?.align ?? "center",
  };
  cell.font = {
    name: "Arial",
    size: options?.size ?? 10,
    bold: Boolean(options?.bold),
    color: options?.color ? { argb: options.color } : undefined,
  };
  if (options?.fill) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: options.fill },
    };
  }
  if (options?.border !== false) {
    cell.border = thinBorder();
  }
}

function buildLinearSheet(
  workbook: ExcelJS.Workbook,
  rows: SpecialShiftExportRow[],
) {
  const sheet = workbook.addWorksheet("Móviles", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { width: 10 },
    { width: 28 },
    { width: 18 },
    { width: 16 },
    { width: 24 },
  ];

  const headers = ["Móvil", "Conductor", "Grupo", "Turno", "Observación"];
  headers.forEach((header, index) => {
    setTextCell(sheet.getCell(1, index + 1), header, {
      bold: true,
      fill: COLORS.headerBlue,
      color: COLORS.headerText,
    });
  });

  rows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    setVehicleIdCell(sheet.getCell(excelRow, 1), row.vehicle);
    setTextCell(sheet.getCell(excelRow, 2), row.driverName, { align: "left" });
    setTextCell(sheet.getCell(excelRow, 3), row.groupName, { align: "left" });
    setTextCell(sheet.getCell(excelRow, 4), row.shift, { align: "left" });
    setTextCell(sheet.getCell(excelRow, 5), row.observation || "—", {
      align: "left",
    });
  });
}

function buildGridSheet(workbook: ExcelJS.Workbook, blocks: ShiftBlock[]) {
  const sheet = workbook.addWorksheet("Turno especial");

  if (!blocks.length) {
    setTextCell(sheet.getCell(1, 1), "Sin móviles para los días seleccionados.", {
      align: "left",
      border: false,
    });
    return;
  }

  const maxGridRows = Math.max(...blocks.map((block) => block.gridRows.length));
  const titleRow = 1;
  const gridStartRow = 2;
  const gridEndRow = gridStartRow + maxGridRows - 1;
  const totalRow = gridEndRow + 2;
  const legendStartRow = totalRow + 2;
  const lastBlock = blocks[blocks.length - 1]!;
  const totalCols = lastBlock.startCol + GRID_COLS - 1;

  for (let col = 1; col <= totalCols; col += 1) {
    sheet.getColumn(col).width = 5;
  }

  for (const block of blocks) {
    const start = block.startCol;
    const end = block.startCol + GRID_COLS - 1;
    sheet.mergeCells(titleRow, start, titleRow, end);
    const titleCell = sheet.getCell(titleRow, start);
    setTextCell(titleCell, block.title, {
      bold: true,
      size: 16,
      align: "left",
      border: false,
    });
  }

  for (let rowOffset = 0; rowOffset < maxGridRows; rowOffset += 1) {
    const excelRow = gridStartRow + rowOffset;

    for (const block of blocks) {
      const gridRow = block.gridRows[rowOffset];

      for (let colOffset = 0; colOffset < GRID_COLS; colOffset += 1) {
        const col = block.startCol + colOffset;
        const cell = sheet.getCell(excelRow, col);

        if (!gridRow) {
          setVehicleIdCell(cell, "");
          continue;
        }

        if (gridRow.type === "yellow") {
          setTextCell(cell, "", { fill: COLORS.yellow });
          continue;
        }

        const vehicle = gridRow.cells[colOffset] ?? "";
        setVehicleIdCell(cell, vehicle);
      }
    }
  }

  // Separador en texto (no vacío numérico): evita AutoSum de Excel.
  for (const block of blocks) {
    for (let colOffset = 0; colOffset < GRID_COLS; colOffset += 1) {
      setTextCell(
        sheet.getCell(totalRow - 1, block.startCol + colOffset),
        "\u00A0",
        { border: false },
      );
    }
  }

  for (const block of blocks) {
    // CONTEO de móviles del turno (ej. 119). Nunca suma de IDs (300+500…).
    setMobileCountCell(
      sheet.getCell(totalRow, block.startCol),
      block.vehicles.length,
    );

    const labelStart = block.startCol + 1;
    const labelEnd = Math.min(block.startCol + 5, block.startCol + GRID_COLS - 1);
    if (labelEnd > labelStart) {
      sheet.mergeCells(totalRow, labelStart, totalRow, labelEnd);
    }
    setTextCell(sheet.getCell(totalRow, labelStart), "*Total Móviles*", {
      bold: true,
      size: 11,
      align: "left",
      border: false,
    });
  }

  LEGEND_ITEMS.forEach((item, index) => {
    const excelRow = legendStartRow + index;
    setTextCell(sheet.getCell(excelRow, 1), "", { fill: item.color });
    sheet.mergeCells(excelRow, 2, excelRow, Math.min(18, totalCols));
    setTextCell(sheet.getCell(excelRow, 2), item.text, {
      align: "left",
      size: 9,
      border: false,
    });
  });
}

export async function downloadMonthlyPlanningSpecialShiftExcel({
  rows,
  calendarDays,
  year,
  month,
}: ExportParams) {
  const sortedRows = [...rows].sort((a, b) =>
    compareVehicle(a.vehicle, b.vehicle),
  );
  const blocks = buildBlocks(sortedRows, calendarDays);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Flota Apoquindo";
  workbook.created = new Date();

  buildLinearSheet(workbook, sortedRows);
  buildGridSheet(workbook, blocks);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const daySuffix =
    calendarDays.length > 0
      ? `-dias-${calendarDays.map((day) => day.day).join("-")}`
      : "";
  link.download = `turno-especial-${year}-${String(month).padStart(2, "0")}${daySuffix}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
