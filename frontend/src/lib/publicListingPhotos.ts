import { supabase } from "@/lib/supabase";
import { PROPERTY_PHOTO_SIGNED_URL_SECONDS } from "@/lib/propertyPhotos";

/** Keep in sync with supabase/functions/public-listing-photos/logic.ts */
export const PUBLIC_LISTING_PHOTO_SIGNED_URL_SECONDS = PROPERTY_PHOTO_SIGNED_URL_SECONDS;
export const MAX_PUBLIC_COVER_PROPERTY_IDS = 50;
export const MAX_PUBLIC_GALLERY_PHOTOS = 8;

export type PublicListingGalleryPhoto = {
  id: string;
  url: string;
  sort_order: number;
};

type CoversResponse = {
  covers?: Record<string, string>;
  error?: string;
  code?: string;
};

type GalleryResponse = {
  photos?: Array<{ id?: string; url?: string; sort_order?: number }>;
  error?: string;
  code?: string;
};

function isSafePublicUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Fail closed if the function body appears to leak private material. */
function rejectPrivateLeak(payload: unknown): boolean {
  const json = JSON.stringify(payload ?? {});
  if (json.includes("storage_path")) return true;
  if (/service[_-]?role/i.test(json)) return true;
  if (json.includes("SUPABASE_SERVICE_ROLE_KEY")) return true;
  return false;
}

/** Batched cover signed URLs for public listing cards. Empty on error / deny. */
export async function fetchPublicListingCovers(
  tenantKey: string,
  propertyIds: string[],
): Promise<Record<string, string>> {
  const key = tenantKey.trim().toLowerCase();
  const ids = [...new Set(propertyIds.map((id) => id.trim()).filter(Boolean))];
  if (!key || ids.length === 0) return {};
  if (ids.length > MAX_PUBLIC_COVER_PROPERTY_IDS) return {};

  const { data, error } = await supabase.functions.invoke("public-listing-photos", {
    body: {
      tenant_key: key,
      mode: "covers",
      property_ids: ids,
    },
  });

  if (error || !data || rejectPrivateLeak(data)) return {};

  const body = data as CoversResponse;
  if (body.error || !body.covers || typeof body.covers !== "object") return {};

  const out: Record<string, string> = {};
  for (const [propertyId, url] of Object.entries(body.covers)) {
    if (typeof url !== "string" || !url || !isSafePublicUrl(url)) continue;
    out[propertyId] = url;
  }
  return out;
}

/** Ordered gallery signed URLs (max 8) for one public listing. Empty on error / deny. */
export async function fetchPublicListingGallery(
  tenantKey: string,
  propertyId: string,
): Promise<PublicListingGalleryPhoto[]> {
  const key = tenantKey.trim().toLowerCase();
  const id = propertyId.trim();
  if (!key || !id) return [];

  const { data, error } = await supabase.functions.invoke("public-listing-photos", {
    body: {
      tenant_key: key,
      mode: "gallery",
      property_ids: [id],
    },
  });

  if (error || !data || rejectPrivateLeak(data)) return [];

  const body = data as GalleryResponse;
  if (body.error || !Array.isArray(body.photos)) return [];

  const photos: PublicListingGalleryPhoto[] = [];
  for (const row of body.photos.slice(0, MAX_PUBLIC_GALLERY_PHOTOS)) {
    const photoId = String(row?.id ?? "").trim();
    const url = String(row?.url ?? "").trim();
    const sortOrder = Number(row?.sort_order);
    if (!photoId || !url || !isSafePublicUrl(url)) continue;
    photos.push({
      id: photoId,
      url,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : photos.length,
    });
  }
  return photos.sort((a, b) => a.sort_order - b.sort_order);
}
