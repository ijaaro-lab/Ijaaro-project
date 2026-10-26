import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

  it("hard-codes landlord_staff and rejects client role", () => {
    expect(indexSrc).toContain('p_role: "landlord_staff"');
    expect(logicSrc).toContain("role_not_allowed");
    expect(indexSrc).toContain('role !== "landlord_admin"');
  });

  it("fail-closes on email delivery readiness flag", () => {
    expect(indexSrc).toContain("PROVISION_STAFF_EMAIL_DELIVERY_READY");
    expect(logicSrc).toContain("isEmailDeliveryReady");
  });

  it("sanitizes secrets from landlord responses", () => {
    expect(logicSrc).toContain("sanitizeLandlordResponse");
    expect(logicSrc).toContain("access_token");
    expect(logicSrc).toContain("refresh_token");
  });
});
