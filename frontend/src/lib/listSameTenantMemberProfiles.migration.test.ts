import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static contract checks for RP-1.3.6 migration (not applied in this task).
 * Runtime RLS coverage remains in rls.rental.test.ts after a local apply.
 */
describe("list_same_tenant_member_profiles migration (RP-1.3.6)", () => {
  const path = resolve(
    process.cwd(),
    "../supabase/migrations/20261020110000_list_same_tenant_member_profiles.sql",
  );
  const sql = readFileSync(path, "utf8");

  it("defines the SECURITY DEFINER function with the caller Args shape", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.list_same_tenant_member_profiles(p_tenant_id uuid)",
    );
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
  });

  it("returns only the fields required by invite/assign UI + Database types", () => {
    expect(sql).toMatch(/user_id\s+uuid/);
    expect(sql).toMatch(/full_name\s+text/);
    expect(sql).toMatch(/email\s+text/);
    expect(sql).toMatch(/role\s+public\.app_role/);
    expect(sql).toMatch(/membership_status\s+public\.membership_status/);
  });

  it("gates access with can_manage_landlord_ops and denies unauthorized callers", () => {
    expect(sql).toContain("can_manage_landlord_ops(p_tenant_id)");
    expect(sql).toMatch(/RAISE EXCEPTION 'not authorized'/);
    expect(sql).toMatch(/ERRCODE = '42501'/);
  });

  it("scopes results to active renters on the requested tenant only", () => {
    expect(sql).toContain("tm.tenant_id = p_tenant_id");
    expect(sql).toContain("tm.status = 'active'");
    expect(sql).toContain("tm.role = 'renter'");
  });

  it("is not granted to anon and is executable by authenticated", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.list_same_tenant_member_profiles\(uuid\) FROM anon/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.list_same_tenant_member_profiles\(uuid\) TO authenticated/i,
    );
  });
});
