/**
 * Pure helpers for public-listing-photos (unit-testable without Deno APIs).
 * Eligibility must match list_landlord_public_listings / get_landlord_public_listing:
 * active landlord tenant + is_listed + status = available.
 */

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Align with frontend PROPERTY_PHOTO_SIGNED_URL_SECONDS (15 minutes). */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;

export const MAX_COVER_PROPERTY_IDS = 50;
export const MAX_GALLERY_PHOTOS = 8;
export const MAX_TENANT_KEY_LENGTH = 100;

export type PublicPhotoMode = "covers" | "gallery";

export type PublicListingPhotosRequest = {
  tenant_key?: unknown;
  mode?: unknown;
  property_ids?: unknown;
};

export type ValidatedPublicListingPhotosRequest = {
  tenantKey: string;
  mode: PublicPhotoMode;
  propertyIds: string[];
};

export type PhotoMetaRow = {
  id: string;
  property_id: string;
  storage_path: string;
  sort_order: number;
};

const FORBIDDEN_RESPONSE_KEYS = new Set([
  "storage_path",
  "path",
  "bucket",
  "tenant_id",
  "service_role",
  "service_role_key",
  "SUPABASE_SERVICE_ROLE_KEY",
  "apikey",
  "authorization",
]);

export function normalizeTenantKey(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export function validatePublicListingPhotosRequest(
  body: PublicListingPhotosRequest,
):
  | { ok: true; value: ValidatedPublicListingPhotosRequest }
  | { ok: false; error: string; code: string } {
  const tenantKey = normalizeTenantKey(body.tenant_key);
  // Restrict charset so keys are safe in PostgREST filters (matches slug/subdomain style).
  if (
    !tenantKey ||
    tenantKey.length > MAX_TENANT_KEY_LENGTH ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(tenantKey)
  ) {
    return { ok: false, error: "A valid tenant key is required.", code: "invalid_tenant_key" };
  }

  const modeRaw = String(body.mode ?? "").trim().toLowerCase();
  if (modeRaw !== "covers" && modeRaw !== "gallery") {
    return { ok: false, error: "mode must be covers or gallery.", code: "invalid_mode" };
  }
  const mode = modeRaw as PublicPhotoMode;

  if (!Array.isArray(body.property_ids)) {
    return { ok: false, error: "property_ids must be an array.", code: "invalid_property_ids" };
  }

  const seen = new Set<string>();
  const propertyIds: string[] = [];
  for (const item of body.property_ids) {
    const id = String(item ?? "").trim();
    if (!id || !UUID_RE.test(id)) {
      return {
        ok: false,
        error: "Each property id must be a valid UUID.",
        code: "invalid_property_ids",
      };
    }
    if (seen.has(id)) continue;
    seen.add(id);
    propertyIds.push(id);
  }

  if (propertyIds.length === 0) {
    return {
      ok: false,
      error: "At least one property id is required.",
      code: "invalid_property_ids",
    };
  }

  if (mode === "covers" && propertyIds.length > MAX_COVER_PROPERTY_IDS) {
    return {
      ok: false,
      error: `At most ${MAX_COVER_PROPERTY_IDS} property ids are allowed for covers.`,
      code: "payload_too_large",
    };
  }

  if (mode === "gallery" && propertyIds.length !== 1) {
    return {
      ok: false,
      error: "Gallery mode accepts exactly one property id.",
      code: "invalid_property_ids",
    };
  }

  return { ok: true, value: { tenantKey, mode, propertyIds } };
}

/** Lowest sort_order photo per property (cover convention). */
export function pickCoverRows(rows: PhotoMetaRow[]): PhotoMetaRow[] {
  const covers: PhotoMetaRow[] = [];
  const seen = new Set<string>();
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  for (const row of sorted) {
    if (seen.has(row.property_id)) continue;
    seen.add(row.property_id);
    covers.push(row);
  }
  return covers;
}

export function orderGalleryRows(rows: PhotoMetaRow[], limit = MAX_GALLERY_PHOTOS): PhotoMetaRow[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order).slice(0, limit);
}

/** Strip private keys before returning to anonymous clients. */
export function sanitizePublicPhotoResponse<T extends Record<string, unknown>>(
  payload: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_RESPONSE_KEYS.has(key)) continue;
    if (key.toLowerCase().includes("storage_path")) continue;
    if (key.toLowerCase().includes("service_role")) continue;
    out[key] = value;
  }
  return out;
}

export function assertNoPrivatePhotoLeak(payload: unknown): boolean {
  const json = JSON.stringify(payload ?? {});
  if (json.includes("storage_path")) return false;
  if (/service[_-]?role/i.test(json)) return false;
  if (json.includes("SUPABASE_SERVICE_ROLE_KEY")) return false;
  return true;
}
