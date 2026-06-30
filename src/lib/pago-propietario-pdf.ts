import { formatPagoAmount, formatPagoDate } from "@/lib/pago-propietario";

export type PagoComprobantePdfItem = {
  vehicleNumber: string;
  fullName: string;
  titularName: string;
  titularEmail: string;
  amount: number;
};

export type PagoComprobantePdfInput = {
  sentAt: Date;
  periodFrom: string;
  periodTo: string;
  items: PagoComprobantePdfItem[];
};

function formatSentDateTime(value: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function buildPdfFileName(sentAt: Date) {
  const datePart = [
    sentAt.getFullYear(),
    String(sentAt.getMonth() + 1).padStart(2, "0"),
    String(sentAt.getDate()).padStart(2, "0"),
  ].join("-");
  const timePart = [
    String(sentAt.getHours()).padStart(2, "0"),
    String(sentAt.getMinutes()).padStart(2, "0"),
    String(sentAt.getSeconds()).padStart(2, "0"),
  ].join("");

  return `comprobante-pago-${datePart}-${timePart}.pdf`;
}

export async function downloadPagoComprobantePdf(input: PagoComprobantePdfInput) {
  if (!input.items.length) {
    return;
  }

  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const totalAmount = input.items.reduce((sum, item) => sum + item.amount, 0);
  const marginX = 14;
  let cursorY = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(11, 92, 171);
  doc.text("Transportes Nueva Apoquindo", marginX, cursorY);

  cursorY += 8;
  doc.setFontSize(13);
  doc.setTextColor(15, 39, 71);
  doc.text("Comprobante de envío de pago a propietarios", marginX, cursorY);

  cursorY += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(23, 59, 104);

  const metaLines = [
    `Fecha de envío: ${formatSentDateTime(input.sentAt)}`,
    `Período de pago: ${formatPagoDate(input.periodFrom)} al ${formatPagoDate(input.periodTo)}`,
    `Correos enviados: ${input.items.length}`,
    `Monto total enviado: ${formatPagoAmount(totalAmount)}`,
  ];

  metaLines.forEach((line) => {
    doc.text(line, marginX, cursorY);
    cursorY += 5.5;
  });

  cursorY += 2;

  autoTable(doc, {
    startY: cursorY,
    head: [["Móvil", "Propietario", "Titular", "Correo titular", "Monto"]],
    body: input.items.map((item) => [
      item.vehicleNumber || "—",
      item.fullName,
      item.titularName,
      item.titularEmail,
      formatPagoAmount(item.amount),
    ]),
    foot: [["", "", "", "Total", formatPagoAmount(totalAmount)]],
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.5,
      textColor: [15, 39, 71],
      lineColor: [159, 184, 217],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [215, 231, 248],
      textColor: [23, 59, 104],
      fontStyle: "bold",
      halign: "left",
    },
    footStyles: {
      fillColor: [238, 245, 252],
      textColor: [15, 39, 71],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 18 },
      4: { halign: "right", cellWidth: 28 },
    },
    margin: { left: marginX, right: marginX },
  });

  const tableEndY =
    (
      doc as {
        lastAutoTable?: {
          finalY: number;
        };
      }
    ).lastAutoTable?.finalY ?? cursorY + 20;

  doc.setFontSize(8);
  doc.setTextColor(83, 101, 122);
  doc.text(
    "Documento de respaldo generado al momento del envío. No se almacena en el sistema.",
    marginX,
    tableEndY + 8,
  );

  doc.save(buildPdfFileName(input.sentAt));
}
