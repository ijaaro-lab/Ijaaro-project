import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Company admin/staff provisions a Customer Auth account for THEIR tenant.
 *
 * - Caller must be active utility_admin or utility_staff on the target tenant.
 * - Creates Auth user when email is new; otherwise returns the existing user.
 * - Does not grant membership itself — caller should then register_utility_house
 *   with the email so membership is ensured via that RPC.
 * - Does not return passwords in the response body by design; the client already
 *   knows the password it sent.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user: opsUser },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !opsUser) {
      return json({ error: "not authenticated" }, 401);
    }

    const body = await req.json();
    const tenantId = String(body?.tenant_id ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const fullName = String(body?.full_name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const password = String(body?.password ?? "");

    if (!tenantId) {
      return json({ error: "tenant_id is required" }, 400);
    }
    if (!email || !email.includes("@") || email.length > 254) {
      return json({ error: "valid email is required" }, 400);
    }
    if (!fullName || fullName.length > 200) {
      return json({ error: "full_name is required" }, 400);
    }
    if (phone.length > 40) {
      return json({ error: "phone is too long" }, 400);
    }

    const { data: membership, error: memErr } = await caller
      .from("tenant_memberships")
      .select("id, role, status, tenants!inner(id, tenant_type, status)")
      .eq("tenant_id", tenantId)
      .eq("user_id", opsUser.id)
      .maybeSingle();

    if (memErr) {
      return json({ error: memErr.message }, 400);
    }

    const tenant = membership?.tenants as
      | { id: string; tenant_type: string; status: string }
      | null
      | undefined;

    const roleOk =
      membership?.role === "utility_admin" ||
      membership?.role === "utility_staff";

    if (
      !membership ||
      membership.status !== "active" ||
      !roleOk ||
      !tenant ||
      (tenant.tenant_type !== "water_company" &&
        tenant.tenant_type !== "electricity_company") ||
      (tenant.status !== "active" && tenant.status !== "pending")
    ) {
      return json(
        { error: "only this company's admin or staff can create customers" },
        403,
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let userId: string | null = null;
    let created = false;

    const { data: existingProfiles } = await admin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .limit(1);

    const existingProfile = existingProfiles?.[0];

    // Customers must be new Auth users for this company only — never reuse
    // an existing global account (they would appear / log in elsewhere).
    if (existingProfile?.id) {
      return json(
        {
          error:
            "This email is already registered. Use a different email for this company’s customer.",
          code: "email_exists",
        },
        409,
      );
    }

    if (password.length < 8 || password.length > 128) {
      return json(
        {
          error:
            "password must be at least 8 characters when creating a customer login",
        },
        400,
      );
    }

    const { data: createdUser, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createErr || !createdUser.user) {
      const msg = (createErr?.message ?? "").toLowerCase();
      const already =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        createErr?.status === 422;

      if (already) {
        return json(
          {
            error:
              "This email is already registered. Use a different email for this company’s customer.",
            code: "email_exists",
          },
          409,
        );
      }

      return json(
        { error: createErr?.message ?? "could not create customer user" },
        400,
      );
    }

    userId = createdUser.user.id;
    created = true;
    await admin.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      email,
      ...(phone ? { phone } : {}),
    });

    return json(
      {
        ok: true,
        created,
        user_id: userId,
        email,
        message: "Customer login created for this company.",
      },
      200,
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
