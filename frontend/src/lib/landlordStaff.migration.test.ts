import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static contract checks for Phase A landlord-staff properties-only migration.
 * Runtime RLS coverage requires a local isolated Supabase apply (not Live).
 */
describe("landlord_staff properties-only migration (Phase A)", () => {
  const path = resolve(
    process.cwd(),
    "../supabase/migrations/20261022190000_landlord_staff_properties_only.sql",
  );
  const sql = readFileSync(path, "utf8");

  it("defines can_manage_landlord_properties for admin + staff", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.can_manage_landlord_properties(p_tenant_id uuid)",
    );
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toContain("landlord_admin");
    expect(sql).toContain("landlord_staff");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.can_manage_landlord_properties\(uuid\) FROM PUBLIC, anon/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.can_manage_landlord_properties\(uuid\) TO authenticated/i,
    );
  });

  it("narrows can_manage_landlord_ops to landlord_admin only", () => {
    const opsBlock = sql.slice(
      sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.can_manage_landlord_ops"),
    );
    expect(opsBlock).toContain("tm.role = 'landlord_admin'");
    expect(opsBlock).not.toMatch(
      /tm\.role IN \('landlord_admin',\s*'landlord_staff'\)/,
    );
  });

  it("retargets property insert/update to properties helper and keeps delete admin-only", () => {
    expect(sql).toContain("can_manage_landlord_properties(tenant_id)");
    expect(sql).toMatch(
      /CREATE POLICY properties_delete[\s\S]*has_role\(tenant_id,\s*ARRAY\['landlord_admin'\]/,
    );
  });

  it("allows staff photo insert/update but admin-only photo and storage delete", () => {
    expect(sql).toMatch(
      /CREATE POLICY property_photos_insert[\s\S]*can_manage_landlord_properties/,
    );
    expect(sql).toMatch(
      /CREATE POLICY property_photos_delete[\s\S]*ARRAY\['landlord_admin'\]/,
    );
    expect(sql).toMatch(
      /CREATE POLICY property_photos_storage_insert[\s\S]*can_manage_landlord_properties/,
    );
    expect(sql).toMatch(
      /CREATE POLICY property_photos_storage_delete[\s\S]*ARRAY\['landlord_admin'\]/,
    );
    expect(sql).toMatch(
      /CREATE POLICY property_photos_storage_update[\s\S]*ARRAY\['landlord_admin'\]/,
    );
  });

  it("removes landlord_staff from rental application SELECT and list RPC", () => {
    expect(sql).toMatch(
      /CREATE POLICY rental_applications_select[\s\S]*ARRAY\['landlord_admin'\]::public\.app_role\[\]/,
    );
    expect(sql).toMatch(
      /has_role\(a\.tenant_id,\s*ARRAY\['landlord_admin'\]::public\.app_role\[\]\)/,
    );
    expect(sql).not.toMatch(
      /has_role\(a\.tenant_id,\s*ARRAY\['landlord_admin',\s*'landlord_staff'\]/,
    );
    expect(sql).not.toMatch(
      /has_role\(tenant_id,\s*ARRAY\['landlord_admin',\s*'landlord_staff'\]/,
    );
  });

  it("hardens manage_membership so landlord admins may only grant staff or renter", () => {
    expect(sql).toContain("landlord admins may only grant landlord_staff or renter");
    expect(sql).toContain("'landlord_staff'::public.app_role");
    expect(sql).toContain("'renter'::public.app_role");
    expect(sql).toMatch(/NOT public\.is_super_admin\(\)/);
  });

  it("adds landlord-admin email lookup without changing SA lookup_profile_by_email body", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.lookup_profile_by_email_for_landlord_admin(",
    );
    expect(sql).toContain("p_email text");
    expect(sql).toContain("p_tenant_id uuid");
    expect(sql).toContain("ARRAY['landlord_admin']");
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.lookup_profile_by_email\(p_email text\)/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.lookup_profile_by_email_for_landlord_admin\(text, uuid\)\s+FROM anon/i,
    );
  });

  it("adds list_landlord_staff_profiles for active and disabled staff only", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.list_landlord_staff_profiles(p_tenant_id uuid)",
    );
    expect(sql).toContain("tm.role = 'landlord_staff'");
    expect(sql).toContain("'disabled'::public.membership_status");
    expect(sql).toContain("'active'::public.membership_status");
    expect(sql).not.toMatch(/password|token|service_role/i);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.list_landlord_staff_profiles\(uuid\) TO authenticated/i,
    );
  });

  it("makes owner_id immutable on client property updates", () => {
    expect(sql).toContain("property owner_id is immutable");
    expect(sql).toContain("NEW.owner_id IS DISTINCT FROM OLD.owner_id");
    expect(sql).toContain("ijaaro.internal");
  });

  it("does not redefine public listing RPCs or broaden anon property SELECT", () => {
    expect(sql).not.toContain("list_landlord_public_listings");
    expect(sql).not.toContain("get_landlord_public_listing");
    expect(sql).not.toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.properties\s+TO\s+anon/i);
  });
});
