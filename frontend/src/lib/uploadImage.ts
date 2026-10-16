import { supabase } from "@/lib/supabase";

const MAX_BYTES = 2 * 1024 * 1024;

export type ImageBucket = "avatars" | "tenant-branding";

const ALLOWED_EXT = ["jpg", "png", "webp", "gif"] as const;

function normalizeExt(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName === "jpeg") return "jpg";
  if (fromName && (ALLOWED_EXT as readonly string[]).includes(fromName)) {
    return fromName;
  }
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

export async function uploadPublicImage(opts: {
  bucket: ImageBucket;
  folder: string;
  fileName: string;
  file: File;
}): Promise<{ url: string } | { error: string }> {
  const { bucket, folder, fileName, file } = opts;

  if (
    file.type === "image/svg+xml" ||
    file.name.toLowerCase().endsWith(".svg")
  ) {
    return { error: "SVG uploads are not allowed for security reasons." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "Please choose an image file." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Image must be under 2 MB." };
  }

  const ext = normalizeExt(file);
  const path = `${folder}/${fileName}.${ext}`;

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${ext}`,
    cacheControl: "3600",
  });

  if (upErr) return { error: upErr.message };

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: `${pub.publicUrl}?t=${Date.now()}` };
}

export function brandingString(
  branding: Record<string, unknown> | null | undefined,
  key: string,
): string {
  if (!branding) return "";
  const v = branding[key];
  return typeof v === "string" ? v : "";
}
