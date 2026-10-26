import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static contract checks for C1/H1 membership write hardening.
 * Runtime coverage: src/test/rls.membershipHardening.test.ts (isolated local only).
 */
describe("membership write hardening migration (C1 + H1)", () => {
  const path = resolve(
    process.cwd(),
    "../supabase/migrations/20261022194500_membership_write_hardening_c1_h1.sql",
  );
  const sql = readFileSync(path, "utf8");

  it("restricts direct membership INSERT/UPDATE policies to Super Admin only", () => {
    expect(sql).toContain("DROP POLICY IF EXISTS memberships_insert_authorized");
    expect(sql).toContain("DROP POLICY IF EXISTS memberships_update_authorized");
    expect(sql).toMatch(
      /CREATE POLICY memberships_insert_authorized[\s\S]*WITH CHECK \(public\.is_super_admin\(\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY memberships_update_authorized[\s\S]*USING \(public\.is_super_admin\(\)\)[\s\S]*WITH CHECK \(public\.is_super_admin\(\)\)/,
    );
  });

  it("does not leave landlord_admin direct-write WITH CHECK paths in this migration", () => {
    const insertPolicy = sql.slice(
      sql.indexOf("CREATE POLICY memberships_insert_authorized"),
      sql.indexOf("DROP POLICY IF EXISTS memberships_update_authorized"),
    );
    expect(insertPolicy).not.toContain("landlord_admin");
    expect(insertPolicy).not.toContain("utility_admin");
  });

  it("hardens manage_membership against demoting existing landlord_admin", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.manage_membership(");
    expect(sql).toContain("cannot modify an existing landlord_admin membership");
    expect(sql).toContain("landlord admins may only grant landlord_staff or renter");
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
  });

  it("keeps execute grants for authenticated and revokes anon", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.manage_membership\(uuid, uuid, public\.app_role, public\.membership_status\)\s+FROM anon/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.manage_membership\(uuid, uuid, public\.app_role, public\.membership_status\)\s+TO authenticated/i,
    );
  });
});
