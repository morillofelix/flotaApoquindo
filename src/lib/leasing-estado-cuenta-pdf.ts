import {
  formatLeasingBanco,
  formatLeasingFecha,
  formatLeasingMonto,
  LEASING_CUOTA_ESTADO_LABELS,
  LEASING_ESTADO_LABELS,
  LEASING_MEDIO_PAGO_LABELS,
  type LeasingCuotaEstadoVisible,
  type LeasingDetalleDto,
} from "@/lib/leasing";

type Rgb = [number, number, number];

const NAVY: Rgb = [15, 39, 71];
const BLUE: Rgb = [11, 92, 171];
const BRAND_BLUE: Rgb = [30, 58, 138];
const GOLD: Rgb = [196, 175, 132];
const SOFT_BLUE: Rgb = [238, 243, 249];
const HEAD_BLUE: Rgb = [215, 231, 248];
const BORDER: Rgb = [183, 204, 228];
const TEXT_MUTED: Rgb = [91, 111, 138];
const GREEN: Rgb = [21, 128, 61];
const AMBER: Rgb = [180, 83, 9];
const RED: Rgb = [185, 28, 28];
const GRAY: Rgb = [120, 130, 145];

const LOGO_URL = "/logo-apoquindo.png";
const LOGO_RATIO = 1024 / 210;

type AutoTableDoc = { lastAutoTable?: { finalY: number } };

function cuotaEstadoColor(estado: LeasingCuotaEstadoVisible): Rgb {
  switch (estado) {
    case "PAGADA":
      return GREEN;
    case "PAGADA_PARCIAL":
      return AMBER;
    case "VENCIDA":
    case "VENCIDA_PARCIAL":
      return RED;
    case "ANULADA":
      return GRAY;
    default:
      return BLUE;
  }
}

async function loadLogoDataUrl() {
  try {
    const response = await fetch(LOGO_URL, { cache: "force-cache" });

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatEmision(value: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  }).format(value);
}

function buildFileName(detalle: LeasingDetalleDto, emitido: Date) {
  const fecha = emitido.toISOString().slice(0, 10);
  return `estado-cuenta-${detalle.codigo}-movil-${detalle.movil || "sin-movil"}-${fecha}.pdf`;
}

/**
 * Genera el estado de cuenta del leasing. Si se entrega una ventana abierta
 * previamente (para evitar el bloqueo de ventanas emergentes), se muestra ahí;
 * si no, se descarga.
 */
