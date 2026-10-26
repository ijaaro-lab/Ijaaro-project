import { supabase } from "@/lib/supabase";

export const PROPERTY_PHOTO_SIGNED_URL_SECONDS = 15 * 60;

export type PropertyPhotoPathRow = {
  id: string;
  property_id: string;
  storage_path: string;
  sort_order: number;
};

/** Lowest sort_order path per property (for browse cards). */
export function pickCoverPaths(
  rows: Array<Pick<PropertyPhotoPathRow, "property_id" | "storage_path" | "sort_order">>,
): Record<string, string> {
  const covers: Record<string, string> = {};
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  for (const row of sorted) {
    if (!covers[row.property_id]) {
      covers[row.property_id] = row.storage_path;
    }
  }
  return covers;
}

export async function createPropertyPhotoSignedUrl(
  storagePath: string,
  expiresIn = PROPERTY_PHOTO_SIGNED_URL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("property-photos")
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Tenant-scoped cover paths for listing cards. Empty on error / no access. */
export async function fetchCoverPathsForProperties(
  tenantId: string,
  propertyIds: string[],
): Promise<Record<string, string>> {
  if (!tenantId || propertyIds.length === 0) return {};
  const { data, error } = await supabase
    .from("property_photos")
    .select("property_id, storage_path, sort_order")
    .eq("tenant_id", tenantId)
    .in("property_id", propertyIds)
    .order("sort_order", { ascending: true });
  if (error || !data) return {};
  return pickCoverPaths(data as Array<Pick<PropertyPhotoPathRow, "property_id" | "storage_path" | "sort_order">>);
}

/** Tenant-scoped photo rows for a single property gallery. Empty on error / no access. */
export async function fetchPropertyPhotoRows(
  tenantId: string,
  propertyId: string,
): Promise<PropertyPhotoPathRow[]> {
  if (!tenantId || !propertyId) return [];
  const { data, error } = await supabase
    .from("property_photos")
    .select("id, property_id, storage_path, sort_order")
    .eq("tenant_id", tenantId)
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as PropertyPhotoPathRow[];
}

export function formatPropertyTypeLabel(type: string): string {
  if (!type) return "Property";
  return type.charAt(0).toUpperCase() + type.slice(1);
}
