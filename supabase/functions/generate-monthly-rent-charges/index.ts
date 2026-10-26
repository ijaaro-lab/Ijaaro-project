import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Server-side monthly rent charge generation entrypoint.
 * Intended for Supabase Dashboard cron / external scheduler with the service role key.
 * Does not run from the browser UI.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true }, 200);
  }

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return json({ error: "method not allowed" }, 405);
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !supabaseUrl) {
      return json({ error: "server misconfigured" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const cronSecret = Deno.env.get("MONTHLY_RENT_CRON_SECRET") ?? "";
    const allowed =
      token.length > 0 && (token === serviceKey || (cronSecret.length > 0 && token === cronSecret));
    if (!allowed) {
      return json({ error: "unauthorized" }, 401);
    }

    let asOf: string | null = null;
    let maxMonths: number | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      asOf = typeof body?.as_of === "string" ? body.as_of : null;
      maxMonths = typeof body?.max_months === "number" ? body.max_months : null;
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const args: Record<string, unknown> = {};
    if (asOf) args.p_as_of = asOf;
    if (maxMonths != null) args.p_max_months = maxMonths;

    const { data, error } = await supabase.rpc("generate_monthly_rent_charges", args);
    if (error) return json({ error: error.message }, 403);
    return json({ data }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
