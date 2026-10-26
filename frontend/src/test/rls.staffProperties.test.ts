/**
 * Phase B — landlord_staff property / photo RLS runtime suite.
 *
 * Runs ONLY against isolated local Supabase (127.0.0.1 / localhost).
 * Requires migrations through 20261022200000_property_photo_identity_immutable applied locally.
 *
 * Run: npm test -- src/test/rls.staffProperties.test.ts
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

const describeStaffProps = isolatedConfigured ? describe : describe.skip;

const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

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

describeStaffProps("landlord_staff property / photo RLS", () => {
  const password = "TestPass123!_staffprops";
  const emails: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let admin: SupabaseClient;
  const suffix = randomUUID().slice(0, 8);

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

  beforeAll(async () => {
    expect(isIsolatedTarget).toBe(true);
    expect(isolatedUrl).toMatch(/127\.0\.0\.1|localhost/);

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

    await make("llA", "Landlord Admin A");
    await make("staffA", "Staff A");
    await make("staffDisabled", "Staff Disabled");
    await make("llB", "Landlord Admin B");
    await make("staffB", "Staff B");

    const insertTenant = async (key: string) => {
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
      return data.id;
    };

    await insertTenant("landlordA");
    await insertTenant("landlordB");

    const insertMem = async (
      tenantKey: string,
      userKey: string,
      role: string,
      status: "active" | "disabled" = "active",
    ) => {
      const { error } = await admin.from("tenant_memberships").insert({
        tenant_id: ids[`tenant_${tenantKey}`],
        user_id: ids[userKey],
        role,
        status,
      });
      if (error) throw error;
    };

    await insertMem("landlordA", "llA", "landlord_admin");
    await insertMem("landlordA", "staffA", "landlord_staff");
    await insertMem("landlordA", "staffDisabled", "landlord_staff", "disabled");
    await insertMem("landlordB", "llB", "landlord_admin");
    await insertMem("landlordB", "staffB", "landlord_staff");

    // Seed property on B for cross-tenant denial (owned by admin B).
    const { data: propB, error: propBErr } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordB,
        owner_id: ids.llB,
        name: `B Seed ${suffix}`,
        address_line: "2 Other St",
        district: "Wadajir",
        city: "Mogadishu",
        rent_amount: 200,
        currency: "USD",
        status: "available",
        is_listed: false,
        created_source: "landlord",
      })
      .select("*")
      .single();
    if (propBErr) throw propBErr;
    ids.propB = propB.id;

    const pathB = `${ids.tenant_landlordB}/${ids.propB}/${randomUUID()}.png`;
    const { error: upB } = await admin.storage
      .from("property-photos")
      .upload(pathB, PNG_1X1, { contentType: "image/png", upsert: false });
    if (upB) throw upB;
    const { data: photoB, error: photoBErr } = await admin
      .from("property_photos")
      .insert({
        property_id: ids.propB,
        tenant_id: ids.tenant_landlordB,
        storage_path: pathB,
        sort_order: 0,
      })
      .select("*")
      .single();
    if (photoBErr) throw photoBErr;
    ids.photoB = photoB.id;
    ids.photoPathB = pathB;
  }, 120_000);

  it("1. active staff can insert and update properties including publishing fields", async () => {
    const staff = await asUser("staffA");
    const { data: created, error: createErr } = await staff
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordA,
        owner_id: ids.staffA,
        name: `Staff Create ${suffix}`,
        address_line: "1 Staff St",
        district: "Hodan",
        city: "Mogadishu",
        rent_amount: 150,
        currency: "USD",
        status: "available",
        is_listed: false,
        created_source: "landlord",
      })
      .select("id,tenant_id,owner_id,is_listed,status")
      .single();
    expect(createErr).toBeNull();
    expect(created?.tenant_id).toBe(ids.tenant_landlordA);
    expect(created?.owner_id).toBe(ids.staffA);
    ids.propStaff = created!.id;

    const { data: updated, error: updErr } = await staff
      .from("properties")
      .update({
        name: `Staff Listed ${suffix}`,
        is_listed: true,
        status: "available",
        rent_amount: 175,
      })
      .eq("id", ids.propStaff)
      .eq("tenant_id", ids.tenant_landlordA)
      .select("id,name,is_listed,status,rent_amount")
      .maybeSingle();
    expect(updErr).toBeNull();
    expect(updated?.is_listed).toBe(true);
    expect(updated?.status).toBe("available");
    expect(updated?.rent_amount).toBe(175);
  });

  it("2. disabled staff cannot insert or update properties", async () => {
    const disabled = await asUser("staffDisabled");
    const { error: insertErr } = await disabled.from("properties").insert({
      tenant_id: ids.tenant_landlordA,
      owner_id: ids.staffDisabled,
      name: `Disabled Create ${suffix}`,
      address_line: "9 Deny St",
      rent_amount: 100,
      currency: "USD",
      status: "available",
      is_listed: false,
      created_source: "landlord",
    });
    expect(insertErr).toBeTruthy();

    const { data, error: updErr } = await disabled
      .from("properties")
      .update({ name: "hacked-by-disabled" })
      .eq("id", ids.propStaff)
      .select();
    expect(Boolean(updErr) || (data ?? []).length === 0).toBe(true);
  });

  it("3. staff cannot delete properties", async () => {
    const staff = await asUser("staffA");
    const { data, error } = await staff
      .from("properties")
      .delete()
      .eq("id", ids.propStaff)
      .select();
    expect(Boolean(error) || (data ?? []).length === 0).toBe(true);

    const { data: stillThere } = await admin
      .from("properties")
      .select("id")
      .eq("id", ids.propStaff)
      .maybeSingle();
    expect(stillThere?.id).toBe(ids.propStaff);
  });

  it("4. staff cannot delete property-photo rows or storage objects", async () => {
    const staff = await asUser("staffA");
    const path = `${ids.tenant_landlordA}/${ids.propStaff}/${randomUUID()}.png`;
    const { error: upErr } = await staff.storage
      .from("property-photos")
      .upload(path, PNG_1X1, { contentType: "image/png", upsert: false });
    expect(upErr).toBeNull();

    const { data: photo, error: rowErr } = await staff
      .from("property_photos")
      .insert({
        property_id: ids.propStaff,
        tenant_id: ids.tenant_landlordA,
        storage_path: path,
        sort_order: 0,
      })
      .select("*")
      .single();
    expect(rowErr).toBeNull();
    ids.photoStaff = photo!.id;
    ids.photoPathStaff = path;

    const { data: delRows, error: delRowErr } = await staff
      .from("property_photos")
      .delete()
      .eq("id", ids.photoStaff)
      .select();
    expect(Boolean(delRowErr) || (delRows ?? []).length === 0).toBe(true);

    await staff.storage.from("property-photos").remove([path]);
    // Storage delete is admin-only; object must still be readable after staff remove attempt.
    const { data: signed, error: signErr } = await admin.storage
      .from("property-photos")
      .createSignedUrl(path, 60);
    expect(signErr).toBeNull();
    expect(signed?.signedUrl).toBeTruthy();
  });

  it("5. admin retains property and photo deletion", async () => {
    const llA = await asUser("llA");

    // Admin-owned deletable property + photo for clean delete path.
    const { data: adminProp, error: apErr } = await llA
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordA,
        owner_id: ids.llA,
        name: `Admin Delete Target ${suffix}`,
        address_line: "3 Admin St",
        rent_amount: 90,
        currency: "USD",
        status: "available",
        is_listed: false,
        created_source: "landlord",
      })
      .select("id")
      .single();
    expect(apErr).toBeNull();
    ids.propAdminDel = adminProp!.id;

    const path = `${ids.tenant_landlordA}/${ids.propAdminDel}/${randomUUID()}.png`;
    const { error: upErr } = await llA.storage
      .from("property-photos")
      .upload(path, PNG_1X1, { contentType: "image/png", upsert: false });
    expect(upErr).toBeNull();
    const { data: photo, error: phErr } = await llA
      .from("property_photos")
      .insert({
        property_id: ids.propAdminDel,
        tenant_id: ids.tenant_landlordA,
        storage_path: path,
        sort_order: 0,
      })
      .select("id")
      .single();
    expect(phErr).toBeNull();

    const { data: delPhoto, error: delPhotoErr } = await llA
      .from("property_photos")
      .delete()
      .eq("id", photo!.id)
      .select();
    expect(delPhotoErr).toBeNull();
    expect((delPhoto ?? []).length).toBe(1);

    const { error: remErr } = await llA.storage.from("property-photos").remove([path]);
    expect(remErr).toBeNull();

    const { data: delProp, error: delPropErr } = await llA
      .from("properties")
      .delete()
      .eq("id", ids.propAdminDel)
      .select();
    expect(delPropErr).toBeNull();
    expect((delProp ?? []).length).toBe(1);
  });

  it("6. staff cannot modify properties or photos in another tenant", async () => {
    const staffA = await asUser("staffA");
    const { data: propUpd, error: propErr } = await staffA
      .from("properties")
      .update({ name: "cross-tenant-hack" })
      .eq("id", ids.propB)
      .select();
    expect(Boolean(propErr) || (propUpd ?? []).length === 0).toBe(true);

    const { data: photoUpd, error: photoErr } = await staffA
      .from("property_photos")
      .update({ sort_order: 99 })
      .eq("id", ids.photoB)
      .select();
    expect(Boolean(photoErr) || (photoUpd ?? []).length === 0).toBe(true);

    const evilPath = `${ids.tenant_landlordB}/${ids.propB}/${randomUUID()}.png`;
    const { error: upErr } = await staffA.storage
      .from("property-photos")
      .upload(evilPath, PNG_1X1, { contentType: "image/png", upsert: false });
    expect(upErr).toBeTruthy();
  });

  it("7. staff cannot change owner_id through client updates", async () => {
    const staff = await asUser("staffA");
    const { data, error } = await staff
      .from("properties")
      .update({ owner_id: ids.llA })
      .eq("id", ids.propStaff)
      .eq("tenant_id", ids.tenant_landlordA)
      .select();
    // Trigger raises 42501; PostgREST may surface error or empty set.
    expect(Boolean(error) || (data ?? []).length === 0).toBe(true);

    const { data: row } = await admin
      .from("properties")
      .select("owner_id")
      .eq("id", ids.propStaff)
      .single();
    expect(row?.owner_id).toBe(ids.staffA);
  });

  it("8. staff-created listed/available property appears in public listing RPC without private fields", async () => {
    const anon = createClient(isolatedUrl!, isolatedAnon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.rpc("list_landlord_public_listings", {
      p_tenant_key: ids.slug_landlordA,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as Record<string, unknown>[];
    const hit = rows.find((r) => r.id === ids.propStaff);
    expect(hit).toBeTruthy();
    for (const key of Object.keys(hit!)) {
      expect(publicListAllowlist).toContain(key);
    }
    for (const pf of privateFields) {
      expect(hit).not.toHaveProperty(pf);
    }
  });

  it("9. photo-identity trigger blocks identity changes; allows upload and sort_order", async () => {
    const staff = await asUser("staffA");
    expect(ids.photoStaff).toBeTruthy();

    const { error: pathErr } = await staff
      .from("property_photos")
      .update({ storage_path: `${ids.tenant_landlordA}/${ids.propStaff}/evil.png` })
      .eq("id", ids.photoStaff);
    expect(pathErr).toBeTruthy();

    const { error: propIdErr } = await staff
      .from("property_photos")
      .update({ property_id: ids.propB })
      .eq("id", ids.photoStaff);
    expect(propIdErr).toBeTruthy();

    const { error: tenantErr } = await staff
      .from("property_photos")
      .update({ tenant_id: ids.tenant_landlordB })
      .eq("id", ids.photoStaff);
    expect(tenantErr).toBeTruthy();

    const { data: sorted, error: sortErr } = await staff
      .from("property_photos")
      .update({ sort_order: 3 })
      .eq("id", ids.photoStaff)
      .select("id,sort_order")
      .maybeSingle();
    expect(sortErr).toBeNull();
    expect(sorted?.sort_order).toBe(3);

    // Legitimate additional upload still works.
    const path2 = `${ids.tenant_landlordA}/${ids.propStaff}/${randomUUID()}.png`;
    const { error: up2 } = await staff.storage
      .from("property-photos")
      .upload(path2, PNG_1X1, { contentType: "image/png", upsert: false });
    expect(up2).toBeNull();
    const { error: ins2 } = await staff.from("property_photos").insert({
      property_id: ids.propStaff,
      tenant_id: ids.tenant_landlordA,
      storage_path: path2,
      sort_order: 4,
    });
    expect(ins2).toBeNull();
  });
});
