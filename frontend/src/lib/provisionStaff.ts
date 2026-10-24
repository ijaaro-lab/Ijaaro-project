const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProvisionStaffValidation =
  | {
      ok: true;
      tenantId: string;
      fullName: string;
      email: string;
      phone: string;
    }
  | { ok: false; error: string };

/** Client-side validation for secure staff provisioning. Server remains source of truth. */
export function validateProvisionStaffInput(input: {
  tenantId: string | null | undefined;
  role: string | null | undefined;
  fullNameRaw: string;
  emailRaw: string;
  phoneRaw: string;
}): ProvisionStaffValidation {
  const tenantId = input.tenantId?.trim() ?? "";
  if (!tenantId) {
    return { ok: false, error: "No active landlord workspace. Switch membership and try again." };
  }
  if (input.role !== "landlord_admin") {
    return {
      ok: false,
      error: "Only a landlord admin can provision staff for this workspace.",
    };
  }

  const fullName = input.fullNameRaw.trim();
  if (!fullName || fullName.length > 200) {
    return { ok: false, error: "Enter the staff member’s full name." };
  }

  const email = input.emailRaw.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const phone = input.phoneRaw.trim();
  if (phone) {
    if (phone.length < 7 || phone.length > 32) {
      return { ok: false, error: "Enter a valid phone number, or leave it blank." };
    }
    if (!/^[+0-9()\-\s.]+$/.test(phone)) {
      return { ok: false, error: "Phone contains invalid characters." };
    }
  }

  return { ok: true, tenantId, fullName, email, phone };
}

export function assertSafeProvisionStaffResponse(payload: unknown): string | null {
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
      return "Unsafe provisioning response blocked.";
    }
  }
  return null;
}

export type ProvisionStaffSuccess = {
  ok: true;
  user_id: string;
  membership_status?: string;
  role?: string;
  message?: string;
};

export type ProvisionStaffFailure = {
  ok: false;
  error: string;
  code?: string;
};

export function parseProvisionStaffResponse(
  body: unknown,
  fallbackError?: string,
): ProvisionStaffSuccess | ProvisionStaffFailure {
  const leak = assertSafeProvisionStaffResponse(body);
  if (leak) return { ok: false, error: leak, code: "unsafe_response" };

  if (!body || typeof body !== "object") {
    return {
      ok: false,
      error: fallbackError || "Staff provisioning failed.",
      code: "invalid_response",
    };
  }

  const row = body as Record<string, unknown>;
  if (row.error) {
    return {
      ok: false,
      error: String(row.error),
      code: typeof row.code === "string" ? row.code : undefined,
    };
  }

  if (row.ok === true && typeof row.user_id === "string") {
    return {
      ok: true,
      user_id: row.user_id,
      membership_status:
        typeof row.membership_status === "string" ? row.membership_status : undefined,
      role: typeof row.role === "string" ? row.role : undefined,
      message: typeof row.message === "string" ? row.message : undefined,
    };
  }

  return {
    ok: false,
    error: fallbackError || "Staff provisioning failed.",
    code: "invalid_response",
  };
}
