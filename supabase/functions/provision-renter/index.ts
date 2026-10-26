import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  compensationFailureResponse,
  createRequestId,
  emailExactImatchPattern,
  isEmailDeliveryReady,
  logProvisionEvent,
  mapInviteFailureForLandlord,
  runCompensationDelete,
  sanitizeLandlordResponse,
  validateProvisionInput,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Secure renter provisioning for landlord admins.
 *
 * - JWT required; caller must be active landlord_admin on an operable landlord tenant.
 * - Membership role is hard-coded to `renter` (client role ignored / rejected).
 * - Uses Auth inviteUserByEmail (no landlord-chosen password).
 * - Fail-closed when PROVISION_RENTER_EMAIL_DELIVERY_READY is not "true".
 * - Never returns activation URLs, tokens, or passwords to the landlord.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = createRequestId();
  let createdUserId: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;

  try {
    if (req.method !== "POST") {
      return json({ error: "method not allowed", code: "method_not_allowed" }, 405);
    }

    // Fail closed until ops verifies Auth invite email delivery and sets this secret.
    if (!isEmailDeliveryReady(Deno.env.get("PROVISION_RENTER_EMAIL_DELIVERY_READY"))) {
      return json(
        {
          error:
            "Secure activation email delivery is not verified for this environment. Provisioning is blocked.",
          code: "email_delivery_unverified",
        },
        503,
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "missing authorization", code: "unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") ?? Deno.env.get("SITE_URL") ?? "")
      .trim()
      .replace(/\/$/, "");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(
        {
          error: "Server configuration incomplete.",
          code: "server_misconfigured",
        },
        503,
      );
    }
    if (!siteUrl) {
      return json(
        {
          error:
            "PUBLIC_SITE_URL (or SITE_URL) must be configured for invite redirects. Provisioning blocked.",
          code: "redirect_unconfigured",
        },
        503,
      );
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !user) {
      return json({ error: "invalid session", code: "unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON body", code: "invalid_body" }, 400);
    }

    const validated = validateProvisionInput((body ?? {}) as Record<string, unknown>);
    if (!validated.ok) {
      return json({ error: validated.error, code: validated.code }, 400);
    }
    const { tenantId, fullName, username, email, phone } = validated.value;

    // Authorize: active landlord_admin on operable landlord tenant.
    const { data: membership, error: memErr } = await caller
      .from("tenant_memberships")
      .select("id, role, status, tenant:tenants(id, tenant_type, status)")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (memErr) {
      return json({ error: "authorization check failed", code: "unauthorized" }, 403);
    }

    const tenantRaw = membership?.tenant as
      | { id: string; tenant_type: string; status: string }
      | { id: string; tenant_type: string; status: string }[]
      | null
      | undefined;
    const tenant = Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw;

    if (
      !membership ||
      membership.role !== "landlord_admin" ||
      !tenant ||
      tenant.tenant_type !== "landlord" ||
      tenant.status !== "active"
    ) {
      return json(
        {
          error: "Only an active landlord admin on an operable landlord workspace may provision renters.",
          code: "forbidden",
        },
        403,
      );
    }

    admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Refuse duplicate username within this landlord (tenant-scoped uniqueness).
    const { data: usernameHit, error: usernameErr } = await admin
      .from("tenant_renter_usernames")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("username", username)
      .maybeSingle();
    if (usernameErr) {
      return json({ error: "username check failed", code: "username_check_failed" }, 500);
    }
    if (usernameHit) {
      return json(
        {
          error: "That username is already taken for this landlord.",
          code: "username_taken",
        },
        409,
      );
    }

    // Also reject usernames held by pending/accepted applications on this landlord.
    const { data: appUsernameHit, error: appUsernameErr } = await admin
      .from("rental_applications")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("requested_username", username)
      .in("status", ["pending", "accepted"])
      .maybeSingle();
    if (appUsernameErr) {
      return json({ error: "username check failed", code: "username_check_failed" }, 500);
    }
    if (appUsernameHit) {
      return json(
        {
          error: "That username is already reserved for this landlord.",
          code: "username_taken",
        },
        409,
      );
    }

    // Refuse existing profile email (case-insensitive) — no silent link.
    // Fast path: exact match on normalized lowercase; then imatch for mixed-case legacy rows.
    const { data: emailExact, error: emailExactErr } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (emailExactErr) {
      return json({ error: "email check failed", code: "email_check_failed" }, 500);
    }
    if (emailExact) {
      return json(
        {
          error:
            "An account with this email already exists. Use Link Existing User with their Account User ID.",
          code: "email_exists",
        },
        409,
      );
    }

    const { data: emailCi, error: emailCiErr } = await admin
      .from("profiles")
      .select("id")
      .filter("email", "imatch", emailExactImatchPattern(email))
      .maybeSingle();
    if (emailCiErr) {
      return json({ error: "email check failed", code: "email_check_failed" }, 500);
    }
    if (emailCi) {
      return json(
        {
          error:
            "An account with this email already exists. Use Link Existing User with their Account User ID.",
          code: "email_exists",
        },
        409,
      );
    }

    const redirectTo = `${siteUrl}/set-password`;
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo,
        data: { full_name: fullName },
      },
    );

    if (inviteErr || !invited?.user?.id) {
      const mapped = mapInviteFailureForLandlord(inviteErr?.message);
      logProvisionEvent({
        event: "provision_renter.invite_failed",
        request_id: requestId,
        category: mapped.operatorCategory,
        code: mapped.body.code,
      });
      return json(mapped.body, mapped.status);
    }

    createdUserId = invited.user.id;

    const deleteCreatedUser = async (userId: string) => {
      const { error } = await admin!.auth.admin.deleteUser(userId);
      return { error };
    };

    // Profile: handle_new_user trigger may have inserted a row; set display fields only.
    // Landlord-scoped username is stored in tenant_renter_usernames (not profiles.username).
    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        id: createdUserId,
        full_name: fullName,
        email,
        phone,
      },
      { onConflict: "id" },
    );

    if (profileErr) {
      const cleanup = await runCompensationDelete(deleteCreatedUser, createdUserId, {
        requestId,
        stage: "profile_failed",
      });
      createdUserId = null;
      if (!cleanup.ok) {
        return json(compensationFailureResponse(requestId), 500);
      }
      return json(
        {
          error: "Could not save renter profile. Provisioning rolled back.",
          code: "profile_failed",
          request_id: requestId,
        },
        500,
      );
    }

    const { error: usernameMapErr } = await admin.from("tenant_renter_usernames").insert({
      tenant_id: tenantId,
      user_id: createdUserId,
      username,
    });
    if (usernameMapErr) {
      const cleanup = await runCompensationDelete(deleteCreatedUser, createdUserId, {
        requestId,
        stage: "username_map_failed",
      });
      createdUserId = null;
      if (!cleanup.ok) {
        return json(compensationFailureResponse(requestId), 500);
      }
      return json(
        {
          error: "Could not reserve landlord username. Provisioning rolled back.",
          code: "username_map_failed",
          request_id: requestId,
        },
        500,
      );
    }

    // Membership via caller's JWT → preserves manage_membership authorization model.
    // Role hard-coded to renter; status active per approved decision.
    const { data: membershipRow, error: membershipErr } = await caller.rpc(
      "manage_membership",
      {
        p_tenant_id: tenantId,
        p_user_id: createdUserId,
        p_role: "renter",
        p_status: "active",
      },
    );

    if (membershipErr || !membershipRow) {
      await admin.from("tenant_renter_usernames").delete().eq("tenant_id", tenantId).eq(
        "user_id",
        createdUserId,
      );
      const cleanup = await runCompensationDelete(deleteCreatedUser, createdUserId, {
        requestId,
        stage: "membership_failed",
      });
      createdUserId = null;
      if (!cleanup.ok) {
        return json(compensationFailureResponse(requestId), 500);
      }
      return json(
        {
          error: "Could not create renter membership. Provisioning rolled back.",
          code: "membership_failed",
          request_id: requestId,
        },
        500,
      );
    }

    const role = (membershipRow as { role?: string }).role;
    if (role !== "renter") {
      const cleanup = await runCompensationDelete(deleteCreatedUser, createdUserId, {
        requestId,
        stage: "role_invariant",
      });
      createdUserId = null;
      if (!cleanup.ok) {
        return json(compensationFailureResponse(requestId), 500);
      }
      return json(
        {
          error: "Membership role invariant failed. Provisioning rolled back.",
          code: "role_invariant",
          request_id: requestId,
        },
        500,
      );
    }

    createdUserId = null; // success — do not compensate

    const safe = sanitizeLandlordResponse({
      ok: true,
      user_id: (membershipRow as { user_id: string }).user_id,
      username,
      membership_status: (membershipRow as { status: string }).status,
      role: "renter",
      request_id: requestId,
      // Explicitly do not claim inbox delivery — only that Auth accepted the invite request.
      invite_accepted_by_auth: true,
      message:
        "Renter provisioned. An activation email was requested via Supabase Auth; confirm the renter received it before relying on login.",
    });

    return json(safe, 200);
  } catch (e) {
    if (createdUserId && admin) {
      const cleanup = await runCompensationDelete(
        async (userId) => {
          const { error } = await admin!.auth.admin.deleteUser(userId);
          return { error };
        },
        createdUserId,
        { requestId, stage: "unexpected" },
      );
      if (!cleanup.ok) {
        return json(compensationFailureResponse(requestId), 500);
      }
    }
    logProvisionEvent({
      event: "provision_renter.unexpected",
      request_id: requestId,
      code: "unexpected",
    });
    return json(
      {
        error: "An unexpected error occurred. Provisioning did not complete.",
        code: "unexpected",
        request_id: requestId,
      },
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
