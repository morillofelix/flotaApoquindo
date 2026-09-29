const MAX_EDGE = 1600;
const TARGET_IMAGE_BYTES = 900 * 1024;

export type LeasingComprobantePreparado = {
  file: File;
  convertido: boolean;
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("No se pudo leer el archivo."));
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("La imagen no se pudo abrir. Usa JPG, PNG o PDF."));
    image.src = src;
  });
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo preparar la imagen."));
          return;
        }

        blob
          .arrayBuffer()
          .then((buffer) => resolve(new Uint8Array(buffer)))
          .catch(() => reject(new Error("No se pudo preparar la imagen.")));
      },
      "image/jpeg",
      quality,
    );
  });
}

function baseName(fileName: string) {
  const name = fileName.replace(/\.[^.]+$/, "").trim();
  return name || "comprobante";
}

/**
 * PDF se envía tal cual. JPG/PNG se reduce y se convierte a un PDF liviano
 * de una página para que todos los comprobantes queden en el mismo formato.
 */
export async function prepararComprobanteLeasing(file: File): Promise<LeasingComprobantePreparado> {
  const lowerName = file.name.toLowerCase();

  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    return { file, convertido: false };
  }

  if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
    throw new Error("El comprobante debe ser PDF, JPG o PNG.");
  }

  const image = await loadImage(await readFileAsDataUrl(file));
  const longestEdge = Math.max(image.width, image.height) || 1;
  const scale = Math.min(1, MAX_EDGE / longestEdge);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("No se pudo preparar la imagen.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let quality = 0.78;
  let jpeg = await canvasToJpegBytes(canvas, quality);

  while (jpeg.byteLength > TARGET_IMAGE_BYTES && quality > 0.42) {
    quality -= 0.12;
    jpeg = await canvasToJpegBytes(canvas, quality);
  }

  const { default: jsPDF } = await import("jspdf");
  const orientation = width > height ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "pt", format: "letter", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 24;
  const fit = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height);
  const drawWidth = width * fit;
  const drawHeight = height * fit;

  doc.addImage(
    jpeg,
    "JPEG",
    (pageWidth - drawWidth) / 2,
    (pageHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );

  const pdfBlob = doc.output("blob");
  return {
    file: new File([pdfBlob], `${baseName(file.name)}.pdf`, { type: "application/pdf" }),
    convertido: true,
  };
}
