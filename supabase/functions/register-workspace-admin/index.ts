import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Public onboarding helper: create a confirmed workspace-admin Auth user so
 * email confirmation does not block /create-workspace.
 *
 * Security posture:
 * - Creates NEW users only via Admin API (email_confirm: true).
 * - Existing emails: requires successful password sign-in; never lists all users;
 *   never auto-confirms without a verified password session.
 * - Does not elevate roles or create memberships (self_provision_tenant does that).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const fullName = String(body?.full_name ?? "").trim();

    if (!email || !email.includes("@") || email.length > 254) {
      return json({ error: "valid email is required" }, 400);
    }
    if (password.length < 8 || password.length > 128) {
      return json({ error: "password must be at least 8 characters" }, 400);
    }
    if (!fullName || fullName.length > 200) {
      return json({ error: "full_name is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (!createErr && created.user) {
      await admin.from("profiles").upsert({
        id: created.user.id,
        full_name: fullName,
        email,
      });
      return json({ ok: true, user_id: created.user.id, created: true }, 200);
    }

    const msg = (createErr?.message ?? "").toLowerCase();
    const already =
      msg.includes("already") ||
      msg.includes("registered") ||
      msg.includes("exists") ||
      createErr?.status === 422;

    if (!already) {
      return json({ error: createErr?.message ?? "could not create user" }, 400);
    }

    // Existing email: only proceed if password verifies via anon sign-in.
    // Do NOT listUsers / scan the Auth directory. Do NOT auto-confirm without
    // a verified session (unconfirmed accounts must complete normal confirmation).
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signed, error: signErr } = await anon.auth.signInWithPassword({
      email,
      password,
    });

    if (!signErr && signed.user) {
      await anon.auth.signOut();
      await admin.from("profiles").upsert({
        id: signed.user.id,
        full_name: fullName,
        email,
      });
      return json({ ok: true, user_id: signed.user.id, created: false }, 200);
    }

    // Uniform response — avoid enumerating confirm vs wrong-password states.
    return json(
      {
        error:
          "An account with this email already exists. Sign in with the correct password (and confirm email if required), then continue Create workspace.",
        code: "email_exists",
      },
      409,
    );
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
