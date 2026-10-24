import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static authz contract for provision-staff (Phase 3B.3C).
 * Does not invoke the Edge Function or contact Auth/DB.
 */
describe("provision-staff Edge Function authz (static)", () => {
  const indexPath = resolve(
    process.cwd(),
    "../supabase/functions/provision-staff/index.ts",
  );
  const logicPath = resolve(
    process.cwd(),
    "../supabase/functions/provision-staff/logic.ts",
  );
  const indexSrc = readFileSync(indexPath, "utf8");
  const logicSrc = readFileSync(logicPath, "utf8");

  function withoutLineComments(source: string): string {
    return source
      .split("\n")
      .map((line) => (line.trimStart().startsWith("//") ? "" : line))
      .join("\n");
  }

  const indexBody = withoutLineComments(indexSrc);
  const logicBody = withoutLineComments(logicSrc);

  it("requires JWT and rejects unauthenticated callers", () => {
    expect(indexBody).toMatch(/req\.headers\.get\(["']Authorization["']\)/);
    expect(indexBody).toContain("caller.auth.getUser()");
    expect(indexBody).toMatch(/code:\s*["']unauthorized["']/);
  });

  it("hard-codes landlord_staff and rejects client-supplied role", () => {
    expect(indexBody).toContain('p_role: "landlord_staff"');
    expect(logicBody).toContain("role_not_allowed");
    expect(logicBody).toMatch(
      /body\.role !== undefined && body\.role !== null && String\(body\.role\)\.length > 0/,
    );
    expect(indexBody).toContain('role !== "landlord_admin"');
  });

  it("scopes authorization to active landlord_admin on an active landlord tenant", () => {
    expect(indexBody).toMatch(/\.from\(["']tenant_memberships["']\)/);
    expect(indexBody).toMatch(/\.eq\(["']tenant_id["'],\s*tenantId\)/);
    expect(indexBody).toMatch(/\.eq\(["']user_id["'],\s*user\.id\)/);
    expect(indexBody).toMatch(/\.eq\(["']status["'],\s*["']active["']\)/);
    expect(indexBody).toContain('tenant.tenant_type !== "landlord"');
    expect(indexBody).toContain('tenant.status !== "active"');
    expect(indexBody).toMatch(/code:\s*["']forbidden["']/);
  });

  it("assigns membership via caller JWT manage_membership (not service-role RPC)", () => {
    expect(indexBody).toMatch(/await caller\.rpc\(\s*["']manage_membership["']/);
    expect(indexBody).not.toMatch(/admin\.rpc\(\s*["']manage_membership["']/);
  });

  it("fail-closes when email delivery readiness is not verified", () => {
    expect(indexBody).toContain("PROVISION_STAFF_EMAIL_DELIVERY_READY");
    expect(logicBody).toContain("isEmailDeliveryReady");
    expect(indexBody).toMatch(/code:\s*["']email_delivery_unverified["']/);
    expect(indexBody).toMatch(/503/);
  });

  it("sanitizes secrets and uses compensation cleanup on failure", () => {
    expect(logicBody).toContain("sanitizeLandlordResponse");
    expect(logicBody).toContain("access_token");
    expect(logicBody).toContain("refresh_token");
    expect(logicBody).toContain("action_link");
    expect(indexBody).toContain("runCompensationDelete");
    expect(indexBody).toContain("compensationFailureResponse");
    expect(indexBody).toContain("auth.admin.deleteUser");
  });

  it("does not grant utility roles or rewrite utility membership paths", () => {
    expect(indexBody).not.toMatch(/p_role:\s*["']utility_/);
    expect(indexBody).not.toContain("list_company_member_profiles");
    expect(indexBody).not.toContain("utility_admin");
    expect(indexBody).not.toContain("utility_staff");
  });
});
