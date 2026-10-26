import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static contract checks for RP-1.3 review_rent_payment rejection-reason migration.
 * Runtime coverage is in rls.rental.test.ts after a local apply.
 */
describe("review_rent_payment require rejection reason migration", () => {
  const path = resolve(
    process.cwd(),
    "../supabase/migrations/20261021120000_review_rent_payment_require_rejection_reason.sql",
  );
  const sql = readFileSync(path, "utf8");

  it("replaces review_rent_payment with the same argument signature", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.review_rent_payment(",
    );
    expect(sql).toMatch(/p_payment_id\s+uuid/);
    expect(sql).toMatch(/p_decision\s+text/);
    expect(sql).toMatch(/p_rejection_reason\s+text\s+DEFAULT\s+NULL/);
    expect(sql).toMatch(/RETURNS\s+jsonb/);
  });

  it("keeps SECURITY DEFINER and safe search_path", () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
  });

  it("requires a non-empty trimmed reason before reject update", () => {
    expect(sql).toContain("rejection reason is required");
    expect(sql).toMatch(/regexp_replace\(COALESCE\(p_rejection_reason,\s*''\),\s*E'\^\\\\s\+\|\\\\s\+\$'/);
    expect(sql).toMatch(/IF v_reason IS NULL THEN/);
    expect(sql).toMatch(/ERRCODE = '22023'/);
  });

  it("persists the trimmed reason and does not update charge on reject", () => {
    expect(sql).toMatch(/rejection_reason\s*=\s*v_reason/);
    expect(sql).toContain("'rent.payment_rejected'");
    // Reject return uses charge snapshot without an UPDATE on rent_charges in that branch
    const rejectBlock = sql.slice(
      sql.indexOf("IF v_decision = 'reject' THEN"),
      sql.indexOf("-- approve"),
    );
    expect(rejectBlock).not.toMatch(/UPDATE\s+public\.rent_charges/i);
  });

  it("preserves authorize + grant posture", () => {
    expect(sql).toContain("can_approve_rent(v_payment.tenant_id)");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.review_rent_payment\(uuid, text, text\) FROM anon/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.review_rent_payment\(uuid, text, text\) TO authenticated/i,
    );
  });
});
