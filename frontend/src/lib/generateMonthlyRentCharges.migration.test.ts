import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static contract checks for automatic monthly rent charge generation.
 * Runtime coverage requires applying the migration on isolated local Supabase.
 */
describe("generate_monthly_rent_charges migration", () => {
  const path = resolve(
    process.cwd(),
    "../supabase/migrations/20261024120000_generate_monthly_rent_charges.sql",
  );
  const sql = readFileSync(path, "utf8");

  it("defines generate_monthly_rent_charges with as_of and max_months", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.generate_monthly_rent_charges(");
    expect(sql).toMatch(/p_as_of\s+date\s+DEFAULT\s+CURRENT_DATE/);
    expect(sql).toMatch(/p_max_months\s+integer\s+DEFAULT\s+3/);
    expect(sql).toMatch(/RETURNS\s+jsonb/);
  });

  it("keeps SECURITY DEFINER and safe search_path", () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
  });

  it("restricts execution to service_role and revokes anon/authenticated", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.generate_monthly_rent_charges\(date, integer\)\s+FROM anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.generate_monthly_rent_charges\(date, integer\)\s+TO service_role/i,
    );
    expect(sql).toContain("service_role");
    expect(sql).toContain("not authorized");
  });

  it("only processes active assignments and respects end_date", () => {
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("r.end_date IS NOT NULL AND v_cursor > r.end_date");
    expect(sql).toContain("v_period_start > r.end_date");
  });

  it("prevents duplicates via ON CONFLICT on assignment period", () => {
    expect(sql).toContain(
      "ON CONFLICT (assignment_id, period_start, period_end) DO NOTHING",
    );
    expect(sql).toContain("skipped_duplicate");
  });

  it("validates period_end >= period_start and does not mark charges paid", () => {
    expect(sql).toContain("invalid period");
    expect(sql).toContain("IF v_period_end < v_period_start THEN");
    expect(sql).not.toMatch(/status\s*=\s*'paid'/);
    expect(sql).toMatch(/amount_paid,\s*balance/);
    expect(sql).toMatch(/0,\s*\n\s*r\.rent_amount/);
  });

  it("caps catch-up months and avoids unbounded historical backfill when no prior charge", () => {
    expect(sql).toContain("p_max_months must be between 1 and 24");
    expect(sql).toContain("no historical backfill");
    expect(sql).toContain("v_cursor := v_month_cap");
  });

  it("does not rewrite create_rent_charge or assign_renter", () => {
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.create_rent_charge");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.assign_renter");
  });

  it("schedules via pg_cron only when the extension is already installed", () => {
    expect(sql).toContain("extname = 'pg_cron'");
    expect(sql).toContain("ijaaro_generate_monthly_rent_charges");
    expect(sql).toContain("pg_cron not installed");
    expect(sql).not.toMatch(/CREATE EXTENSION\s+.*pg_cron/i);
  });

  it("audits auto-created charges without mutating payments", () => {
    expect(sql).toContain("'rent.charge_auto_created'");
    expect(sql).not.toContain("INSERT INTO public.rent_payments");
    expect(sql).not.toContain("UPDATE public.rent_payments");
  });
});
