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
    const { meter_reading_id, period_start, period_end, due_date, unit_price } =
      body ?? {};

    if (!meter_reading_id || !period_start || !period_end) {
      return json(
        { error: "meter_reading_id, period_start, and period_end are required" },
        400,
      );
    }

    const { data, error } = await supabase.rpc("generate_utility_bill", {
      p_meter_reading_id: meter_reading_id,
      p_period_start: period_start,
      p_period_end: period_end,
      p_due_date: due_date ?? null,
      p_unit_price: unit_price ?? null,
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
