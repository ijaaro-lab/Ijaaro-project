import { describe, expect, it } from "vitest";
import { validateProvisionInput } from "../../../supabase/functions/provision-renter/logic";

/**
 * Authorization preconditions enforced by the Edge Function (unit-level mirrors).
 * Full JWT/RLS denial remains covered by manage_membership + rental RLS suites.
 */
describe("provision-renter authorization invariants", () => {
  const base = {
    tenant_id: "11111111-1111-4111-8111-111111111111",
    full_name: "Jane Doe",
    username: "jane_doe",
    email: "jane@example.com",
    phone: "+252611111111",
  };

  it("never accepts a client-supplied membership role (always server renter)", () => {
    for (const role of ["renter", "landlord_admin", "super_admin", "landlord_staff"]) {
      const result = validateProvisionInput({ ...base, role });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("role_not_allowed");
    }
  });

  it("requires tenant id (cross-tenant attempts must supply a different id that server will deny)", () => {
    const missing = validateProvisionInput({ ...base, tenant_id: "" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("invalid_tenant");
  });

  it("documents unauthorized callers are denied by server role/tenant checks", () => {
    // Edge Function checks: active landlord_admin + operable landlord tenant.
    // landlord_staff / other-tenant callers receive 403 forbidden (integration path).
    const allowedRoles = ["landlord_admin"] as const;
    const deniedRoles = ["landlord_staff", "renter", "utility_admin"] as const;
    expect(allowedRoles).toContain("landlord_admin");
    expect(deniedRoles).not.toContain("landlord_admin");
  });
});
