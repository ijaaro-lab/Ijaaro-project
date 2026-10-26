/** UUID v4 / generic UUID shape accepted by Postgres uuid columns. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUserId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export type InviteRenterValidation =
  | { ok: true; userId: string; tenantId: string }
  | { ok: false; error: string };

/**
 * Client-side validation for landlord → renter membership invite (FR-010).
 * Backend source of truth remains `manage_membership` (role/tenant checks).
 */
export function validateInviteRenterInput(input: {
  tenantId: string | null | undefined;
  userIdRaw: string;
  role: string | null | undefined;
  existingRenterIds?: string[];
}): InviteRenterValidation {
  const tenantId = input.tenantId?.trim() ?? "";
  if (!tenantId) {
    return { ok: false, error: "No active landlord workspace. Switch membership and try again." };
  }
  if (input.role !== "landlord_admin") {
    return {
      ok: false,
      error: "Only a landlord admin can invite renters to this workspace.",
    };
  }
  const userId = input.userIdRaw.trim();
  if (!userId) {
    return { ok: false, error: "Enter the renter’s user ID." };
  }
  if (!isUserId(userId)) {
    return {
      ok: false,
      error:
        "Enter a valid user ID (UUID). Email lookup is not available to landlords — ask the renter for the ID shown on their Account page.",
    };
  }
  if (input.existingRenterIds?.some((id) => id.toLowerCase() === userId.toLowerCase())) {
    return {
      ok: false,
      error: "That user is already an active renter on this workspace.",
    };
  }
  return { ok: true, userId, tenantId };
}
