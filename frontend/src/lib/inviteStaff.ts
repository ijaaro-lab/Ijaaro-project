const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteStaffLinkValidation =
  | { ok: true; tenantId: string; email: string }
  | { ok: false; error: string };

/** Client validation for linking an existing account as landlord_staff. */
export function validateLinkStaffByEmailInput(input: {
  tenantId: string | null | undefined;
  role: string | null | undefined;
  emailRaw: string;
}): InviteStaffLinkValidation {
  const tenantId = input.tenantId?.trim() ?? "";
  if (!tenantId) {
    return { ok: false, error: "No active landlord workspace. Switch membership and try again." };
  }
  if (input.role !== "landlord_admin") {
    return {
      ok: false,
      error: "Only a landlord admin can manage staff for this workspace.",
    };
  }

  const email = input.emailRaw.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, error: "Enter a valid email address." };
  }

  return { ok: true, tenantId, email };
}

export type StaffStatusActionValidation =
  | { ok: true; tenantId: string; userId: string; status: "active" | "disabled" }
  | { ok: false; error: string };

export function validateStaffStatusAction(input: {
  tenantId: string | null | undefined;
  role: string | null | undefined;
  userId: string | null | undefined;
  status: "active" | "disabled";
}): StaffStatusActionValidation {
  const tenantId = input.tenantId?.trim() ?? "";
  if (!tenantId) {
    return { ok: false, error: "No active landlord workspace." };
  }
  if (input.role !== "landlord_admin") {
    return { ok: false, error: "Only a landlord admin can change staff status." };
  }
  const userId = input.userId?.trim() ?? "";
  if (!userId) {
    return { ok: false, error: "Staff member is required." };
  }
  return { ok: true, tenantId, userId, status: input.status };
}
