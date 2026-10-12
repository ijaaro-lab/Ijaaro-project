const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const brandDir = "C:/Users/hp/Desktop/IJaaro/images/brand";
const preparedDir = "C:/Users/hp/Desktop/IJaaro/images/prepared";
const svgPath = path.join(brandDir, "ijaaro-logo-horizontal.svg");
const generatedJpg = path.join(brandDir, "ijaaro-logo-horizontal-redesign.jpg");

async function exportSvgVariants() {
  const svg = fs.readFileSync(svgPath);

  // Transparent PNG (primary vector raster)
  await sharp(svg, { density: 320 })
    .resize({ width: 2000, height: 480, fit: "inside" })
    .png()
    .toFile(path.join(brandDir, "ijaaro-logo-horizontal.png"));

  // White-background PNG for documents/print
  await sharp(svg, { density: 320 })
    .resize({ width: 2000, height: 480, fit: "inside" })
    .flatten({ background: "#FFFFFF" })
    .png()
    .toFile(path.join(brandDir, "ijaaro-logo-horizontal-white.png"));

  // Compact header size
  await sharp(svg, { density: 320 })
    .resize({ width: 560, height: 140, fit: "inside" })
    .png()
    .toFile(path.join(preparedDir, "ijaaro-logo-horizontal.png"));
}

async function exportRenderedTransparent() {
  if (!fs.existsSync(generatedJpg)) return;

  const { data, info } = await sharp(generatedJpg)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 248 && g > 248 && b > 248) {
      data[i + 3] = 0;
    } else if (r > 235 && g > 235 && b > 235) {
      const whiteness = (r + g + b) / 3;
      data[i + 3] = Math.max(0, Math.min(255, Math.round((255 - whiteness) * 10)));
    }
  }

  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 20) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const pad = 20;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  await sharp(data, { raw: { width, height, channels } })
    .extract({
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    })
    .png()
    .toFile(path.join(brandDir, "ijaaro-logo-horizontal-rendered.png"));

  // Also publish as prepared header asset
  await sharp(path.join(brandDir, "ijaaro-logo-horizontal-rendered.png"))
    .resize({ width: 560, height: 140, fit: "inside" })
    .png()
    .toFile(path.join(preparedDir, "ijaaro-logo-button.png"));
}

(async () => {
  fs.mkdirSync(preparedDir, { recursive: true });
  await exportSvgVariants();
  await exportRenderedTransparent();
  console.log("Brand logo exports complete");
  for (const f of fs.readdirSync(brandDir)) {
    const s = fs.statSync(path.join(brandDir, f));
    console.log(`  brand/${f} (${s.size} bytes)`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
