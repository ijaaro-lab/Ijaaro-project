import { isValidUsername, normalizeUsername, validateUsernameInput } from "./username";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProvisionRenterValidation =
  | {
      ok: true;
      tenantId: string;
      fullName: string;
      username: string;
      email: string;
      phone: string;
    }
  | { ok: false; error: string };

/**
 * Client-side validation for secure renter provisioning.
 * Server (provision-renter Edge Function) remains source of truth.
 */
export function validateProvisionRenterInput(input: {
  tenantId: string | null | undefined;
  role: string | null | undefined;
  fullNameRaw: string;
  usernameRaw: string;
  emailRaw: string;
  phoneRaw: string;
}): ProvisionRenterValidation {
  const tenantId = input.tenantId?.trim() ?? "";
  if (!tenantId) {
    return { ok: false, error: "No active landlord workspace. Switch membership and try again." };
  }
  if (input.role !== "landlord_admin") {
    return {
      ok: false,
      error: "Only a landlord admin can provision renters for this workspace.",
    };
  }

  const fullName = input.fullNameRaw.trim();
  if (!fullName || fullName.length > 200) {
    return { ok: false, error: "Enter the renter’s full name." };
  }

  const usernameResult = validateUsernameInput(input.usernameRaw);
  if (!usernameResult.ok) return usernameResult;

  const email = input.emailRaw.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const phone = input.phoneRaw.trim();
  if (!phone || phone.length < 7 || phone.length > 32) {
    return { ok: false, error: "Enter a valid phone number." };
  }
  if (!/^[+0-9()\-\s.]+$/.test(phone)) {
    return { ok: false, error: "Phone contains invalid characters." };
  }

  return {
    ok: true,
    tenantId,
    fullName,
    username: usernameResult.username,
    email,
    phone,
  };
}

export type ProvisionRenterSuccess = {
  ok: true;
  user_id: string;
  username: string;
  membership_status?: string;
  role?: string;
  message?: string;
};

export type ProvisionRenterFailure = {
  ok: false;
  error: string;
  code?: string;
};

/** Ensure landlord-facing payloads never surface activation secrets. */
export function assertSafeProvisionResponse(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const json = JSON.stringify(payload).toLowerCase();
  const banned = [
    "action_link",
    "hashed_token",
    "email_otp",
    "access_token",
    "refresh_token",
    "service_role",
    "confirmation_url",
    '"password":',
  ];
  for (const key of banned) {
    if (json.includes(key)) {
      return "Response contained sensitive activation material and was discarded.";
    }
  }
  return null;
}

export function parseProvisionRenterResponse(
  data: unknown,
  invokeErrorMessage?: string | null,
): ProvisionRenterSuccess | ProvisionRenterFailure {
  const leak = assertSafeProvisionResponse(data);
  if (leak) return { ok: false, error: leak, code: "unsafe_response" };

  if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    if (body.ok === true && typeof body.user_id === "string") {
      return {
        ok: true,
        user_id: body.user_id,
        username: typeof body.username === "string" ? body.username : "",
        membership_status:
          typeof body.membership_status === "string" ? body.membership_status : undefined,
        role: typeof body.role === "string" ? body.role : undefined,
        message: typeof body.message === "string" ? body.message : undefined,
      };
    }
    if (typeof body.error === "string") {
      return {
        ok: false,
        error: body.error,
        code: typeof body.code === "string" ? body.code : undefined,
      };
    }
  }

  return {
    ok: false,
    error: invokeErrorMessage || "Provisioning failed.",
  };
}

export { normalizeUsername, isValidUsername };
