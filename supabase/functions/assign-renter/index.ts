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
      property_id,
      renter_id,
      rent_amount,
      start_date,
      due_day,
      currency,
      notes,
      create_initial_charge,
    } = body ?? {};

    if (!property_id || !renter_id || rent_amount == null || !start_date) {
      return json(
        { error: "property_id, renter_id, rent_amount, and start_date are required" },
        400,
      );
    }

    const { data, error } = await supabase.rpc("assign_renter", {
      p_property_id: property_id,
      p_renter_id: renter_id,
      p_rent_amount: rent_amount,
      p_start_date: start_date,
      p_due_day: due_day ?? null,
      p_currency: currency ?? "USD",
      p_notes: notes ?? null,
      p_create_initial_charge: create_initial_charge ?? true,
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
