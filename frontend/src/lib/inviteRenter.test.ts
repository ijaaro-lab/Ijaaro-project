import { describe, expect, it } from "vitest";
import { isUserId, validateInviteRenterInput } from "./inviteRenter";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

describe("inviteRenter validation (FR-010)", () => {
  it("accepts a valid landlord_admin invite payload", () => {
    const result = validateInviteRenterInput({
      tenantId,
      userIdRaw: `  ${userId}  `,
      role: "landlord_admin",
    });
    expect(result).toEqual({ ok: true, userId, tenantId });
  });

  it("rejects missing tenant", () => {
    const result = validateInviteRenterInput({
      tenantId: null,
      userIdRaw: userId,
      role: "landlord_admin",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/active landlord workspace/i);
  });

  it("rejects non-admin roles", () => {
    const result = validateInviteRenterInput({
      tenantId,
      userIdRaw: userId,
      role: "landlord_staff",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/landlord admin/i);
  });

  it("rejects empty and invalid user ids", () => {
    expect(
      validateInviteRenterInput({
        tenantId,
        userIdRaw: "",
        role: "landlord_admin",
      }).ok,
    ).toBe(false);
    expect(
      validateInviteRenterInput({
        tenantId,
        userIdRaw: "not-a-uuid",
        role: "landlord_admin",
      }).ok,
    ).toBe(false);
    expect(
      validateInviteRenterInput({
        tenantId,
        userIdRaw: "renter@example.com",
        role: "landlord_admin",
      }).ok,
    ).toBe(false);
  });

  it("rejects users already listed as active renters", () => {
    const result = validateInviteRenterInput({
      tenantId,
      userIdRaw: userId,
      role: "landlord_admin",
      existingRenterIds: [userId.toUpperCase()],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already an active renter/i);
  });

  it("isUserId matches UUID shape only", () => {
    expect(isUserId(userId)).toBe(true);
    expect(isUserId("renter@example.com")).toBe(false);
  });
});
