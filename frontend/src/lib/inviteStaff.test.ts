import { describe, expect, it } from "vitest";
import { validateLinkStaffByEmailInput, validateStaffStatusAction } from "./inviteStaff";

describe("inviteStaff validators", () => {
  it("allows landlord_admin email link input", () => {
    expect(
      validateLinkStaffByEmailInput({
        tenantId: "t1",
        role: "landlord_admin",
        emailRaw: "staff@example.com",
      }),
    ).toEqual({ ok: true, tenantId: "t1", email: "staff@example.com" });
  });

  it("rejects staff callers", () => {
    expect(
      validateLinkStaffByEmailInput({
        tenantId: "t1",
        role: "landlord_staff",
        emailRaw: "staff@example.com",
      }).ok,
    ).toBe(false);
  });

  it("validates deactivate/reactivate actions", () => {
    expect(
      validateStaffStatusAction({
        tenantId: "t1",
        role: "landlord_admin",
        userId: "u1",
        status: "disabled",
      }),
    ).toEqual({ ok: true, tenantId: "t1", userId: "u1", status: "disabled" });

    expect(
      validateStaffStatusAction({
        tenantId: "t1",
        role: "landlord_staff",
        userId: "u1",
        status: "active",
      }).ok,
    ).toBe(false);
  });
});
