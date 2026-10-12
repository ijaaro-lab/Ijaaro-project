const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const dir = "C:/Users/hp/Desktop/IJaaro/images";
const outDir = path.join(dir, "prepared");
fs.mkdirSync(outDir, { recursive: true });

async function prepare(inputName, outName, maxW, maxH) {
  const input = path.join(dir, inputName);
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const avg = (r + g + b) / 3;
    if (avg < 28 && max < 45) {
      data[i + 3] = 0;
    }
  }

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * channels + 3];
      if (a > 20) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) throw new Error("No content in " + inputName);

  const pad = 16;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const cropped = await sharp(data, { raw: { width, height, channels } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .png()
    .toBuffer();

  const outPath = path.join(outDir, outName);
  await sharp(cropped)
    .resize({
      width: maxW,
      height: maxH,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toFile(outPath);

  const final = await sharp(outPath).metadata();
  console.log(
    `${inputName} -> ${outName}: crop ${cropW}x${cropH} => ${final.width}x${final.height}`
  );
}

(async () => {
  await prepare(
    "IJAARO Property Utility Logo.png",
    "ijaaro-logo-horizontal.png",
    560,
    140
  );
  await prepare(
    "IJAARO Smart Utility Logo.png",
    "ijaaro-logo-mark.png",
    240,
    240
  );
  await prepare(
    "IJAARO Property Utility Logo.png",
    "ijaaro-logo-button.png",
    320,
    72
  );
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
