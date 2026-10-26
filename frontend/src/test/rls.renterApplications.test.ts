/**
 * RP-1.3.2 — Public landlord listings + rental applications + landlord-scoped usernames.
 *
 * Runs ONLY against an isolated local Supabase (127.0.0.1 / localhost).
 * Requires migration 20261020090000 applied on that instance.
 *
 * Run: npm test -- src/test/rls.renterApplications.test.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  isolatedAnon,
  isolatedConfigured,
  isolatedService,
  isolatedUrl,
  isIsolatedTarget,
} from "./isolatedEnv";

const describeApps = isolatedConfigured ? describe : describe.skip;

describeApps("RP-1.3.2 renter applications & public landlord listings", () => {
  const password = "TestPass123!_apps";
  const emails: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let admin: SupabaseClient;
  const suffix = randomUUID().slice(0, 8);

  const publicListAllowlist = [
    "id",
    "name",
    "district",
    "city",
    "property_type",
    "status",
    "rent_amount",
    "currency",
  ] as const;

  const privateFields = [
    "tenant_id",
    "owner_id",
    "current_renter_id",
    "created_by_tenant_id",
    "created_source",
    "is_listed",
    "created_at",
    "updated_at",
  ] as const;

  const clientFor = async (key: string) => {
    const c = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({
      email: emails[key],
      password,
    });
    if (error) throw error;
    return c;
  };

  beforeAll(async () => {
    expect(isIsolatedTarget).toBe(true);
    admin = createClient(isolatedUrl!, isolatedService!, {
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
    await make("app1", "Applicant 1");
    await make("app2", "Applicant 2");

    const insertTenant = async (key: string, ownerKey: string) => {
      const slug = `${key}-${suffix}`.toLowerCase().replace(/_/g, "-");
      const { data, error } = await admin
        .from("tenants")
        .insert({
          name: `${key} ${suffix}`,
          slug,
          subdomain: slug,
          tenant_type: "landlord",
          status: "active",
        })
        .select("*")
        .single();
      if (error) throw error;
      ids[`tenant_${key}`] = data.id;
      ids[`slug_${key}`] = slug;
      const { error: mErr } = await admin.from("tenant_memberships").insert({
        tenant_id: data.id,
        user_id: ids[ownerKey],
        role: "landlord_admin",
        status: "active",
      });
      if (mErr) throw mErr;
    };

    await insertTenant("landlordA", "llA");
    await insertTenant("landlordB", "llB");

    const insertProp = async (
      key: string,
      tenantKey: string,
      ownerKey: string,
      patch: Record<string, unknown>,
    ) => {
      const { data, error } = await admin
        .from("properties")
        .insert({
          tenant_id: ids[`tenant_${tenantKey}`],
          owner_id: ids[ownerKey],
          name: `${key}-${suffix}`,
          address_line: `Secret ${key} ${suffix}`,
          district: "Hodan",
          city: "Mogadishu",
          property_type: "apartment",
          description: `Desc ${key}`,
          rent_amount: 200,
          currency: "USD",
          contact_phone: "+252610000099",
          contact_email: `ask_${key}@example.com`,
          created_source: "landlord",
          created_by_tenant_id: ids[`tenant_${tenantKey}`],
          ...patch,
        })
        .select("*")
        .single();
      if (error) throw error;
      ids[key] = data.id;
    };

    await insertProp("listedA", "landlordA", "llA", {
      status: "available",
      is_listed: true,
    });
    await insertProp("unlistedA", "landlordA", "llA", {
      status: "available",
      is_listed: false,
    });
    await insertProp("occupiedA", "landlordA", "llA", {
      status: "occupied",
      is_listed: true,
      current_renter_id: ids.app2,
    });
    await insertProp("listedB", "landlordB", "llB", {
      status: "available",
      is_listed: true,
    });
  }, 120_000);

  it("anon lists only requested landlord listed+available with allowlisted fields", async () => {
    const anon = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.rpc("list_landlord_public_listings", {
      p_tenant_key: ids.slug_landlordA,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as Record<string, unknown>[];
    expect(rows.some((r) => r.id === ids.listedA)).toBe(true);
    expect(rows.some((r) => r.id === ids.unlistedA)).toBe(false);
    expect(rows.some((r) => r.id === ids.occupiedA)).toBe(false);
    expect(rows.some((r) => r.id === ids.listedB)).toBe(false);
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        expect(publicListAllowlist).toContain(key);
      }
      for (const pf of privateFields) {
        expect(row).not.toHaveProperty(pf);
      }
    }
  });

  it("anon direct SELECT of private property rows remains denied", async () => {
    const anon = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.from("properties").select("*").eq("id", ids.listedA);
    expect(error || (data ?? []).length === 0).toBeTruthy();
  });

  it("foreign landlord property id returns no public detail", async () => {
    const anon = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.rpc("get_landlord_public_listing", {
      p_tenant_key: ids.slug_landlordA,
      p_property_id: ids.listedB,
    });
    expect(error).toBeNull();
    expect((data as unknown[] | null)?.length ?? 0).toBe(0);
  });

  it("authenticated applicant submits pending application without active membership", async () => {
    const applicant = await clientFor("app1");
    const { data, error } = await applicant.rpc("submit_rental_application", {
      p_tenant_key: ids.slug_landlordA,
      p_property_id: ids.listedA,
      p_requested_username: `user_a_${suffix.slice(0, 6)}`,
      p_message: "Interested",
    });
    expect(error).toBeNull();
    expect(data?.status).toBe("pending");
    ids.app_pending = data!.id;

    const { data: mem } = await applicant
      .from("tenant_memberships")
      .select("id, status, role")
      .eq("tenant_id", ids.tenant_landlordA)
      .eq("user_id", ids.app1);
    expect((mem ?? []).filter((m) => m.status === "active")).toHaveLength(0);
  });

  it("anon application submission is denied", async () => {
    const anon = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anon.rpc("submit_rental_application", {
      p_tenant_key: ids.slug_landlordA,
      p_property_id: ids.listedA,
      p_requested_username: `anon_${suffix.slice(0, 6)}`,
    });
    expect(error).toBeTruthy();
  });

  it("duplicate pending application for same applicant+property is rejected", async () => {
    const applicant = await clientFor("app1");
    const { error } = await applicant.rpc("submit_rental_application", {
      p_tenant_key: ids.slug_landlordA,
      p_property_id: ids.listedA,
      p_requested_username: `user_a2_${suffix.slice(0, 5)}`,
    });
    expect(error).toBeTruthy();
  });

  it("same username allowed under two landlords; duplicate within one denied", async () => {
    const shared = `shared_${suffix.slice(0, 6)}`;
    const a = await clientFor("app2");
    const { error: e1 } = await a.rpc("submit_rental_application", {
      p_tenant_key: ids.slug_landlordA,
      p_property_id: ids.listedA,
      p_requested_username: shared,
    });
    // listedA already has pending from app1 with different username; app2 can apply
    expect(e1).toBeNull();

    const { error: e2 } = await a.rpc("submit_rental_application", {
      p_tenant_key: ids.slug_landlordB,
      p_property_id: ids.listedB,
      p_requested_username: shared,
    });
    expect(e2).toBeNull();

    // Create another applicant attempting same username on landlord A while app2 pending
    const email = `app3_${suffix}@ijaaro.test`;
    const { data: u3, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(cErr).toBeNull();
    const app3Id = u3?.user?.id;
    if (!app3Id) throw new Error("app3 user missing");
    await admin.from("profiles").upsert({
      id: app3Id,
      full_name: "App3",
      email,
    });
    const c3 = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await c3.auth.signInWithPassword({ email, password });
    const { data: prop2, error: pErr } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordA,
        owner_id: ids.llA,
        name: `extra-${suffix}`,
        address_line: "Extra",
        district: "Hodan",
        city: "Mogadishu",
        property_type: "apartment",
        rent_amount: 100,
        currency: "USD",
        status: "available",
        is_listed: true,
        created_source: "landlord",
        created_by_tenant_id: ids.tenant_landlordA,
      })
      .select("*")
      .single();
    expect(pErr).toBeNull();
    if (!prop2?.id) throw new Error("extra property missing");
    const { error: e3 } = await c3.rpc("submit_rental_application", {
      p_tenant_key: ids.slug_landlordA,
      p_property_id: prop2.id,
      p_requested_username: shared,
    });
    expect(e3).toBeTruthy();
  });

  it("applicant cannot accept own application; landlord can accept for own tenant only", async () => {
    const applicant = await clientFor("app1");
    const { error: selfErr } = await applicant.rpc("review_rental_application", {
      p_application_id: ids.app_pending,
      p_decision: "accept",
    });
    expect(selfErr).toBeTruthy();

    const landlordB = await clientFor("llB");
    const { error: crossErr } = await landlordB.rpc("review_rental_application", {
      p_application_id: ids.app_pending,
      p_decision: "accept",
    });
    expect(crossErr).toBeTruthy();

    const landlordA = await clientFor("llA");
    const { data, error } = await landlordA.rpc("review_rental_application", {
      p_application_id: ids.app_pending,
      p_decision: "accept",
    });
    expect(error).toBeNull();
    expect(data?.status).toBe("accepted");

    const { data: mem } = await admin
      .from("tenant_memberships")
      .select("role, status")
      .eq("tenant_id", ids.tenant_landlordA)
      .eq("user_id", ids.app1)
      .maybeSingle();
    expect(mem?.role).toBe("renter");
    expect(mem?.status).toBe("active");

    const { data: assign } = await admin
      .from("rental_assignments")
      .select("id")
      .eq("property_id", ids.listedA)
      .eq("renter_id", ids.app1)
      .eq("status", "active");
    expect(assign ?? []).toHaveLength(0);

    const { data: uname } = await admin
      .from("tenant_renter_usernames")
      .select("username")
      .eq("tenant_id", ids.tenant_landlordA)
      .eq("user_id", ids.app1)
      .maybeSingle();
    expect(uname?.username).toMatch(/^user_a_/);
  });

  it("reject leaves membership inactive and allows reapply", async () => {
    // Use app2's pending on landlordA (shared username application)
    const { data: pendingRows } = await admin
      .from("rental_applications")
      .select("id")
      .eq("tenant_id", ids.tenant_landlordA)
      .eq("applicant_user_id", ids.app2)
      .eq("status", "pending")
      .limit(1);
    const appId = pendingRows?.[0]?.id;
    expect(appId).toBeTruthy();

    const landlordA = await clientFor("llA");
    const { data, error } = await landlordA.rpc("review_rental_application", {
      p_application_id: appId!,
      p_decision: "reject",
    });
    expect(error).toBeNull();
    expect(data?.status).toBe("rejected");

    const { data: mem } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", ids.tenant_landlordA)
      .eq("user_id", ids.app2)
      .eq("status", "active");
    expect(mem ?? []).toHaveLength(0);

    const applicant = await clientFor("app2");
    const { error: reErr } = await applicant.rpc("submit_rental_application", {
      p_tenant_key: ids.slug_landlordA,
      p_property_id: ids.listedA,
      p_requested_username: `reapp_${suffix.slice(0, 6)}`,
    });
    // listedA may still be available; app1 was accepted but not assigned — property still available
    expect(reErr).toBeNull();
  });

  it("applicant can list only own applications", async () => {
    const applicant = await clientFor("app1");
    const { data, error } = await applicant.rpc("list_my_rental_applications", {
      p_tenant_key: ids.slug_landlordA,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{ id: string }>;
    expect(rows.every((r: { id: string }) => typeof r.id === "string")).toBe(true);
    const { data: allForTenant } = await admin
      .from("rental_applications")
      .select("id, applicant_user_id")
      .eq("tenant_id", ids.tenant_landlordA);
    const foreign = (allForTenant ?? []).filter(
      (r: { applicant_user_id: string }) => r.applicant_user_id !== ids.app1,
    );
    for (const f of foreign) {
      expect(rows.some((r: { id: string }) => r.id === f.id)).toBe(false);
    }
  });

  it("pending applicant cannot read landlord private inventory via table SELECT", async () => {
    // Create fresh pending applicant without acceptance
    const email = `pend_${suffix}@ijaaro.test`;
    const { data: u, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(cErr).toBeNull();
    const pendId = u?.user?.id;
    if (!pendId) throw new Error("pending user missing");
    await admin.from("profiles").upsert({
      id: pendId,
      full_name: "Pending",
      email,
    });
    const { data: prop, error: propErr } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordB,
        owner_id: ids.llB,
        name: `priv-${suffix}`,
        address_line: "Private Lane",
        district: "X",
        city: "Y",
        property_type: "house",
        rent_amount: 50,
        currency: "USD",
        status: "available",
        is_listed: true,
        created_source: "landlord",
        created_by_tenant_id: ids.tenant_landlordB,
      })
      .select("*")
      .single();
    expect(propErr).toBeNull();
    if (!prop?.id) throw new Error("priv property missing");

    const c = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await c.auth.signInWithPassword({ email, password });
    const { error: subErr } = await c.rpc("submit_rental_application", {
      p_tenant_key: ids.slug_landlordB,
      p_property_id: prop.id,
      p_requested_username: `pend_${suffix.slice(0, 6)}`,
    });
    expect(subErr).toBeNull();

    const { data: props } = await c
      .from("properties")
      .select("id, address_line")
      .eq("tenant_id", ids.tenant_landlordB);
    expect(props ?? []).toHaveLength(0);

    const { data: assigns } = await c.from("rental_assignments").select("id");
    expect(assigns ?? []).toHaveLength(0);
  });

  it("landlord-scoped username table accepts same username on different tenants", async () => {
    const name = `twin_${suffix.slice(0, 6)}`;
    const { error: e1 } = await admin.from("tenant_renter_usernames").insert({
      tenant_id: ids.tenant_landlordA,
      user_id: ids.llA,
      username: name,
    });
    // llA is landlord admin — may insert via service role
    expect(e1).toBeNull();
    const { error: e2 } = await admin.from("tenant_renter_usernames").insert({
      tenant_id: ids.tenant_landlordB,
      user_id: ids.llB,
      username: name,
    });
    expect(e2).toBeNull();
    const { error: e3 } = await admin.from("tenant_renter_usernames").insert({
      tenant_id: ids.tenant_landlordA,
      user_id: ids.llB,
      username: name,
    });
    expect(e3).toBeTruthy();
  });
});
