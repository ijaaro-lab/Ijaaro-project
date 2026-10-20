import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Company admin provisions a Staff account for THEIR tenant only.
 *
 * - Caller must be an active utility_admin on the target tenant.
 * - Role is always utility_staff (never admin).
 * - Creates Auth user when email is new; otherwise links existing Auth user.
 * - Does not return passwords or service-role secrets.
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
      data: { user: adminUser },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !adminUser) {
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

    // Authorize: active utility_admin on this company tenant.
    const { data: membership, error: memErr } = await caller
      .from("tenant_memberships")
      .select("id, role, status, tenants!inner(id, tenant_type, status)")
      .eq("tenant_id", tenantId)
      .eq("user_id", adminUser.id)
      .maybeSingle();

    if (memErr) {
      return json({ error: memErr.message }, 400);
    }

    const tenant = membership?.tenants as
      | { id: string; tenant_type: string; status: string }
      | null
      | undefined;

    if (
      !membership ||
      membership.status !== "active" ||
      membership.role !== "utility_admin" ||
      !tenant ||
      (tenant.tenant_type !== "water_company" &&
        tenant.tenant_type !== "electricity_company") ||
      (tenant.status !== "active" && tenant.status !== "pending")
    ) {
      return json(
        { error: "only this company's utility admin can create staff" },
        403,
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let userId: string | null = null;
    let created = false;

    // Prefer existing profile by email (Auth emails are globally unique).
    const { data: existingProfiles } = await admin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .limit(1);

    const existingProfile = existingProfiles?.[0];

    if (existingProfile?.id) {
      userId = existingProfile.id;
      await admin.from("profiles").upsert({
        id: userId,
        full_name: fullName,
        email,
        ...(phone ? { phone } : {}),
      });
    } else {
      if (password.length < 8 || password.length > 128) {
        return json(
          {
            error:
              "password must be at least 8 characters when creating a new staff account",
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
          // Race: Auth has the email but profile lookup missed it.
          // Require admin to use a different path — avoid password guessing.
          return json(
            {
              error:
                "An account with this email already exists. Ask them to sign up once, then use Look up to add them as staff.",
              code: "email_exists",
            },
            409,
          );
        }

        return json(
          { error: createErr?.message ?? "could not create staff user" },
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
    }

    // Membership must be granted via the caller's authorized RPC (admin-only).
    const { data: membershipRow, error: roleErr } = await caller.rpc(
      "manage_membership",
      {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_role: "utility_staff",
        p_status: "active",
      },
    );

    if (roleErr) {
      return json({ error: roleErr.message }, 403);
    }

    return json(
      {
        ok: true,
        created,
        user_id: userId,
        membership: membershipRow,
        message: created
          ? "Staff account created for this company."
          : "Existing user linked as staff for this company.",
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
