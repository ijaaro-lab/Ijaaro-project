/** Extract dominant brand colors from a logo image (client-side canvas sampling). */

export type LogoPalette = {
  primary: string;
  secondary: string;
  tertiary: string | null;
};

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function colorDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/**
 * Sample a File or object URL and return up to three distinct brand colors.
 * Skips near-white / near-transparent pixels; prefers saturated hues.
 */
export async function extractLogoColors(
  source: File | string,
): Promise<LogoPalette | null> {
  const objectUrl =
    typeof source === "string" ? source : URL.createObjectURL(source);
  const revoke = typeof source !== "string";

  try {
    const img = await loadImage(objectUrl);
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    type Bucket = { r: number; g: number; b: number; weight: number };
    const buckets = new Map<string, Bucket>();

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 40) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = luminance(r, g, b);
      // Skip near-white / near-black background filler
      if (lum > 0.92 || lum < 0.06) continue;

      const qr = Math.round(r / 24) * 24;
      const qg = Math.round(g / 24) * 24;
      const qb = Math.round(b / 24) * 24;
      const key = `${qr},${qg},${qb}`;
      const sat = saturation(r, g, b);
      const weight = 1 + sat * 3;
      const prev = buckets.get(key);
      if (prev) {
        prev.r += r * weight;
        prev.g += g * weight;
        prev.b += b * weight;
        prev.weight += weight;
      } else {
        buckets.set(key, { r: r * weight, g: g * weight, b: b * weight, weight });
      }
    }

    if (buckets.size === 0) return null;

    const ranked = [...buckets.values()]
      .map((bucket) => {
        const r = bucket.r / bucket.weight;
        const g = bucket.g / bucket.weight;
        const b = bucket.b / bucket.weight;
        return {
          rgb: [r, g, b] as [number, number, number],
          score: bucket.weight * (0.4 + saturation(r, g, b)),
        };
      })
      .sort((a, b) => b.score - a.score);

    const picked: [number, number, number][] = [];
    for (const entry of ranked) {
      if (picked.every((p) => colorDistance(p, entry.rgb) > 45)) {
        picked.push(entry.rgb);
      }
      if (picked.length >= 3) break;
    }

    if (picked.length === 0) return null;

    // Prefer a more saturated color as primary when available
    const bySat = [...picked].sort(
      (a, b) => saturation(b[0], b[1], b[2]) - saturation(a[0], a[1], a[2]),
    );
    const primary = bySat[0];
    const rest = picked.filter((c) => c !== primary);
    const secondary =
      rest[0] ??
      ([
        Math.max(0, primary[0] * 0.35),
        Math.max(0, primary[1] * 0.35),
        Math.max(0, primary[2] * 0.45),
      ] as [number, number, number]);
    const tertiary = rest[1] ?? null;

    return {
      primary: rgbToHex(primary[0], primary[1], primary[2]),
      secondary: rgbToHex(secondary[0], secondary[1], secondary[2]),
      tertiary: tertiary
        ? rgbToHex(tertiary[0], tertiary[1], tertiary[2])
        : null,
    };
  } catch {
    return null;
  } finally {
    if (revoke) URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for color extraction."));
    img.src = src;
  });
}
