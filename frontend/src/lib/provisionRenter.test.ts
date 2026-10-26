import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeProvisionResponse,
  parseProvisionRenterResponse,
  validateProvisionRenterInput,
} from "./provisionRenter";
import {
  compensationFailureResponse,
  emailExactImatchPattern,
  isEmailDeliveryReady,
  mapInviteFailureForLandlord,
  runCompensationDelete,
  sanitizeLandlordResponse,
  validateProvisionInput,
} from "../../../supabase/functions/provision-renter/logic";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("provisionRenter client validation", () => {
  it("accepts a valid landlord_admin payload", () => {
    const result = validateProvisionRenterInput({
      tenantId,
      role: "landlord_admin",
      fullNameRaw: "Jane Doe",
      usernameRaw: "Jane_Doe",
      emailRaw: "jane@example.com",
      phoneRaw: "+252611111111",
    });
    expect(result).toEqual({
      ok: true,
      tenantId,
      fullName: "Jane Doe",
      username: "jane_doe",
      email: "jane@example.com",
      phone: "+252611111111",
    });
  });

  it("rejects landlord_staff", () => {
    const result = validateProvisionRenterInput({
      tenantId,
      role: "landlord_staff",
      fullNameRaw: "Jane Doe",
      usernameRaw: "jane_doe",
      emailRaw: "jane@example.com",
      phoneRaw: "+252611111111",
    });
    expect(result.ok).toBe(false);
  });
});

describe("provision-renter edge logic", () => {
  it("hard-rejects client-supplied role", () => {
    const result = validateProvisionInput({
      tenant_id: tenantId,
      full_name: "Jane",
      username: "jane_doe",
      email: "jane@example.com",
      phone: "+252611111111",
      role: "landlord_admin",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("role_not_allowed");
  });

  it("always omits activation URL and password fields from landlord response", () => {
    const safe = sanitizeLandlordResponse({
      ok: true,
      user_id: "u1",
      action_link: "https://evil.example/invite?token=secret",
      password: "should-not-leak",
      nested: { access_token: "tok", username: "jane_doe" },
    });
    expect(safe.action_link).toBeUndefined();
    expect(safe.password).toBeUndefined();
    expect((safe.nested as { access_token?: string; username?: string }).access_token).toBeUndefined();
    expect((safe.nested as { username?: string }).username).toBe("jane_doe");
    expect(assertSafeProvisionResponse(safe)).toBeNull();
    expect(
      assertSafeProvisionResponse({ action_link: "https://x" }),
    ).toMatch(/sensitive/i);
  });

  it("fails closed when email delivery flag is unset", () => {
    expect(isEmailDeliveryReady(undefined)).toBe(false);
    expect(isEmailDeliveryReady("false")).toBe(false);
    expect(isEmailDeliveryReady("true")).toBe(true);
  });

  it("parseProvisionRenterResponse does not claim success on blocked provisioning", () => {
    const parsed = parseProvisionRenterResponse({
      error: "Secure activation email delivery is not verified for this environment. Provisioning is blocked.",
      code: "email_delivery_unverified",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe("email_delivery_unverified");
  });
});

describe("H2 case-insensitive email match pattern", () => {
  it("builds an imatch pattern that treats mixed-case and special chars as literals", () => {
    const pattern = emailExactImatchPattern("jane.doe+tag_1@example.com");
    expect(pattern).toBe("^jane\\.doe\\+tag_1@example\\.com$");
    expect(new RegExp(pattern, "i").test("Jane.Doe+tag_1@Example.COM")).toBe(true);
    expect(new RegExp(pattern, "i").test("janeXdoe+tag_1@example.com")).toBe(false);
  });
});

describe("M1 invite error sanitization", () => {
  it("never returns raw Auth/provider details to the landlord", () => {
    const raw =
      "Error sending invite email to jane@example.com via smtp://user:secret@mail:587 action_link=https://x/invite?token=abc";
    const mapped = mapInviteFailureForLandlord(raw);
    expect(mapped.status).toBe(503);
    expect(mapped.body.code).toBe("invite_failed");
    expect(mapped.body.error).toMatch(/could not be sent|Invitation failed/i);
    expect(JSON.stringify(mapped.body)).not.toMatch(/smtp|action_link|token=|secret|jane@/i);
  });

  it("maps already-registered messages to email_exists without raw text", () => {
    const mapped = mapInviteFailureForLandlord("A user with this email address has already been registered");
    expect(mapped.status).toBe(409);
    expect(mapped.body.code).toBe("email_exists");
    expect(JSON.stringify(mapped.body)).not.toMatch(/already been registered/i);
  });
});

describe("H1 compensation visibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports success when deleteUser succeeds", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runCompensationDelete(
      async () => ({ error: null }),
      "22222222-2222-4222-8222-222222222222",
      { requestId: "req-1", stage: "profile_failed" },
    );
    expect(result).toEqual({ ok: true });
    expect(log).toHaveBeenCalled();
    const payload = String(log.mock.calls[0]?.[0] ?? "");
    expect(payload).toContain("compensation_ok");
    expect(payload).toContain("req-1");
    expect(payload).not.toMatch(/password|action_link|token|@/);
  });

  it("reports failure when deleteUser returns an error and does not claim cleanup ok", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runCompensationDelete(
      async () => ({ error: { message: "db down" } }),
      "22222222-2222-4222-8222-222222222222",
      { requestId: "req-2", stage: "membership_failed" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("delete_user_failed");
    const landlord = compensationFailureResponse("req-2");
    expect(landlord.code).toBe("compensation_failed");
    expect(landlord.request_id).toBe("req-2");
    expect(landlord.error).not.toMatch(/db down|rolled back/i);
    expect(String(log.mock.calls[0]?.[0] ?? "")).toContain("compensation_failed");
  });

  it("reports failure when deleteUser throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runCompensationDelete(
      async () => {
        throw new Error("network");
      },
      "22222222-2222-4222-8222-222222222222",
      { requestId: "req-3", stage: "unexpected" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("delete_user_exception");
  });
});
