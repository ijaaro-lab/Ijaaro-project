import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static contract checks for C1/H1 membership write hardening.
 * Runtime RLS coverage requires a local isolated Supabase apply (not Live).
 */
describe("membership write hardening migration (C1 + H1)", () => {
  const path = resolve(
    process.cwd(),
    "../supabase/migrations/20261022194500_membership_write_hardening_c1_h1.sql",
  );
  const sql = readFileSync(path, "utf8");

  /** Strip SQL line comments so comment-only phrases cannot satisfy body assertions. */
  function withoutLineComments(source: string): string {
    return source
      .split("\n")
      .map((line) => {
        const idx = line.indexOf("--");
        return idx === -1 ? line : line.slice(0, idx);
      })
      .join("\n");
  }

  function policyBlock(policyName: string): string {
    const marker = `CREATE POLICY ${policyName}`;
    const start = sql.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);
    const after = sql.slice(start);
    const endMatch = after.search(/\nCOMMENT ON POLICY|\nDROP POLICY|\nCREATE OR REPLACE FUNCTION|\n-- -{3,}/);
    const block = endMatch === -1 ? after : after.slice(0, endMatch);
    return withoutLineComments(block);
  }

  function manageMembershipBody(): string {
    const start = sql.lastIndexOf(
      "CREATE OR REPLACE FUNCTION public.manage_membership(",
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const fromFn = sql.slice(start);
    const dollar = fromFn.indexOf("AS $$");
    expect(dollar).toBeGreaterThanOrEqual(0);
    const bodyStart = dollar + "AS $$".length;
    const bodyEnd = fromFn.indexOf("\n$$;", bodyStart);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    return withoutLineComments(fromFn.slice(bodyStart, bodyEnd));
  }

  it("C1: direct membership INSERT policy is Super Admin–only", () => {
    const insert = policyBlock("memberships_insert_authorized");
    expect(insert).toMatch(
      /CREATE POLICY memberships_insert_authorized\s+ON public\.tenant_memberships FOR INSERT TO authenticated/,
    );
    expect(insert).toMatch(/WITH CHECK\s*\(\s*public\.is_super_admin\(\)\s*\)/);
    expect(insert).not.toMatch(/landlord_admin|utility_admin|landlord_staff/);
  });

  it("C1: direct membership UPDATE policy is Super Admin–only", () => {
    const update = policyBlock("memberships_update_authorized");
    expect(update).toMatch(
      /CREATE POLICY memberships_update_authorized\s+ON public\.tenant_memberships FOR UPDATE TO authenticated/,
    );
    expect(update).toMatch(/USING\s*\(\s*public\.is_super_admin\(\)\s*\)/);
    expect(update).toMatch(/WITH CHECK\s*\(\s*public\.is_super_admin\(\)\s*\)/);
    expect(update).not.toMatch(/landlord_admin|utility_admin|landlord_staff/);
  });

  it("H1: landlord-admin conflict path refuses updating an existing landlord_admin", () => {
    const body = manageMembershipBody();

    // Conflict/update guard must live on the tenant_memberships row, not only in prose.
    expect(body).toMatch(
      /ON CONFLICT\s*\(\s*tenant_id\s*,\s*user_id\s*\)\s+DO UPDATE[\s\S]*?WHERE\s+public\.tenant_memberships\.role\s+IS DISTINCT FROM\s+'landlord_admin'::public\.app_role/,
    );

    expect(body).toContain(
      "RAISE EXCEPTION 'cannot modify an existing landlord_admin membership'",
    );
    expect(body).toMatch(
      /v_existing_role\s*=\s*'landlord_admin'::public\.app_role/,
    );
  });

  it("preserves utility_admin in manage_membership caller authorization", () => {
    const body = manageMembershipBody();
    expect(body).toMatch(
      /public\.has_role\(\s*p_tenant_id\s*,\s*ARRAY\s*\[\s*'landlord_admin'\s*,\s*'utility_admin'\s*\]\s*::public\.app_role\[\]\s*\)/,
    );
  });

  it("keeps manage_membership SECURITY DEFINER with locked search_path and grants", () => {
    const fnHeader = withoutLineComments(
      sql.slice(
        sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.manage_membership("),
        sql.indexOf("AS $$", sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.manage_membership(")),
      ),
    );
    expect(fnHeader).toMatch(/SECURITY DEFINER/);
    expect(fnHeader).toMatch(/SET search_path = public/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.manage_membership\(uuid, uuid, public\.app_role, public\.membership_status\)\s+FROM anon/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.manage_membership\(uuid, uuid, public\.app_role, public\.membership_status\)\s+TO authenticated/i,
    );
  });
});
