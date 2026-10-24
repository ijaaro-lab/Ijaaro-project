import { describe, expect, it } from "vitest";
import {
  assertSafeProvisionStaffResponse,
  parseProvisionStaffResponse,
  validateProvisionStaffInput,
} from "./provisionStaff";

describe("validateProvisionStaffInput", () => {
  it("accepts a valid landlord_admin payload", () => {
    const result = validateProvisionStaffInput({
      tenantId: "11111111-1111-4111-8111-111111111111",
      role: "landlord_admin",
      fullNameRaw: "Alex Manager",
      emailRaw: "alex@example.com",
      phoneRaw: "+255700000000",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects landlord_staff", () => {
    const result = validateProvisionStaffInput({
      tenantId: "11111111-1111-4111-8111-111111111111",
      role: "landlord_staff",
      fullNameRaw: "Alex Manager",
      emailRaw: "alex@example.com",
      phoneRaw: "",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = validateProvisionStaffInput({
      tenantId: "11111111-1111-4111-8111-111111111111",
      role: "landlord_admin",
      fullNameRaw: "Alex",
      emailRaw: "not-an-email",
      phoneRaw: "",
    });
    expect(result.ok).toBe(false);
  });
});

describe("parseProvisionStaffResponse", () => {
  it("parses success and blocks secret leakage", () => {
    expect(
      parseProvisionStaffResponse({
        ok: true,
        user_id: "u1",
        role: "landlord_staff",
        message: "ok",
      }),
    ).toEqual({
      ok: true,
      user_id: "u1",
      role: "landlord_staff",
      message: "ok",
      membership_status: undefined,
    });

    expect(assertSafeProvisionStaffResponse({ access_token: "x" })).toBeTruthy();
    expect(parseProvisionStaffResponse({ access_token: "x" }).ok).toBe(false);
  });
});
