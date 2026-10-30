import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendWelcomeEmail } from "../_shared/welcomeEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Authenticated welcome email (Resend).
 * Caller JWT required — always sends to the authenticated user's email only.
 * Other Edge Functions should import `_shared/welcomeEmail.ts` directly.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as {
      full_name?: unknown;
      workspace_url?: unknown;
    };

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error,
    } = await userClient.auth.getUser();
    if (error || !user?.email) {
      return json({ error: "unauthorized" }, 401);
    }

    const fullName =
      String(body.full_name ?? "").trim() ||
      String(
        (user.user_metadata as { full_name?: string } | null)?.full_name ?? "",
      ).trim();
    const workspaceUrl = String(body.workspace_url ?? "").trim() || null;

    const result = await sendWelcomeEmail({
      to: user.email,
      fullName,
      workspaceUrl,
    });

    if (result.skipped) {
      return json({ ok: false, skipped: true, error: result.error }, 503);
    }
    if (!result.ok) {
      return json({ ok: false, error: result.error ?? "send_failed" }, 502);
    }
    return json({ ok: true, id: result.id }, 200);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "unexpected error" },
      500,
    );
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
