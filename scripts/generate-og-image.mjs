import sharp from "sharp";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "public", "og-image.svg");
const pngPath = join(root, "public", "og-image.png");

const svg = readFileSync(svgPath);
await sharp(svg)
  .resize(1200, 630)
  .png()
  .toFile(pngPath);

console.log("Generated public/og-image.png (1200 x 630)");
