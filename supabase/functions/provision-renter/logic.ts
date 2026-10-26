/**
 * Pure helpers for provision-renter (unit-testable without Deno APIs).
 * Keep in sync with frontend/src/lib/username.ts + provisionRenter.ts rules.
 */

export const USERNAME_RE = /^[a-z][a-z0-9_]{2,31}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProvisionInput = {
  tenant_id?: unknown;
  full_name?: unknown;
  username?: unknown;
  email?: unknown;
  phone?: unknown;
  role?: unknown;
};

export type ValidatedProvision = {
  tenantId: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
};

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(normalized: string): boolean {
  return USERNAME_RE.test(normalized);
}

export function validateProvisionInput(
  body: ProvisionInput,
): { ok: true; value: ValidatedProvision } | { ok: false; error: string; code: string } {
  // Role is hard-coded server-side; reject client attempts to supply one.
  if (body.role !== undefined && body.role !== null && String(body.role).length > 0) {
    return {
      ok: false,
      error: "Role cannot be supplied by the client.",
      code: "role_not_allowed",
    };
  }

  const tenantId = String(body.tenant_id ?? "").trim();
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { ok: false, error: "Valid tenant_id is required.", code: "invalid_tenant" };
  }

  const fullName = String(body.full_name ?? "").trim();
  if (!fullName || fullName.length > 200) {
    return { ok: false, error: "Full name is required (max 200 characters).", code: "invalid_name" };
  }

  const username = normalizeUsername(String(body.username ?? ""));
  if (!username || !isValidUsername(username)) {
    return {
      ok: false,
      error:
        "Username must be 3–32 characters, start with a letter, and use only lowercase letters, digits, or underscores.",
      code: "invalid_username",
    };
  }

  const email = normalizeEmail(String(body.email ?? ""));
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "A valid email is required.", code: "invalid_email" };
  }

  const phone = String(body.phone ?? "").trim();
  if (!phone || phone.length < 7 || phone.length > 32) {
    return { ok: false, error: "A valid phone number is required.", code: "invalid_phone" };
  }
  if (!/^[+0-9()\-\s.]+$/.test(phone)) {
    return { ok: false, error: "Phone contains invalid characters.", code: "invalid_phone" };
  }

  return {
    ok: true,
    value: { tenantId, fullName, username, email, phone },
  };
}

/** Remove secrets / activation material from any object before returning to landlords. */
export function sanitizeLandlordResponse<T extends Record<string, unknown>>(
  payload: T,
): Record<string, unknown> {
  const blocked = [
    "password",
    "hashed_password",
    "action_link",
    "email_otp",
    "hashed_token",
    "confirmation_token",
    "recovery_token",
    "email_change_token",
    "invite_token",
    "token",
    "access_token",
    "refresh_token",
    "provider_token",
    "provider_refresh_token",
    "service_role",
    "service_role_key",
  ];

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const lower = key.toLowerCase();
    if (blocked.some((b) => lower.includes(b))) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeLandlordResponse(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function isEmailAlreadyRegisteredMessage(message: string | undefined | null): boolean {
  const msg = (message ?? "").toLowerCase();
  return (
    msg.includes("already") ||
    msg.includes("registered") ||
    msg.includes("exists") ||
    msg.includes("duplicate")
  );
}

export function isEmailDeliveryReady(envValue: string | undefined | null): boolean {
  return (envValue ?? "").trim().toLowerCase() === "true";
}

/**
 * PostgREST `imatch` (~*) pattern for case-insensitive exact email equality.
 * Escapes regex metacharacters so `_` / `.` / `+` in emails are literals (unlike ilike).
 */
export function emailExactImatchPattern(normalizedEmail: string): string {
  const escaped = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `^${escaped}$`;
}

export type InvitePublicFailure = {
  status: number;
  body: { error: string; code: string };
  /** Non-sensitive category for operator logs only — never raw Auth text. */
  operatorCategory: "email_exists" | "delivery" | "invite";
};

/** Map Auth invite errors to stable landlord-safe responses (no raw provider text). */
export function mapInviteFailureForLandlord(
  inviteMessage: string | undefined | null,
): InvitePublicFailure {
  if (isEmailAlreadyRegisteredMessage(inviteMessage)) {
    return {
      status: 409,
      body: {
        error:
          "An account with this email already exists. Use Link Existing User with their Account User ID.",
        code: "email_exists",
      },
      operatorCategory: "email_exists",
    };
  }

  const msg = (inviteMessage ?? "").toLowerCase();
  const delivery =
    msg.includes("error sending") ||
    msg.includes("smtp") ||
    msg.includes("sending invite") ||
    msg.includes("error sending invite email");

  if (delivery) {
    return {
      status: 503,
      body: {
        error: "Secure activation email could not be sent. Provisioning blocked.",
        code: "invite_failed",
      },
      operatorCategory: "delivery",
    };
  }

  return {
    status: 503,
    body: {
      error: "Invitation failed. Provisioning blocked.",
      code: "invite_failed",
    },
    operatorCategory: "invite",
  };
}

export type CompensationResult =
  | { ok: true }
  | { ok: false; reason: "delete_user_failed" | "delete_user_exception" };

export type DeleteUserFn = (
  userId: string,
) => Promise<{ error: { message?: string } | null }>;

/**
 * Delete ONLY the Auth user created in the current request.
 * Returns success/failure; never throws. Logs structured ops data without secrets/PII email.
 */
export async function runCompensationDelete(
  deleteUser: DeleteUserFn,
  userId: string,
  meta: { requestId: string; stage: string },
): Promise<CompensationResult> {
  try {
    const { error } = await deleteUser(userId);
    if (error) {
      logProvisionEvent({
        event: "provision_renter.compensation_failed",
        request_id: meta.requestId,
        stage: meta.stage,
        user_id: userId,
        reason: "delete_user_failed",
      });
      return { ok: false, reason: "delete_user_failed" };
    }
    logProvisionEvent({
      event: "provision_renter.compensation_ok",
      request_id: meta.requestId,
      stage: meta.stage,
      user_id: userId,
    });
    return { ok: true };
  } catch {
    logProvisionEvent({
      event: "provision_renter.compensation_failed",
      request_id: meta.requestId,
      stage: meta.stage,
      user_id: userId,
      reason: "delete_user_exception",
    });
    return { ok: false, reason: "delete_user_exception" };
  }
}

export function compensationFailureResponse(requestId: string): {
  error: string;
  code: string;
  request_id: string;
} {
  return {
    error:
      "Provisioning failed and automatic cleanup could not be completed. Contact support with the reference id.",
    code: "compensation_failed",
    request_id: requestId,
  };
}

export function createRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Structured console log — never log passwords, tokens, activation URLs, or email. */
export function logProvisionEvent(fields: Record<string, string | undefined>): void {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    const key = k.toLowerCase();
    if (
      key.includes("password") ||
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("authorization") ||
      key === "email" ||
      key.includes("action_link") ||
      key.includes("message")
    ) {
      continue;
    }
    safe[k] = v;
  }
  console.error(JSON.stringify(safe));
}
