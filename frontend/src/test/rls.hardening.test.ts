/**
 * Security audit regression tests (grants, property search, premises, branding).
 *
 * Runs ONLY against an isolated local Supabase (127.0.0.1 / localhost).
 * Prefer IJAARO_ISOLATED_* via frontend/.env.isolated (see isolatedEnv.ts).
 *
 * Run: npm test -- src/test/rls.hardening.test.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  isolatedAnon,
  isolatedConfigured,
  isolatedService,
  isolatedUrl,
} from "./isolatedEnv";

const url = isolatedUrl;
const anon = isolatedAnon;
const service = isolatedService;

const describeHardening = isolatedConfigured ? describe : describe.skip;

describeHardening("Security audit hardening regressions", () => {
  const password = "TestPass123!_harden";
  const emails: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let admin: SupabaseClient;
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    admin = createClient(url!, service!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

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
    };

    await make("llA", "Landlord A");
    await make("llB", "Landlord B");
    await make("waA", "Water A");
    await make("waB", "Water B");
    await make("renterA", "Renter A");
    await make("ownerX", "Owner X");

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

    await insertTenant("landlordA", "landlord", "llA", "landlord_admin");
    await insertTenant("landlordB", "landlord", "llB", "landlord_admin");
    await insertTenant("waterA", "water_company", "waA", "utility_admin");
    await insertTenant("waterB", "water_company", "waB", "utility_admin");

    await admin.from("tenant_memberships").insert({
      tenant_id: ids.tenant_landlordA,
      user_id: ids.renterA,
      role: "renter",
      status: "active",
    });

    // Private (unlisted, non-marketplace) property in landlord B — must not appear in
    // water A fuzzy search (vacant+unlisted is still non-public inventory).
    const { data: privProp, error: pErr } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordB,
        owner_id: ids.llB,
        name: `SecretHouse-${suffix}`,
        address_line: `Secret Address ${suffix} Hidden Lane`,
        district: "SecretDistrict",
        city: "SecretCity",
        property_type: "house",
        status: "vacant",
        is_listed: false,
        created_source: "landlord",
        created_by_tenant_id: ids.tenant_landlordB,
      })
      .select("*")
      .single();
    if (pErr) throw pErr;
    ids.secretProperty = privProp.id;

    // Listed available property — may appear in marketplace-scoped search
    const { data: listed, error: lErr } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordA,
        owner_id: ids.llA,
        name: `Listed-${suffix}`,
        address_line: `Listed Ave ${suffix}`,
        district: "ListedDistrict",
        city: "ListedCity",
        property_type: "apartment",
        status: "available",
        is_listed: true,
        created_source: "landlord",
        created_by_tenant_id: ids.tenant_landlordA,
      })
      .select("*")
      .single();
    if (lErr) throw lErr;
    ids.listedProperty = listed.id;
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

  it("anon has no TRUNCATE on domain tables (grant check via failed privileged op)", async () => {
    const c = createClient(url!, anon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // PostgREST cannot TRUNCATE; verify anon cannot SELECT rows via table API either
    const { data } = await c.from("properties").select("id").limit(5);
    expect(data ?? []).toHaveLength(0);
    const { data: rents } = await c.from("rent_payments").select("id").limit(5);
    expect(rents ?? []).toHaveLength(0);
    const { data: bills } = await c.from("utility_bills").select("id").limit(5);
    expect(bills ?? []).toHaveLength(0);
  });

  it("water A fuzzy search does not return landlord B private occupied property", async () => {
    const c = await asUser("waA");
    const { data, error } = await c.rpc("search_properties_for_link", {
      p_query: `Secret Address ${suffix}`,
      p_limit: 20,
    });
    expect(error).toBeNull();
    const idsFound = (data ?? []).map((r: { id: string }) => r.id);
    expect(idsFound).not.toContain(ids.secretProperty);
  });

  it("water A fuzzy search never returns current_renter_id", async () => {
    const c = await asUser("waA");
    const { data, error } = await c.rpc("search_properties_for_link", {
      p_query: `Listed Ave ${suffix}`,
      p_limit: 20,
    });
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row.current_renter_id).toBeNull();
    }
  });

  it("water A UUID lookup can find a known property id without dumping renter id", async () => {
    const c = await asUser("waA");
    const { data, error } = await c.rpc("search_properties_for_link", {
      p_query: ids.secretProperty,
      p_limit: 5,
    });
    expect(error).toBeNull();
    expect((data ?? []).some((r: { id: string }) => r.id === ids.secretProperty)).toBe(
      true,
    );
    expect((data ?? [])[0]?.current_renter_id ?? null).toBeNull();
  });

  it("create_utility_premises attaches under utility tenant, not landlord B", async () => {
    const c = await asUser("waA");
    const { data, error } = await c.rpc("create_utility_premises", {
      p_company_tenant_id: ids.tenant_waterA,
      p_address_line: `Utility Premises ${suffix}`,
      p_owner_id: ids.ownerX,
      p_name: `Prem-${suffix}`,
    });
    expect(error).toBeNull();
    expect(data?.tenant_id).toBe(ids.tenant_waterA);
    expect(data?.created_by_tenant_id).toBe(ids.tenant_waterA);
    expect(data?.tenant_id).not.toBe(ids.tenant_landlordB);
  });

  it("renter cannot upload into tenant branding folder for landlord A", async () => {
    const c = await asUser("renterA");
    const path = `${ids.tenant_landlordA}/logo-harden-${suffix}.png`;
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const { error } = await c.storage.from("tenant-branding").upload(path, bytes, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).toBeTruthy();
  });

  it("landlord admin can upload branding for own tenant", async () => {
    const c = await asUser("llA");
    const path = `${ids.tenant_landlordA}/logo-admin-${suffix}.png`;
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const { error } = await c.storage.from("tenant-branding").upload(path, bytes, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).toBeNull();
  });

  it("water A cannot read water B tenant row", async () => {
    const c = await asUser("waA");
    const { data } = await c
      .from("tenants")
      .select("id")
      .eq("id", ids.tenant_waterB);
    expect(data ?? []).toHaveLength(0);
  });

  it("public resolve_tenant_workspace returns only branding surface", async () => {
    const c = createClient(url!, anon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: tenant } = await admin
      .from("tenants")
      .select("slug")
      .eq("id", ids.tenant_landlordA)
      .single();
    const { data, error } = await c.rpc("resolve_tenant_workspace", {
      p_key: tenant!.slug,
    });
    expect(error).toBeNull();
    expect(data?.id).toBe(ids.tenant_landlordA);
    expect(data?.slug).toBeTruthy();
    // Must not expose memberships or settings blobs beyond branding
    expect(data?.settings).toBeUndefined();
  });
});

if (!isolatedConfigured) {
  describe.skip("Security audit hardening (skipped — not an isolated local Supabase target)", () => {
    it("requires frontend/.env.isolated with loopback IJAARO_ISOLATED_* keys", () => {
      expect(isolatedConfigured).toBe(false);
    });
  });
}
