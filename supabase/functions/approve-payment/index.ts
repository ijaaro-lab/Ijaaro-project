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
    const { payment_id, decision, rejection_reason, payment_type } = body ?? {};

    if (!payment_id || !decision) {
      return json({ error: "payment_id and decision are required" }, 400);
    }

    const kind = (payment_type ?? "rent") as string;

    if (kind === "rent") {
      const { data, error } = await supabase.rpc("review_rent_payment", {
        p_payment_id: payment_id,
        p_decision: decision,
        p_rejection_reason: rejection_reason ?? null,
      });
      if (error) return json({ error: error.message }, 403);
      return json({ data }, 200);
    }

    if (kind === "utility" || kind === "water" || kind === "electricity") {
      // Company staff only — review_utility_payment rejects landlords / wrong tenants.
      const { data, error } = await supabase.rpc("review_utility_payment", {
        p_payment_id: payment_id,
        p_decision: decision,
        p_rejection_reason: rejection_reason ?? null,
      });
      if (error) return json({ error: error.message }, 403);
      return json({ data }, 200);
    }

    return json({ error: "payment_type must be rent or utility" }, 400);
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
