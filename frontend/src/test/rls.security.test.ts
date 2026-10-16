/**
 * Phase 1 RLS / authorization security tests.
 *
 * Requires (frontend/.env.local or repo-root .env.local):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY  (server-only; never ship to browser)
 *
 * Run from frontend/: npm test -- src/test/rls.security.test.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), "../.env.local") });

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = Boolean(url && anon && service);
const describeSecurity = configured ? describe : describe.skip;

describeSecurity("Phase 1 RLS isolation", () => {
  const emails: Record<string, string> = {};
  const password = "TestPass123!_rls";
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    admin = createClient(url!, service!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const suffix = randomUUID().slice(0, 8);

    const make = async (key: string, name: string) => {
      const email = `${key}_${suffix}@ijaaro.test`;
      emails[key] = email;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      if (error) throw error;
      await admin.from("profiles").upsert({
        id: data.user.id,
        full_name: name,
        email,
      });
      ids[key] = data.user.id;
      return data.user.id;
    };

    await make("super", "Super");
    await make("llA", "Landlord A");
    await make("llB", "Landlord B");
    await make("waA", "Water A");
    await make("waB", "Water B");
    await make("elA", "Elec A");
    await make("elB", "Elec B");
    await make("out", "Outsider");
    await make("inact", "Inactive");

    const insertTenant = async (
      key: string,
      type: string,
      ownerKey: string,
      role: string,
    ) => {
      const { data, error } = await admin
        .from("tenants")
        .insert({
          name: `${key} ${suffix}`,
          slug: `${key}-${suffix}`.toLowerCase().replace(/_/g, "-"),
          tenant_type: type,
          status: "active",
        })
        .select("*")
        .single();
      if (error) throw error;
      ids[`tenant_${key}`] = data.id;
      const { error: mErr } = await admin.from("tenant_memberships").insert({
        tenant_id: data.id,
        user_id: ids[ownerKey],
        role,
        status: "active",
      });
      if (mErr) throw mErr;
      return data.id;
    };

    await insertTenant("platform", "platform", "super", "super_admin");
    await insertTenant("landlordA", "landlord", "llA", "landlord_admin");
    await insertTenant("landlordB", "landlord", "llB", "landlord_admin");
    await insertTenant("waterA", "water_company", "waA", "utility_admin");
    await insertTenant("waterB", "water_company", "waB", "utility_admin");
    await insertTenant("elecA", "electricity_company", "elA", "utility_admin");
    await insertTenant("elecB", "electricity_company", "elB", "utility_admin");

    await admin.from("tenant_memberships").insert({
      tenant_id: ids.tenant_landlordA,
      user_id: ids.inact,
      role: "landlord_staff",
      status: "disabled",
    });
  }, 120_000);

  async function asUser(key: string) {
    const c = createClient(url!, anon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({
      email: emails[key],
      password,
    });
    if (error) throw error;
    return c;
  }

  it("1. anonymous cannot read tenants", async () => {
    const c = createClient(url!, anon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await c.from("tenants").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("2. outsider cannot read landlord A tenant", async () => {
    const c = await asUser("out");
    const { data } = await c
      .from("tenants")
      .select("id")
      .eq("id", ids.tenant_landlordA);
    expect(data ?? []).toHaveLength(0);
  });

  it("3. landlord A cannot read landlord B", async () => {
    const c = await asUser("llA");
    const { data } = await c
      .from("tenants")
      .select("id")
      .eq("id", ids.tenant_landlordB);
    expect(data ?? []).toHaveLength(0);
  });

  it("4. landlord A cannot insert a tenant row", async () => {
    const c = await asUser("llA");
    const { error } = await c.from("tenants").insert({
      name: "Hijack",
      slug: `hijack-${randomUUID().slice(0, 8)}`,
      tenant_type: "landlord",
      status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("5. landlord A cannot update landlord B", async () => {
    const c = await asUser("llA");
    const { data, error } = await c
      .from("tenants")
      .update({ name: "Owned" })
      .eq("id", ids.tenant_landlordB)
      .select();
    expect(Boolean(error) || (data ?? []).length === 0).toBe(true);
  });

  it("6. landlord A cannot delete landlord B", async () => {
    const c = await asUser("llA");
    const { data, error } = await c
      .from("tenants")
      .delete()
      .eq("id", ids.tenant_landlordB)
      .select();
    expect(Boolean(error) || (data ?? []).length === 0).toBe(true);
  });

  it("7. inactive membership does not grant access", async () => {
    const c = await asUser("inact");
    const { data } = await c
      .from("tenants")
      .select("id")
      .eq("id", ids.tenant_landlordA);
    expect(data ?? []).toHaveLength(0);
  });

  it("8. user cannot self-promote to super_admin via membership insert", async () => {
    const c = await asUser("out");
    const { error } = await c.from("tenant_memberships").insert({
      tenant_id: ids.tenant_platform,
      user_id: ids.out,
      role: "super_admin",
      status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("9. landlord admin cannot grant platform privileges", async () => {
    const c = await asUser("llA");
    const { error } = await c.rpc("manage_membership", {
      p_tenant_id: ids.tenant_platform,
      p_user_id: ids.llA,
      p_role: "super_admin",
      p_status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("10. water A cannot access water B", async () => {
    const c = await asUser("waA");
    const { data } = await c
      .from("tenants")
      .select("id")
      .eq("id", ids.tenant_waterB);
    expect(data ?? []).toHaveLength(0);
  });

  it("11. electricity A cannot access electricity B", async () => {
    const c = await asUser("elA");
    const { data } = await c
      .from("tenants")
      .select("id")
      .eq("id", ids.tenant_elecB);
    expect(data ?? []).toHaveLength(0);
  });

  it("12. landlord access limited to own landlord tenant", async () => {
    const c = await asUser("llA");
    const { data } = await c.from("tenants").select("id, tenant_type");
    const types = new Set((data ?? []).map((t) => t.tenant_type));
    expect(types.has("water_company")).toBe(false);
    expect(types.has("electricity_company")).toBe(false);
    expect((data ?? []).some((t) => t.id === ids.tenant_landlordA)).toBe(true);
  });

  it("13. unauthorized tenant creation via RPC rejected", async () => {
    const c = await asUser("llA");
    const { error } = await c.rpc("provision_tenant", {
      p_name: "Nope",
      p_slug: `nope-${randomUUID().slice(0, 8)}`,
      p_tenant_type: "landlord",
      p_status: "pending",
    });
    expect(error).toBeTruthy();
  });

  it("14. unauthorized tenant status change rejected", async () => {
    const c = await asUser("llA");
    const { error } = await c.rpc("set_tenant_status", {
      p_tenant_id: ids.tenant_landlordB,
      p_status: "suspended",
    });
    expect(error).toBeTruthy();
  });

  it("15. ordinary users cannot tamper with audit_logs", async () => {
    const c = await asUser("llA");
    const { error: insErr } = await c.from("audit_logs").insert({
      tenant_id: ids.tenant_landlordA,
      actor_id: ids.llA,
      action: "fake",
      entity_type: "tenant",
      entity_id: ids.tenant_landlordA,
      metadata: {},
    } as never);
    expect(insErr).toBeTruthy();

    const { data: existing } = await admin.from("audit_logs").select("id").limit(1);
    if (existing?.[0]) {
      const { data, error } = await c
        .from("audit_logs")
        .delete()
        .eq("id", existing[0].id)
        .select();
      expect(Boolean(error) || (data ?? []).length === 0).toBe(true);
    }
  });

  it("16. profile provisioning is idempotent and tied to auth user", async () => {
    const c = await asUser("out");
    const {
      data: { user },
    } = await c.auth.getUser();
    expect(user?.id).toBe(ids.out);

    const { data: profile } = await c
      .from("profiles")
      .select("*")
      .eq("id", ids.out)
      .maybeSingle();
    expect(profile?.id).toBe(ids.out);

    const { error } = await c.from("profiles").insert({
      id: randomUUID(),
      full_name: "Imposter",
      email: "imposter@ijaaro.test",
    });
    expect(error).toBeTruthy();
  });

  it("positive: super admin can provision tenant", async () => {
    const c = await asUser("super");
    const slug = `ok-${randomUUID().slice(0, 8)}`;
    const { data, error } = await c.rpc("provision_tenant", {
      p_name: "Provisioned OK",
      p_slug: slug,
      p_tenant_type: "landlord",
      p_status: "pending",
      p_owner_user_id: ids.llA,
      p_owner_role: "landlord_admin",
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it("17. landlord A cannot read landlord B memberships", async () => {
    const c = await asUser("llA");
    const { data } = await c
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", ids.tenant_landlordB);
    expect(data ?? []).toHaveLength(0);
  });

  it("18. landlord cannot read utility accounts of another tenant", async () => {
    const c = await asUser("llA");
    const { data } = await c
      .from("utility_accounts")
      .select("id")
      .eq("tenant_id", ids.tenant_waterA);
    expect(data ?? []).toHaveLength(0);
  });

  it("19. water admin cannot read landlord tenant row", async () => {
    const c = await asUser("waA");
    const { data } = await c
      .from("tenants")
      .select("id")
      .eq("id", ids.tenant_landlordA);
    expect(data ?? []).toHaveLength(0);
  });
});

if (!configured) {
  describe("Phase 1 RLS isolation (env missing)", () => {
    it("not run: set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY", () => {
      expect(configured).toBe(false);
    });
  });
}
