import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const PUBLIC_DIR = path.join(projectRoot, "public");
const SOURCE = path.join(PUBLIC_DIR, "logo-gestion-flota-tna.png");
const LOGO_NAME = "logo-gestion-flota-tna.png";
const BACKGROUND = "#ffffff";

async function makeSquareIcon({
  size,
  outputPath,
  paddingPercent,
}) {
  const padding = Math.round(size * paddingPercent);
  const inner = size - padding * 2;

  const resized = await sharp(SOURCE)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(outputPath);
}

async function main() {
  await fs.access(SOURCE);

  const outputs = [
    { size: 32, file: "favicon-32.png", paddingPercent: 0.08 },
    { size: 180, file: "apple-touch-icon.png", paddingPercent: 0.1 },
    { size: 192, file: "pwa-192.png", paddingPercent: 0.1 },
    { size: 512, file: "pwa-512.png", paddingPercent: 0.1 },
    { size: 512, file: "pwa-512-maskable.png", paddingPercent: 0.18 },
  ];

  for (const output of outputs) {
    await makeSquareIcon({
      size: output.size,
      outputPath: path.join(PUBLIC_DIR, output.file),
      paddingPercent: output.paddingPercent,
    });
    console.log(`Generated ${output.file} (${output.size}x${output.size})`);
  }

  console.log(`Icons generated from ${LOGO_NAME}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
