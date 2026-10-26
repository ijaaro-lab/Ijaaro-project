/**
 * C1/H1 membership write hardening — runtime RLS / RPC tests.
 *
 * Runs ONLY against isolated local Supabase (127.0.0.1 / localhost).
 * Requires migrations through 20261022194500_membership_write_hardening_c1_h1 applied locally.
 *
 * Run: npm test -- src/test/rls.membershipHardening.test.ts
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

const describeMem = isolatedConfigured ? describe : describe.skip;

async function asUser(email: string, password: string) {
  const client = createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

describeMem("Membership write hardening (C1 + H1)", () => {
  const password = "TestPass123!_memharden";
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

    await make("llA", "Landlord Admin A");
    await make("llA2", "Landlord Admin A2");
    await make("staff", "Staff Member");
    await make("renter", "Renter User");
    await make("waA", "Water Admin");
    await make("cust", "Water Customer");
    await make("sa", "Super Admin User");

    const { data: platform, error: pErr } = await admin
      .from("tenants")
      .select("id")
      .eq("tenant_type", "platform")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!platform?.id) {
      throw new Error("No active platform tenant — bootstrap required on local");
    }
    ids.tenant_platform = platform.id;

    const { error: saMemErr } = await admin.from("tenant_memberships").upsert({
      tenant_id: ids.tenant_platform,
      user_id: ids.sa,
      role: "super_admin",
      status: "active",
    });
    if (saMemErr) throw saMemErr;

    const { data: landlord, error: lErr } = await admin
      .from("tenants")
      .insert({
        name: `MemHard Landlord ${suffix}`,
        slug: `memhard-ll-${suffix}`,
        tenant_type: "landlord",
        status: "active",
      })
      .select("*")
      .single();
    if (lErr) throw lErr;
    ids.tenant_landlord = landlord.id;

    for (const [userKey, role] of [
      ["llA", "landlord_admin"],
      ["llA2", "landlord_admin"],
      ["staff", "landlord_staff"],
    ] as const) {
      const { error } = await admin.from("tenant_memberships").insert({
        tenant_id: ids.tenant_landlord,
        user_id: ids[userKey],
        role,
        status: "active",
      });
      if (error) throw error;
    }

    const { data: water, error: wErr } = await admin
      .from("tenants")
      .insert({
        name: `MemHard Water ${suffix}`,
        slug: `memhard-wa-${suffix}`,
        tenant_type: "water_company",
        status: "active",
      })
      .select("*")
      .single();
    if (wErr) throw wErr;
    ids.tenant_water = water.id;

    const { error: waMemErr } = await admin.from("tenant_memberships").insert({
      tenant_id: ids.tenant_water,
      user_id: ids.waA,
      role: "utility_admin",
      status: "active",
    });
    if (waMemErr) throw waMemErr;
  }, 120_000);

  it("1. direct INSERT assigning landlord_admin is denied for a landlord admin", async () => {
    const c = await asUser(emails.llA, password);
    const { error } = await c.from("tenant_memberships").insert({
      tenant_id: ids.tenant_landlord,
      user_id: ids.renter,
      role: "landlord_admin",
      status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("2. direct UPDATE changing a membership to landlord_admin is denied", async () => {
    const c = await asUser(emails.llA, password);
    const { data, error } = await c
      .from("tenant_memberships")
      .update({ role: "landlord_admin" })
      .eq("tenant_id", ids.tenant_landlord)
      .eq("user_id", ids.staff)
      .select();
    expect(Boolean(error) || (data ?? []).length === 0).toBe(true);

    const { data: row } = await admin
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", ids.tenant_landlord)
      .eq("user_id", ids.staff)
      .single();
    expect(row?.role).toBe("landlord_staff");
  });

  it("3. direct UPDATE cannot bypass by changing tenant_id or role fields", async () => {
    const c = await asUser(emails.llA, password);
    const { data: roleAttempt, error: roleErr } = await c
      .from("tenant_memberships")
      .update({ role: "renter", status: "disabled" })
      .eq("tenant_id", ids.tenant_landlord)
      .eq("user_id", ids.llA2)
      .select();
    expect(Boolean(roleErr) || (roleAttempt ?? []).length === 0).toBe(true);

    const { data: tenantAttempt, error: tenantErr } = await c
      .from("tenant_memberships")
      .update({ tenant_id: ids.tenant_water })
      .eq("tenant_id", ids.tenant_landlord)
      .eq("user_id", ids.staff)
      .select();
    expect(Boolean(tenantErr) || (tenantAttempt ?? []).length === 0).toBe(true);

    const { data: peer } = await admin
      .from("tenant_memberships")
      .select("role, status")
      .eq("tenant_id", ids.tenant_landlord)
      .eq("user_id", ids.llA2)
      .single();
    expect(peer?.role).toBe("landlord_admin");
    expect(peer?.status).toBe("active");
  });

  it("4. manage_membership cannot demote or disable an existing landlord_admin", async () => {
    const c = await asUser(emails.llA, password);

    const demote = await c.rpc("manage_membership", {
      p_tenant_id: ids.tenant_landlord,
      p_user_id: ids.llA2,
      p_role: "landlord_staff",
      p_status: "active",
    });
    expect(demote.error).toBeTruthy();

    const disable = await c.rpc("manage_membership", {
      p_tenant_id: ids.tenant_landlord,
      p_user_id: ids.llA2,
      p_role: "renter",
      p_status: "disabled",
    });
    expect(disable.error).toBeTruthy();

    const { data: peer } = await admin
      .from("tenant_memberships")
      .select("role, status")
      .eq("tenant_id", ids.tenant_landlord)
      .eq("user_id", ids.llA2)
      .single();
    expect(peer?.role).toBe("landlord_admin");
    expect(peer?.status).toBe("active");
  });

  it("5. manage_membership still allows landlord_staff and renter grants", async () => {
    const c = await asUser(emails.llA, password);

    const staffGrant = await c.rpc("manage_membership", {
      p_tenant_id: ids.tenant_landlord,
      p_user_id: ids.renter,
      p_role: "landlord_staff",
      p_status: "active",
    });
    expect(staffGrant.error).toBeNull();
    expect(
      (staffGrant.data as { role: string } | null)?.role,
    ).toBe("landlord_staff");

    const renterGrant = await c.rpc("manage_membership", {
      p_tenant_id: ids.tenant_landlord,
      p_user_id: ids.renter,
      p_role: "renter",
      p_status: "active",
    });
    expect(renterGrant.error).toBeNull();
    expect((renterGrant.data as { role: string } | null)?.role).toBe("renter");

    const denyAdminRole = await c.rpc("manage_membership", {
      p_tenant_id: ids.tenant_landlord,
      p_user_id: ids.renter,
      p_role: "landlord_admin",
      p_status: "active",
    });
    expect(denyAdminRole.error).toBeTruthy();
  });

  it("6. staff callers cannot manage memberships", async () => {
    const c = await asUser(emails.staff, password);
    const { error: rpcErr } = await c.rpc("manage_membership", {
      p_tenant_id: ids.tenant_landlord,
      p_user_id: ids.renter,
      p_role: "renter",
      p_status: "active",
    });
    expect(rpcErr).toBeTruthy();

    const { error: insErr } = await c.from("tenant_memberships").insert({
      tenant_id: ids.tenant_landlord,
      user_id: ids.cust,
      role: "renter",
      status: "active",
    });
    expect(insErr).toBeTruthy();
  });

  it("7. Super Admin can still manage memberships (including landlord_admin)", async () => {
    const c = await asUser(emails.sa, password);
    const { data, error } = await c.rpc("manage_membership", {
      p_tenant_id: ids.tenant_landlord,
      p_user_id: ids.cust,
      p_role: "landlord_admin",
      p_status: "active",
    });
    expect(error).toBeNull();
    expect((data as { role: string } | null)?.role).toBe("landlord_admin");

    // Direct SA table UPDATE also allowed by C1 policy (row already exists from RPC)
    const { data: directRows, error: directErr } = await c
      .from("tenant_memberships")
      .update({ status: "disabled" })
      .eq("tenant_id", ids.tenant_landlord)
      .eq("user_id", ids.cust)
      .select("status");
    expect(directErr).toBeNull();
    expect(directRows?.[0]?.status).toBe("disabled");
  });

  it("8. utility_admin manage_membership still works; direct write denied", async () => {
    const c = await asUser(emails.waA, password);

    const { data, error } = await c.rpc("manage_membership", {
      p_tenant_id: ids.tenant_water,
      p_user_id: ids.cust,
      p_role: "utility_customer",
      p_status: "active",
    });
    expect(error).toBeNull();
    expect((data as { role: string } | null)?.role).toBe("utility_customer");

    const { error: directErr } = await c.from("tenant_memberships").insert({
      tenant_id: ids.tenant_water,
      user_id: ids.renter,
      role: "utility_staff",
      status: "active",
    });
    expect(directErr).toBeTruthy();
  });
});

describe.skip("Membership write hardening (skipped — not an isolated local Supabase target)", () => {
  it("placeholder", () => {
    expect(true).toBe(true);
  });
});
