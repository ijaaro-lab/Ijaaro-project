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
      meter_id,
      reading_value,
      reading_date,
      status,
      correction_of_id,
      correction_reason,
      notes,
    } = body ?? {};

    if (!meter_id || reading_value == null) {
      return json({ error: "meter_id and reading_value are required" }, 400);
    }

    const { data, error } = await supabase.rpc("record_meter_reading", {
      p_meter_id: meter_id,
      p_reading_value: reading_value,
      p_reading_date: reading_date ?? null,
      p_status: status ?? "valid",
      p_correction_of_id: correction_of_id ?? null,
      p_correction_reason: correction_reason ?? null,
      p_notes: notes ?? null,
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
