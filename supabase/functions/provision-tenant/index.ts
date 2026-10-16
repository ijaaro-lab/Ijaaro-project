import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "missing authorization" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = await req.json();
    const {
      name,
      slug,
      tenant_type,
      status,
      owner_user_id,
      owner_role,
      owner_email,
      subdomain,
      activate,
      branding,
      settings,
    } = body ?? {};

    if (!name || !slug || !tenant_type) {
      return json({ error: "name, slug, and tenant_type are required" }, 400);
    }

    const { data, error } = await supabase.rpc("provision_tenant", {
      p_name: name,
      p_slug: slug,
      p_tenant_type: tenant_type,
      p_status: status ?? "pending",
      p_owner_user_id: owner_user_id ?? null,
      p_owner_role: owner_role ?? null,
      p_branding: branding ?? {},
      p_settings: settings ?? {},
      p_owner_email: owner_email ?? null,
      p_subdomain: subdomain ?? null,
      p_activate: activate ?? false,
    });

    if (error) {
      return json({ error: error.message }, 403);
    }

    return json({ data }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
