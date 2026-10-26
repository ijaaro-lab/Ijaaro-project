/**
 * Marketplace field-isolation regressions (STEP 5.4.18).
 *
 * Runs ONLY against an isolated local Supabase (127.0.0.1 / localhost).
 * Set IJAARO_ISOLATED_* or point VITE_SUPABASE_URL at local before running.
 *
 * Run: npm test -- src/test/rls.marketplace.test.ts
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

const describeMarketplace = isolatedConfigured ? describe : describe.skip;

describeMarketplace("Marketplace field isolation", () => {
  const password = "TestPass123!_mkt";
  const emails: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let admin: SupabaseClient;
  const suffix = randomUUID().slice(0, 8);

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

  const listAllowlist = [
    "id",
    "name",
    "district",
    "city",
    "property_type",
    "status",
    "rent_amount",
    "currency",
  ] as const;

  const detailAllowlist = [
    ...listAllowlist,
    "address_line",
    "description",
    "contact_phone",
    "contact_email",
  ] as const;

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
    await make("renterOut", "Outside Renter");
    await make("renterIn", "Assigned Renter");
    await make("staffA", "Staff A");
    await make("super", "Super Admin");

    const insertTenant = async (key: string, ownerKey: string, role: string) => {
      const { data, error } = await admin
        .from("tenants")
        .insert({
          name: `${key} ${suffix}`,
          slug: `${key}-${suffix}`.toLowerCase().replace(/_/g, "-"),
          tenant_type: "landlord",
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

    await insertTenant("landlordA", "llA", "landlord_admin");
    await insertTenant("landlordB", "llB", "landlord_admin");

    const { data: platform, error: pErr } = await admin
      .from("tenants")
      .insert({
        name: `platform ${suffix}`,
        slug: `platform-${suffix}`,
        tenant_type: "platform",
        status: "active",
      })
      .select("*")
      .single();
    if (pErr) throw pErr;
    ids.tenant_platform = platform.id;
    const { error: saErr } = await admin.from("tenant_memberships").insert({
      tenant_id: platform.id,
      user_id: ids.super,
      role: "super_admin",
      status: "active",
    });
    if (saErr) throw saErr;

    const { error: staffErr } = await admin.from("tenant_memberships").insert({
      tenant_id: ids.tenant_landlordA,
      user_id: ids.staffA,
      role: "landlord_staff",
      status: "active",
    });
    if (staffErr) throw staffErr;

    const insertProp = async (
      key: string,
      patch: Record<string, unknown>,
    ) => {
      const { data, error } = await admin
        .from("properties")
        .insert({
          tenant_id: ids.tenant_landlordA,
          owner_id: ids.llA,
          name: `${key}-${suffix}`,
          address_line: `Secret Street ${key} ${suffix}`,
          district: "Hodan",
          city: "Mogadishu",
          property_type: "apartment",
          description: `Desc ${key}`,
          rent_amount: 150,
          currency: "USD",
          contact_phone: "+252610000001",
          contact_email: `inquiry_${key}@example.com`,
          created_source: "landlord",
          created_by_tenant_id: ids.tenant_landlordA,
          ...patch,
        })
        .select("*")
        .single();
      if (error) throw error;
      ids[key] = data.id;
      return data;
    };

    await insertProp("listedAvailable", {
      status: "available",
      is_listed: true,
    });
    await insertProp("unlistedAvailable", {
      status: "available",
      is_listed: false,
      address_line: `Unlisted Ave ${suffix}`,
    });
    await insertProp("listedOccupied", {
      status: "vacant",
      is_listed: true,
      address_line: `Vacant Listed ${suffix}`,
    });
    // occupied requires current_renter_id — set via internal path after insert as vacant then update with service role
    const { data: occupied, error: oErr } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordA,
        owner_id: ids.llA,
        name: `occupied-${suffix}`,
        address_line: `Occupied Lane ${suffix}`,
        district: "Wadajir",
        city: "Mogadishu",
        property_type: "house",
        description: "Occupied private",
        rent_amount: 200,
        currency: "USD",
        contact_phone: "+252610000099",
        contact_email: "occupied@example.com",
        status: "available",
        is_listed: true,
        created_source: "landlord",
        created_by_tenant_id: ids.tenant_landlordA,
      })
      .select("*")
      .single();
    if (oErr) throw oErr;
    ids.listedThenOccupied = occupied.id;

    // Use assign_renter as landlord to move to occupied (respects occupancy trigger)
    const llClient = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signErr } = await llClient.auth.signInWithPassword({
      email: emails.llA,
      password,
    });
    if (signErr) throw signErr;

    const { error: memErr } = await admin.from("tenant_memberships").insert({
      tenant_id: ids.tenant_landlordA,
      user_id: ids.renterIn,
      role: "renter",
      status: "active",
    });
    if (memErr) throw memErr;

    const { error: assignErr } = await llClient.rpc("assign_renter", {
      p_property_id: ids.listedThenOccupied,
      p_renter_id: ids.renterIn,
      p_rent_amount: 200,
      p_start_date: "2026-10-01",
      p_create_initial_charge: false,
    });
    if (assignErr) throw assignErr;

    // Private photo on listed available property
    const storagePath = `${ids.tenant_landlordA}/${ids.listedAvailable}/${randomUUID()}.jpg`;
    const { error: upErr } = await admin.storage
      .from("property-photos")
      .upload(storagePath, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (upErr) throw upErr;
    ids.photoPath = storagePath;

    const { data: photo, error: phErr } = await admin
      .from("property_photos")
      .insert({
        property_id: ids.listedAvailable,
        tenant_id: ids.tenant_landlordA,
        storage_path: storagePath,
        sort_order: 0,
      })
      .select("*")
      .single();
    if (phErr) throw phErr;
    ids.photoId = photo.id;
  }, 180_000);

  async function asUser(key: string) {
    const c = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({
      email: emails[key],
      password,
    });
    if (error) throw error;
    return c;
  }

  it("landlord A retains full access to own property via base table", async () => {
    const c = await asUser("llA");
    const { data, error } = await c
      .from("properties")
      .select("*")
      .eq("id", ids.listedAvailable)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(ids.listedAvailable);
    expect(data?.address_line).toContain("Secret Street");
    expect(data?.owner_id).toBe(ids.llA);
    expect(data?.tenant_id).toBe(ids.tenant_landlordA);
    expect(data?.contact_phone).toBe("+252610000001");
  });

  it("landlord B cannot read landlord A private fields via base table", async () => {
    const c = await asUser("llB");
    const { data, error } = await c
      .from("properties")
      .select("*")
      .eq("id", ids.listedAvailable);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { data: unlisted } = await c
      .from("properties")
      .select("id,address_line,contact_phone,owner_id")
      .eq("id", ids.unlistedAvailable);
    expect(unlisted ?? []).toHaveLength(0);
  });

  it("marketplace list RPC returns only allowlisted card fields", async () => {
    const c = await asUser("renterOut");
    const { data, error } = await c.rpc("list_marketplace_listings");
    expect(error).toBeNull();
    const rows = data ?? [];
    const hit = rows.find((r: { id: string }) => r.id === ids.listedAvailable);
    expect(hit).toBeTruthy();
    for (const key of Object.keys(hit!)) {
      expect(listAllowlist).toContain(key);
    }
    expect(hit).not.toHaveProperty("address_line");
    expect(hit).not.toHaveProperty("contact_phone");
    expect(hit).not.toHaveProperty("contact_email");
    expect(hit).not.toHaveProperty("description");
    for (const f of privateFields) {
      expect(hit).not.toHaveProperty(f);
    }
    expect(hit.district).toBe("Hodan");
    expect(hit.city).toBe("Mogadishu");
  });

  it("marketplace detail RPC returns address and inquiry contacts only among extras", async () => {
    const c = await asUser("renterOut");
    const { data, error } = await c.rpc("get_marketplace_listing", {
      p_id: ids.listedAvailable,
    });
    expect(error).toBeNull();
    const row = (data ?? [])[0];
    expect(row).toBeTruthy();
    for (const key of Object.keys(row)) {
      expect(detailAllowlist).toContain(key);
    }
    expect(row.address_line).toContain("Secret Street");
    expect(row.contact_phone).toBe("+252610000001");
    expect(row.contact_email).toBe("inquiry_listedAvailable@example.com");
    expect(row.description).toBe("Desc listedAvailable");
    for (const f of privateFields) {
      expect(row).not.toHaveProperty(f);
    }
  });

  it("direct base-table queries cannot retrieve another landlord private fields", async () => {
    const c = await asUser("renterOut");
    const { data } = await c
      .from("properties")
      .select("id,address_line,contact_phone,owner_id,tenant_id,current_renter_id")
      .eq("id", ids.listedAvailable);
    expect(data ?? []).toHaveLength(0);
  });

  it("anonymous users cannot browse marketplace listings", async () => {
    const anon = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: listData, error: listErr } = await anon.rpc("list_marketplace_listings");
    expect(listErr).toBeTruthy();
    expect(listData).toBeNull();

    const { data: getData, error: getErr } = await anon.rpc("get_marketplace_listing", {
      p_id: ids.listedAvailable,
    });
    expect(getErr).toBeTruthy();
    expect(getData).toBeNull();

    const { data: tableData } = await anon.from("properties").select("id").limit(5);
    expect(tableData ?? []).toHaveLength(0);
  });

  it("unlisted, occupied, and vacant properties are not exposed via marketplace RPCs", async () => {
    const c = await asUser("renterOut");
    const { data: list } = await c.rpc("list_marketplace_listings");
    const idsFound = (list ?? []).map((r: { id: string }) => r.id);
    expect(idsFound).toContain(ids.listedAvailable);
    expect(idsFound).not.toContain(ids.unlistedAvailable);
    expect(idsFound).not.toContain(ids.listedOccupied); // vacant
    expect(idsFound).not.toContain(ids.listedThenOccupied); // now occupied

    for (const badId of [
      ids.unlistedAvailable,
      ids.listedOccupied,
      ids.listedThenOccupied,
    ]) {
      const { data, error } = await c.rpc("get_marketplace_listing", { p_id: badId });
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("private photo metadata and signed URLs remain protected from outsiders", async () => {
    const outsider = await asUser("renterOut");
    const { data: meta } = await outsider
      .from("property_photos")
      .select("*")
      .eq("id", ids.photoId);
    expect(meta ?? []).toHaveLength(0);

    const { data: signed, error: signedErr } = await outsider.storage
      .from("property-photos")
      .createSignedUrl(ids.photoPath, 60);
    expect(signed?.signedUrl ?? null).toBeFalsy();
    expect(signedErr).toBeTruthy();
  });

  it("authorized renter, member, landlord, and super admin retain legitimate access", async () => {
    const renter = await asUser("renterIn");
    const { data: asRenter, error: rErr } = await renter
      .from("properties")
      .select("id,address_line,current_renter_id")
      .eq("id", ids.listedThenOccupied)
      .maybeSingle();
    expect(rErr).toBeNull();
    expect(asRenter?.id).toBe(ids.listedThenOccupied);
    expect(asRenter?.current_renter_id).toBe(ids.renterIn);

    const staff = await asUser("staffA");
    const { data: asStaff, error: sErr } = await staff
      .from("properties")
      .select("id,owner_id")
      .eq("id", ids.listedAvailable)
      .maybeSingle();
    expect(sErr).toBeNull();
    expect(asStaff?.owner_id).toBe(ids.llA);

    const landlord = await asUser("llA");
    const { data: photos, error: pErr } = await landlord
      .from("property_photos")
      .select("id,storage_path")
      .eq("id", ids.photoId)
      .maybeSingle();
    expect(pErr).toBeNull();
    expect(photos?.id).toBe(ids.photoId);
    const { data: signed, error: signedErr } = await landlord.storage
      .from("property-photos")
      .createSignedUrl(ids.photoPath, 60);
    expect(signedErr).toBeNull();
    expect(signed?.signedUrl).toBeTruthy();

    const superAdmin = await asUser("super");
    const { data: asSuper, error: saErr } = await superAdmin
      .from("properties")
      .select("id,tenant_id")
      .eq("id", ids.unlistedAvailable)
      .maybeSingle();
    expect(saErr).toBeNull();
    expect(asSuper?.tenant_id).toBe(ids.tenant_landlordA);
  });
});

if (!isolatedConfigured) {
  describe.skip("Marketplace field isolation (skipped — not an isolated local Supabase target)", () => {
    it("requires localhost Supabase with service role", () => {
      expect(isIsolatedTarget).toBe(true);
    });
  });
}