export async function generarEstadoCuentaLeasingPdf(
  detalle: LeasingDetalleDto,
  targetWindow: Window | null,
) {
  const [{ default: jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadLogoDataUrl(),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const emitido = new Date();

  // Encabezado
  const logoWidth = 64;
  const logoHeight = logoWidth / LOGO_RATIO;

  if (logo) {
    doc.addImage(logo, "PNG", marginX, 12, logoWidth, logoHeight);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("TRANSPORTES APOQUINDO", marginX, 20);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text("ESTADO DE CUENTA", pageWidth - marginX, 16, { align: "right" });
  doc.setFontSize(10);
  doc.setTextColor(...BLUE);
  doc.text(`Leasing ${detalle.codigo}`, pageWidth - marginX, 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Emitido: ${formatEmision(emitido)}`, pageWidth - marginX, 27, { align: "right" });

  let y = 32;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setDrawColor(...BRAND_BLUE);
  doc.setLineWidth(0.3);
  doc.line(marginX, y + 1.2, pageWidth - marginX, y + 1.2);

  // Datos del titular y del contrato
  y += 6;
  const boxHeight = 34;
  const halfWidth = (contentWidth - 4) / 2;

  const drawInfoBox = (
    x: number,
    title: string,
    rows: Array<[string, string]>,
  ) => {
    doc.setFillColor(...SOFT_BLUE);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, halfWidth, boxHeight, 2, 2, "FD");
    doc.setFillColor(...NAVY);
    doc.roundedRect(x, y, halfWidth, 7, 2, 2, "F");
    doc.rect(x, y + 4, halfWidth, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(title, x + 3, y + 4.8);

    let rowY = y + 12;
    rows.forEach(([label, value]) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(label, x + 3, rowY);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      const text = doc.splitTextToSize(value || "-", halfWidth - 34) as string[];
      doc.text(text[0] ?? "-", x + 31, rowY);
      rowY += 5.4;
    });
  };

  drawInfoBox(marginX, "DATOS DEL TITULAR", [
    ["Razón social", detalle.razonSocial],
    ["RUT", detalle.rut],
    ["Móvil", detalle.movil],
    ["Correo", detalle.propietarioEmail || "Sin correo registrado"],
  ]);
  drawInfoBox(marginX + halfWidth + 4, "DATOS DEL LEASING", [
    ["Código", detalle.codigo],
    ["Estado", LEASING_ESTADO_LABELS[detalle.estadoVisible]],
    ["Fecha de inicio", formatLeasingFecha(detalle.fechaInicio)],
    ["Día de corte", `${detalle.diaCorte} de cada mes (mensual)`],
  ]);

  // Resumen
  y += boxHeight + 6;
  const resumen: Array<{ label: string; value: string; color: Rgb; fill: Rgb }> = [
    { label: "MONTO DEL LEASING", value: formatLeasingMonto(detalle.montoTotal), color: NAVY, fill: [245, 248, 252] },
    { label: "PAGADO A LA FECHA", value: formatLeasingMonto(detalle.totalPagado), color: GREEN, fill: [240, 253, 244] },
    { label: "SALDO PENDIENTE", value: formatLeasingMonto(detalle.saldo), color: BLUE, fill: SOFT_BLUE },
    {
      label: "CUOTAS PAGADAS",
      value: `${detalle.cuotasPagadas} de ${detalle.cantidadCuotas}`,
      color: detalle.cuotasVencidas ? RED : NAVY,
      fill: [245, 248, 252],
    },
  ];
  const cardWidth = (contentWidth - 3 * 3) / 4;
  resumen.forEach((card, index) => {
    const x = marginX + index * (cardWidth + 3);
    doc.setFillColor(...card.fill);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, cardWidth, 17, 2, 2, "FD");
    doc.setFillColor(...card.color);
    doc.rect(x, y + 2, 1.2, 13, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(card.label, x + cardWidth / 2, y + 6, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...card.color);
    doc.text(card.value, x + cardWidth / 2, y + 12.8, { align: "center" });
  });

  y += 17;

  if (detalle.cuotasVencidas || detalle.proximoVencimiento) {
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...(detalle.cuotasVencidas ? RED : NAVY));
    const partes = [
      detalle.cuotasVencidas ? `Cuotas vencidas: ${detalle.cuotasVencidas}` : "",
      detalle.proximoVencimiento
        ? `Próximo vencimiento: ${formatLeasingFecha(detalle.proximoVencimiento)}`
        : "",
    ].filter(Boolean);
    doc.text(partes.join("    |    "), marginX, y);
  }

  const sectionTitle = (title: string, atY: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BLUE);
    doc.text(title, marginX, atY);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(marginX, atY + 1.5, marginX + 28, atY + 1.5);
  };

  const tableStyles = {
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.8,
      textColor: NAVY,
      lineColor: BORDER,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255] as Rgb,
      fontStyle: "bold" as const,
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [248, 251, 255] as Rgb },
    margin: { left: marginX, right: marginX, top: 20, bottom: 18 },
  };

  // Detalle de cuotas
  y += 9;
  sectionTitle("DETALLE DE CUOTAS", y);

  autoTable(doc, {
    ...tableStyles,
    startY: y + 4,
    head: [["Cuota", "Vencimiento", "Monto", "Pagado", "Saldo", "Estado", "Último pago"]],
    body: detalle.cuotas.map((cuota) => [
      `${cuota.numeroCuota} de ${detalle.cantidadCuotas}`,
      formatLeasingFecha(cuota.fechaVencimiento),
      formatLeasingMonto(cuota.montoOriginal),
      formatLeasingMonto(cuota.montoPagado),
      formatLeasingMonto(cuota.saldo),
      LEASING_CUOTA_ESTADO_LABELS[cuota.estadoVisible],
      formatLeasingFecha(cuota.fechaUltimoPago),
    ]),
    foot: [
      [
        "Total",
        "",
        formatLeasingMonto(detalle.montoTotal),
        formatLeasingMonto(detalle.totalPagado),
        formatLeasingMonto(detalle.saldo),
        "",
        "",
      ],
    ],
    showFoot: "lastPage",
    footStyles: { fillColor: HEAD_BLUE, textColor: NAVY, fontStyle: "bold" },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right", fontStyle: "bold" },
    },
    didParseCell: (hook) => {
      if (hook.section === "body" && hook.column.index === 5) {
        const cuota = detalle.cuotas[hook.row.index];

        if (cuota) {
          hook.cell.styles.textColor = cuotaEstadoColor(cuota.estadoVisible);
          hook.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  // Movimientos
  const pagos = detalle.cuotas
    .flatMap((cuota) => cuota.pagos.map((pago) => ({ ...pago, numeroCuota: cuota.numeroCuota })))
    .sort((a, b) => (a.fechaPago === b.fechaPago ? a.createdAt.localeCompare(b.createdAt) : a.fechaPago.localeCompare(b.fechaPago)));

  y = ((doc as unknown as AutoTableDoc).lastAutoTable?.finalY ?? y + 40) + 10;

  if (y > pageHeight - 40) {
    doc.addPage();
    y = 24;
  }

  sectionTitle("MOVIMIENTOS DE PAGO", y);

  autoTable(doc, {
    ...tableStyles,
    startY: y + 4,
    head: [["Fecha", "Cuota", "Monto", "Medio", "Banco", "N° operación", "Estado"]],
    body: pagos.length
      ? pagos.map((pago) => [
          formatLeasingFecha(pago.fechaPago),
          String(pago.numeroCuota),
          formatLeasingMonto(pago.monto),
          LEASING_MEDIO_PAGO_LABELS[pago.medioPago],
          pago.banco ? formatLeasingBanco(pago.banco) : "-",
          pago.numeroOperacion || "-",
          pago.estado === "ANULADO" ? "Anulado" : "Aplicado",
        ])
      : [[{ content: "Aún no hay pagos registrados.", colSpan: 7, styles: { halign: "center", textColor: TEXT_MUTED } }]],
    columnStyles: {
      1: { halign: "center" },
      2: { halign: "right", fontStyle: "bold" },
    },
    didParseCell: (hook) => {
      if (hook.section !== "body" || !pagos.length) {
        return;
      }

      const pago = pagos[hook.row.index];

      if (pago?.estado === "ANULADO") {
        hook.cell.styles.textColor = GRAY;
        hook.cell.styles.fontStyle = "italic";
      } else if (hook.column.index === 6) {
        hook.cell.styles.textColor = GREEN;
        hook.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = ((doc as unknown as AutoTableDoc).lastAutoTable?.finalY ?? y + 30) + 8;

  const anulados = pagos.filter((pago) => pago.estado === "ANULADO");
  const notas = [
    detalle.observaciones ? `Observaciones: ${detalle.observaciones}` : "",
    anulados.length
      ? `Los pagos anulados se muestran como referencia y no se consideran en el saldo (${anulados.length}).`
      : "",
  ].filter(Boolean);

  if (notas.length) {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 24;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    notas.forEach((nota) => {
      const lines = doc.splitTextToSize(nota, contentWidth) as string[];
      doc.text(lines, marginX, y);
      y += lines.length * 4.2 + 1.5;
    });
  }

  // Pie de página en todas las hojas
  const totalPages = doc.getNumberOfPages();

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    const footerY = pageHeight - 12;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(marginX, footerY - 4, pageWidth - marginX, footerY - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      "Transportes Nueva Apoquindo · Sistema de Gestión de Flota · Documento informativo generado automáticamente",
      marginX,
      footerY,
    );
    doc.text(`Página ${page} de ${totalPages}`, pageWidth - marginX, footerY, { align: "right" });

    if (page > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...BRAND_BLUE);
      doc.text(`Estado de cuenta ${detalle.codigo} · Móvil ${detalle.movil}`, marginX, 12);
    }
  }

  const fileName = buildFileName(detalle, emitido);

  if (targetWindow && !targetWindow.closed) {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(new File([blob], fileName, { type: "application/pdf" }));
    targetWindow.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  doc.save(fileName);
}
