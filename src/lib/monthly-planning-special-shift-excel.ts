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
  title: "#000000",
  border: "#000000",
  yellow: "#FFFF00",
  orange: "#ED7D31",
  red: "#FF0000",
  legendYellow: "#FFFF00",
  legendBlue: "#9DC3E6",
  legendGreen: "#A9D08E",
  legendPurple: "#8EA9DB",
  legendBrown: "#C65911",
  legendOrange: "#ED7D31",
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

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function stylesXml() {
  return `
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
      <Borders/>
      <Font ss:FontName="Arial" ss:Size="10"/>
    </Style>
    <Style ss:ID="Title">
      <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
      <Font ss:FontName="Arial" ss:Size="16" ss:Bold="1"/>
    </Style>
    <Style ss:ID="HeaderLinear">
      <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
      <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#D7E7F8" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
      </Borders>
    </Style>
    <Style ss:ID="CellLinear">
      <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
      <Font ss:FontName="Arial" ss:Size="10"/>
      <Borders>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
      </Borders>
    </Style>
    <Style ss:ID="CellLinearCenter">
      <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
      <Font ss:FontName="Arial" ss:Size="10"/>
      <Borders>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
      </Borders>
    </Style>
    <Style ss:ID="GridCell">
      <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
      <Font ss:FontName="Arial" ss:Size="10"/>
      <NumberFormat ss:Format="@"/>
      <Borders>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
      </Borders>
    </Style>
    <Style ss:ID="YellowBar">
      <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
      <Interior ss:Color="${COLORS.yellow}" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
      </Borders>
    </Style>
    <Style ss:ID="TotalNumber">
      <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
      <Font ss:FontName="Arial" ss:Size="12" ss:Bold="1" ss:Color="${COLORS.red}"/>
      <NumberFormat ss:Format="@"/>
    </Style>
    <Style ss:ID="TotalLabel">
      <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
      <Font ss:FontName="Arial" ss:Size="11" ss:Bold="1"/>
    </Style>
    <Style ss:ID="LegendText">
      <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
      <Font ss:FontName="Arial" ss:Size="9"/>
    </Style>
    ${LEGEND_ITEMS.map(
      (item, index) => `
    <Style ss:ID="LegendSwatch${index}">
      <Interior ss:Color="${item.color}" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COLORS.border}"/>
      </Borders>
    </Style>`,
    ).join("")}
  </Styles>`;
}

function buildLinearSheet(rows: SpecialShiftExportRow[]) {
  const header = ["Móvil", "Conductor", "Grupo", "Turno", "Observación"];
  const headerRow = `<Row ss:AutoFitHeight="0" ss:Height="18">${header
    .map(
      (label) =>
        `<Cell ss:StyleID="HeaderLinear"><Data ss:Type="String">${escapeXml(label)}</Data></Cell>`,
    )
    .join("")}</Row>`;

  const body = rows
    .map((row) => {
      const values = [
        { value: row.vehicle, style: "CellLinearCenter", type: "String" },
        { value: row.driverName, style: "CellLinear", type: "String" },
        { value: row.groupName, style: "CellLinear", type: "String" },
        { value: row.shift, style: "CellLinear", type: "String" },
        {
          value: row.observation || "—",
          style: "CellLinear",
          type: "String",
        },
      ];
      return `<Row ss:AutoFitHeight="0" ss:Height="16">${values
        .map(
          (cell) =>
            `<Cell ss:StyleID="${cell.style}"><Data ss:Type="${cell.type}">${escapeXml(cell.value)}</Data></Cell>`,
        )
        .join("")}</Row>`;
    })
    .join("");

  return `
  <Worksheet ss:Name="Móviles">
    <Table ss:ExpandedColumnCount="5" ss:ExpandedRowCount="${rows.length + 1}" x:FullColumns="1" x:FullRows="1">
      <Column ss:Width="60"/>
      <Column ss:Width="160"/>
      <Column ss:Width="100"/>
      <Column ss:Width="90"/>
      <Column ss:Width="140"/>
      ${headerRow}
      ${body}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <PageSetup><Layout x:Orientation="Portrait"/></PageSetup>
    </WorksheetOptions>
  </Worksheet>`;
}

function vehicleCellXml(col: number, vehicle: string) {
  const text = String(vehicle);
  // Fórmula de texto fijo: Excel no convierte el móvil a número ni inserta
  // una fila de SUM al final de la columna (p. ej. 210457).
  return `<Cell ss:Index="${col}" ss:StyleID="GridCell" ss:Formula="=&quot;${escapeXml(text)}&quot;"><Data ss:Type="String">${escapeXml(text)}</Data></Cell>`;
}

function emptyTextCellXml(col: number, styleId = "GridCell") {
  return `<Cell ss:Index="${col}" ss:StyleID="${styleId}"><Data ss:Type="String"></Data></Cell>`;
}

