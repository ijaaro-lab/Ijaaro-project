import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  compensationFailureResponse,
  createRequestId,
  emailExactImatchPattern,
  logProvisionEvent,
  mapInviteFailureForLandlord,
  runCompensationDelete,
  sanitizeLandlordResponse,
  validateProvisionStaffInput,
} from "./logic.ts";
import {
  isResendConfigured,
  sendInviteEmail,
} from "../_shared/welcomeEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Secure landlord_staff provisioning for landlord admins.
 *
 * - JWT required; caller must be active landlord_admin on an operable landlord tenant.
 * - Membership role is hard-coded to `landlord_staff` (client role ignored / rejected).
 * - Creates invite via Auth generateLink (no Supabase SMTP) and emails the link with Resend.
 * - Fail-closed when RESEND_API_KEY is missing or Resend send fails.
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

    if (!isResendConfigured()) {
      return json(
        {
          error:
            "Secure activation email delivery is not verified for this environment. Staff provisioning is blocked.",
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
        { error: "Server configuration incomplete.", code: "server_misconfigured" },
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

    const validated = validateProvisionStaffInput((body ?? {}) as Record<string, unknown>);
    if (!validated.ok) {
      return json({ error: validated.error, code: validated.code }, 400);
    }
    const { tenantId, fullName, email, phone } = validated.value;

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
          error:
            "Only an active landlord admin on an operable landlord workspace may provision staff.",
          code: "forbidden",
        },
        403,
      );
    }

    admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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
            "An account with this email already exists. Use Link existing account with that email instead.",
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
            "An account with this email already exists. Use Link existing account with that email instead.",
          code: "email_exists",
        },
        409,
      );
    }

    const redirectTo = `${siteUrl}/set-password`;
    const { data: linkData, error: inviteErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: { full_name: fullName },
      },
    });

    const actionLink = linkData?.properties?.action_link?.trim() ?? "";
    if (inviteErr || !linkData?.user?.id || !actionLink) {
      const mapped = mapInviteFailureForLandlord(inviteErr?.message);
      logProvisionEvent({
        event: "provision_staff.invite_failed",
        request_id: requestId,
        category: mapped.operatorCategory,
        code: mapped.body.code,
      });
      return json(mapped.body, mapped.status);
    }

    createdUserId = linkData.user.id;

    const deleteCreatedUser = async (userId: string) => {
      const { error } = await admin!.auth.admin.deleteUser(userId);
      return { error };
    };

    const mail = await sendInviteEmail({
      to: email,
      fullName,
      actionLink,
      workspaceLabel: "your landlord workspace",
    });
    if (!mail.ok) {
      const cleanup = await runCompensationDelete(deleteCreatedUser, createdUserId, {
        requestId,
        stage: "invite_email_failed",
      });
      createdUserId = null;
      if (!cleanup.ok) {
        return json(compensationFailureResponse(requestId), 500);
      }
      logProvisionEvent({
        event: "provision_staff.invite_email_failed",
        request_id: requestId,
        category: "delivery",
        code: "invite_failed",
      });
      return json(
        {
          error: "Secure activation email could not be sent. Provisioning blocked.",
          code: "invite_failed",
          request_id: requestId,
        },
        503,
      );
    }

    const profilePayload: Record<string, unknown> = {
      id: createdUserId,
      full_name: fullName,
      email,
    };
    if (phone) profilePayload.phone = phone;

    const { error: profileErr } = await admin.from("profiles").upsert(profilePayload, {
      onConflict: "id",
    });

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
          error: "Could not save staff profile. Provisioning rolled back.",
          code: "profile_failed",
          request_id: requestId,
        },
        500,
      );
    }

    const { data: membershipRow, error: membershipErr } = await caller.rpc(
      "manage_membership",
      {
        p_tenant_id: tenantId,
        p_user_id: createdUserId,
        p_role: "landlord_staff",
        p_status: "active",
      },
    );

    if (membershipErr || !membershipRow) {
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
          error: "Could not create staff membership. Provisioning rolled back.",
          code: "membership_failed",
          request_id: requestId,
        },
        500,
      );
    }

    const role = (membershipRow as { role?: string }).role;
    if (role !== "landlord_staff") {
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

    createdUserId = null;

    const safe = sanitizeLandlordResponse({
      ok: true,
      user_id: (membershipRow as { user_id: string }).user_id,
      membership_status: (membershipRow as { status: string }).status,
      role: "landlord_staff",
      request_id: requestId,
      invite_email_sent: true,
      message:
        "Staff provisioned. An activation email was sent via Resend; confirm they received it before relying on login.",
    });

    return json(safe, 200);
  } catch {
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
      event: "provision_staff.unexpected",
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
