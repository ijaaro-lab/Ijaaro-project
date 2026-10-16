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
    if (!authHeader) return json({ error: "missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = await req.json();
    const {
      company_tenant_id,
      property_id,
      customer_id,
      account_number,
      unit_price,
      extra_charges_config,
      meter_number,
      effective_from,
      ensure_customer_membership,
    } = body ?? {};

    if (!company_tenant_id || !property_id || !customer_id || !account_number) {
      return json(
        {
          error:
            "company_tenant_id, property_id, customer_id, and account_number are required",
        },
        400,
      );
    }

    const { data, error } = await supabase.rpc("link_utility_account", {
      p_company_tenant_id: company_tenant_id,
      p_property_id: property_id,
      p_customer_id: customer_id,
      p_account_number: account_number,
      p_unit_price: unit_price ?? 0,
      p_extra_charges_config: extra_charges_config ?? {},
      p_meter_number: meter_number ?? null,
      p_effective_from: effective_from ?? null,
      p_ensure_customer_membership: ensure_customer_membership ?? true,
    });

    if (error) return json({ error: error.message }, 403);
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
