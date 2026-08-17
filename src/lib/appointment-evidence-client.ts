import {
  APPOINTMENT_EVIDENCE_MAX_BYTES,
  type AppointmentEvidencePayload,
} from "@/lib/appointment-evidence";

const MAX_EDGE = 1600;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("No se pudo leer la imagen."));
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Usa una foto JPG o PNG. Este formato no se pudo abrir."));
    image.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo preparar la foto."));
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
            return;
          }

          reject(new Error("No se pudo preparar la foto."));
        };
        reader.onerror = () => reject(new Error("No se pudo preparar la foto."));
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

function splitDataUrl(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  const header = commaIndex >= 0 ? dataUrl.slice(0, commaIndex) : "";
  const data = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const mimeMatch = /^data:([^;]+);base64$/i.exec(header);

  return {
    data,
    mimeType: mimeMatch?.[1]?.toLowerCase() === "image/jpg" ? "image/jpeg" : mimeMatch?.[1] ?? "",
  };
}

function byteLengthFromBase64(data: string) {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

export async function compressAppointmentEvidenceFile(
  file: File,
): Promise<AppointmentEvidencePayload> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Adjunta una foto JPG o PNG.");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const longestEdge = Math.max(image.width, image.height) || 1;
  const scale = Math.min(1, MAX_EDGE / longestEdge);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("No se pudo preparar la foto.");
  }

  context.drawImage(image, 0, 0, width, height);

  let quality = 0.74;
  let encoded = await canvasToJpeg(canvas, quality);
  let parsed = splitDataUrl(encoded);

  while (byteLengthFromBase64(parsed.data) > APPOINTMENT_EVIDENCE_MAX_BYTES && quality > 0.45) {
    quality -= 0.12;
    encoded = await canvasToJpeg(canvas, quality);
    parsed = splitDataUrl(encoded);
  }

  if (byteLengthFromBase64(parsed.data) > APPOINTMENT_EVIDENCE_MAX_BYTES) {
    throw new Error("La foto sigue siendo muy pesada. Prueba con otra más cercana o menos nítida.");
  }

  return {
    data: parsed.data,
    fileName: "evidencia.jpg",
    mimeType: "image/jpeg",
  };
}