function buildGridSheet(blocks: ShiftBlock[]) {
  if (!blocks.length) {
    return `
  <Worksheet ss:Name="Turno especial">
    <Table ss:ExpandedColumnCount="1" ss:ExpandedRowCount="1">
      <Row><Cell><Data ss:Type="String">Sin móviles para los días seleccionados.</Data></Cell></Row>
    </Table>
  </Worksheet>`;
  }

  const maxGridRows = Math.max(...blocks.map((block) => block.gridRows.length));
  const titleRowIndex = 1;
  const gridStartRow = 2;
  const gridEndRow = gridStartRow + maxGridRows - 1;
  const spacerRowIndex = gridEndRow + 1;
  const totalRowIndex = spacerRowIndex + 1;
  const legendStartRow = totalRowIndex + 2;
  const lastBlock = blocks[blocks.length - 1]!;
  const totalCols = lastBlock.startCol + GRID_COLS - 1;
  const totalRows = legendStartRow + LEGEND_ITEMS.length;

  const columnDefs = Array.from({ length: totalCols }, () =>
    `<Column ss:Width="28"/>`,
  ).join("");

  const titleCells = blocks
    .map(
      (block) =>
        `<Cell ss:Index="${block.startCol}" ss:MergeAcross="${GRID_COLS - 1}" ss:StyleID="Title"><Data ss:Type="String">${escapeXml(block.title)}</Data></Cell>`,
    )
    .join("");

  const gridRowsXml: string[] = [];
  for (let rowOffset = 0; rowOffset < maxGridRows; rowOffset += 1) {
    const rowIndex = gridStartRow + rowOffset;
    const cells = blocks
      .map((block) => {
        const gridRow = block.gridRows[rowOffset];
        if (!gridRow) {
          // Rellena el bloque más corto con texto vacío (sin números).
          return Array.from({ length: GRID_COLS }, (_, colOffset) =>
            emptyTextCellXml(block.startCol + colOffset),
          ).join("");
        }

        if (gridRow.type === "yellow") {
          return Array.from({ length: GRID_COLS }, (_, colOffset) =>
            emptyTextCellXml(block.startCol + colOffset, "YellowBar"),
          ).join("");
        }

        return Array.from({ length: GRID_COLS }, (_, colOffset) => {
          const col = block.startCol + colOffset;
          const vehicle = gridRow.cells[colOffset];
          if (!vehicle) {
            return emptyTextCellXml(col);
          }
          return vehicleCellXml(col, vehicle);
        }).join("");
      })
      .join("");

    gridRowsXml.push(
      `<Row ss:Index="${rowIndex}" ss:AutoFitHeight="0" ss:Height="15">${cells}</Row>`,
    );
  }

  // Fila separadora explícita en texto: evita que Excel invente SUM de la columna.
  const spacerCells = blocks
    .map((block) =>
      Array.from({ length: GRID_COLS }, (_, colOffset) =>
        emptyTextCellXml(block.startCol + colOffset),
      ).join(""),
    )
    .join("");

  const totalCells = blocks
    .map((block) => {
      const numberCol = block.startCol;
      const labelCol = block.startCol + 1;
      return [
        `<Cell ss:Index="${numberCol}" ss:StyleID="TotalNumber"><Data ss:Type="String">${block.vehicles.length}</Data></Cell>`,
        `<Cell ss:Index="${labelCol}" ss:MergeAcross="4" ss:StyleID="TotalLabel"><Data ss:Type="String">*Total Móviles*</Data></Cell>`,
      ].join("");
    })
    .join("");

  const legendRows = LEGEND_ITEMS.map((item, index) => {
    const rowIndex = legendStartRow + index;
    return `<Row ss:Index="${rowIndex}" ss:AutoFitHeight="0" ss:Height="16">
      <Cell ss:Index="1" ss:StyleID="LegendSwatch${index}"><Data ss:Type="String"></Data></Cell>
      <Cell ss:Index="2" ss:MergeAcross="16" ss:StyleID="LegendText"><Data ss:Type="String">${escapeXml(item.text)}</Data></Cell>
    </Row>`;
  }).join("");

  return `
  <Worksheet ss:Name="Turno especial">
    <Table ss:ExpandedColumnCount="${totalCols}" ss:ExpandedRowCount="${totalRows}">
      ${columnDefs}
      <Row ss:Index="${titleRowIndex}" ss:AutoFitHeight="0" ss:Height="24">${titleCells}</Row>
      ${gridRowsXml.join("\n")}
      <Row ss:Index="${spacerRowIndex}" ss:AutoFitHeight="0" ss:Height="12">${spacerCells}</Row>
      <Row ss:Index="${totalRowIndex}" ss:AutoFitHeight="0" ss:Height="18">${totalCells}</Row>
      ${legendRows}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <PageSetup><Layout x:Orientation="Landscape"/></PageSetup>
    </WorksheetOptions>
  </Worksheet>`;
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

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>Turno especial</Title>
  </DocumentProperties>
  ${stylesXml()}
  ${buildLinearSheet(sortedRows)}
  ${buildGridSheet(blocks)}
</Workbook>`;

  const blob = new Blob([xml], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const daySuffix =
    calendarDays.length > 0
      ? `-dias-${calendarDays.map((day) => day.day).join("-")}`
      : "";
  link.download = `turno-especial-${year}-${String(month).padStart(2, "0")}${daySuffix}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}
