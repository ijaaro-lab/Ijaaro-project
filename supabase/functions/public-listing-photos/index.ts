import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  MAX_GALLERY_PHOTOS,
  SIGNED_URL_TTL_SECONDS,
  assertNoPrivatePhotoLeak,
  orderGalleryRows,
  pickCoverRows,
  sanitizePublicPhotoResponse,
  validatePublicListingPhotosRequest,
  type PhotoMetaRow,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PROPERTY_PHOTOS_BUCKET = "property-photos";

/**
 * Anonymous-safe public listing photo delivery.
 *
 * - Callable with anon (or authenticated) JWT via supabase.functions.invoke.
 * - Authorization is NOT derived from client property ids alone: tenant key is
 *   resolved to an operable landlord, then each property must be that tenant's
 *   listed + available row before any photo is signed.
 * - Returns short-lived signed URLs only (never storage_path / tenant folders).
 * - Does not broaden RLS or make the property-photos bucket public.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "method not allowed", code: "method_not_allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json(
        { error: "Server configuration incomplete.", code: "server_misconfigured" },
        503,
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON body", code: "invalid_body" }, 400);
    }

    const validated = validatePublicListingPhotosRequest(
      (body ?? {}) as Record<string, unknown>,
    );
    if (!validated.ok) {
      return json({ error: validated.error, code: validated.code }, 400);
    }
    const { tenantKey, mode, propertyIds } = validated.value;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Same operable-landlord rules as resolve_operable_landlord_tenant (not granted to anon).
    // Quote values for PostgREST (hyphenated slugs like hodan-properties).
    const { data: tenants, error: tenantErr } = await admin
      .from("tenants")
      .select("id")
      .or(`slug.eq."${tenantKey}",subdomain.eq."${tenantKey}"`)
      .eq("tenant_type", "landlord")
      .eq("status", "active")
      .limit(1);

    if (tenantErr) {
      return json({ error: "Could not resolve workspace.", code: "resolve_failed" }, 500);
    }

    const tenantId = tenants?.[0]?.id as string | undefined;
    if (!tenantId) {
      return json(
        { error: "landlord workspace not found or not operable", code: "workspace_not_found" },
        404,
      );
    }

    // Independent eligibility: listed + available + tenant ownership.
    const { data: eligibleProps, error: propErr } = await admin
      .from("properties")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_listed", true)
      .eq("status", "available")
      .in("id", propertyIds);

    if (propErr) {
      return json({ error: "Could not verify listings.", code: "eligibility_failed" }, 500);
    }

    const eligibleIds = (eligibleProps ?? []).map((p: { id: string }) => p.id);
    if (eligibleIds.length === 0) {
      const empty =
        mode === "covers"
          ? sanitizePublicPhotoResponse({ covers: {} })
          : sanitizePublicPhotoResponse({ photos: [] });
      if (!assertNoPrivatePhotoLeak(empty)) {
        return json({ error: "Response rejected.", code: "sanitize_failed" }, 500);
      }
      return json(empty, 200);
    }

    const { data: photoRows, error: photoErr } = await admin
      .from("property_photos")
      .select("id, property_id, storage_path, sort_order")
      .eq("tenant_id", tenantId)
      .in("property_id", eligibleIds)
      .order("sort_order", { ascending: true });

    if (photoErr) {
      return json({ error: "Could not load photos.", code: "photos_failed" }, 500);
    }

    const rows = (photoRows ?? []) as PhotoMetaRow[];

    if (mode === "covers") {
      const covers: Record<string, string> = {};
      for (const row of pickCoverRows(rows)) {
        const url = await signPhoto(admin, row.storage_path);
        if (url) covers[row.property_id] = url;
      }
      const payload = sanitizePublicPhotoResponse({ covers });
      if (!assertNoPrivatePhotoLeak(payload)) {
        return json({ error: "Response rejected.", code: "sanitize_failed" }, 500);
      }
      return json(payload, 200);
    }

    const gallery = orderGalleryRows(rows, MAX_GALLERY_PHOTOS);
    const photos: Array<{ id: string; url: string; sort_order: number }> = [];
    for (const row of gallery) {
      const url = await signPhoto(admin, row.storage_path);
      if (!url) continue;
      photos.push({ id: row.id, url, sort_order: row.sort_order });
    }

    const payload = sanitizePublicPhotoResponse({ photos });
    if (!assertNoPrivatePhotoLeak(payload)) {
      return json({ error: "Response rejected.", code: "sanitize_failed" }, 500);
    }
    return json(payload, 200);
  } catch {
    return json(
      { error: "An unexpected error occurred.", code: "unexpected" },
      500,
    );
  }
});

async function signPhoto(
  admin: ReturnType<typeof createClient>,
  storagePath: string,
): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await admin.storage
    .from(PROPERTY_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
