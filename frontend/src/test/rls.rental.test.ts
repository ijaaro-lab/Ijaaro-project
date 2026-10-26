/**
 * Phase 2 rental RLS / workflow security tests.
 *
 * Runs ONLY against an isolated local Supabase (127.0.0.1 / localhost).
 * Prefer IJAARO_ISOLATED_* via frontend/.env.isolated (see isolatedEnv.ts).
 *
 * Run: npm test -- src/test/rls.rental.test.ts
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

const describeRental = isolatedConfigured ? describe : describe.skip;

async function asUser(email: string, password: string) {
  const client = createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

describeRental("Phase 2 rental RLS & workflows", () => {
  const password = "TestPass123!_rental";
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
      await admin.from("profiles").upsert({ id: data.user.id, full_name: name, email });
      ids[key] = data.user.id;
    };

    await make("llA", "Landlord A");
    await make("llB", "Landlord B");
    await make("rA", "Renter A");
    await make("rB", "Renter B");
    await make("rNew", "Renter New Invite");

    for (const [key, owner, role] of [
      ["landlordA", "llA", "landlord_admin"],
      ["landlordB", "llB", "landlord_admin"],
    ] as const) {
      const { data, error } = await admin
        .from("tenants")
        .insert({
          name: `${key} ${suffix}`,
          slug: `${key}-${suffix}`.toLowerCase(),
          tenant_type: "landlord",
          status: "active",
        })
        .select("*")
        .single();
      if (error) throw error;
      ids[`tenant_${key}`] = data.id;
      const { error: mErr } = await admin.from("tenant_memberships").insert({
        tenant_id: data.id,
        user_id: ids[owner],
        role,
        status: "active",
      });
      if (mErr) throw mErr;
    }

    await admin.from("tenant_memberships").insert([
      {
        tenant_id: ids.tenant_landlordA,
        user_id: ids.rA,
        role: "renter",
        status: "active",
      },
      {
        tenant_id: ids.tenant_landlordA,
        user_id: ids.rB,
        role: "renter",
        status: "active",
      },
    ]);

    const { data: propA, error: pErr } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordA,
        owner_id: ids.llA,
        name: `A Home ${suffix}`,
        address_line: "1 Test St",
        district: "Hodan",
        city: "Mogadishu",
        rent_amount: 100,
        currency: "USD",
        status: "available",
        is_listed: true,
        created_source: "landlord",
      })
      .select("*")
      .single();
    if (pErr) throw pErr;
    ids.propA = propA.id;

    const { data: propB, error: pErrB } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordB,
        owner_id: ids.llB,
        name: `B Home ${suffix}`,
        address_line: "2 Other St",
        rent_amount: 200,
        status: "available",
        is_listed: false,
        created_source: "landlord",
      })
      .select("*")
      .single();
    if (pErrB) throw pErrB;
    ids.propB = propB.id;
  }, 120_000);

  it("landlord A cannot read landlord B private property", async () => {
    const client = await asUser(emails.llA, password);
    const { data, error } = await client.from("properties").select("id").eq("id", ids.propB);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("landlord A cannot update landlord B property", async () => {
    const client = await asUser(emails.llA, password);
    const { data, error } = await client
      .from("properties")
      .update({ name: "hacked" })
      .eq("id", ids.propB)
      .select();
    expect((data ?? []).length).toBe(0);
    // Either error or zero rows depending on PostgREST
    if (error) expect(error).toBeTruthy();
  });

  it("landlord A can create and edit own-tenant property", async () => {
    const client = await asUser(emails.llA, password);
    const { data: created, error: createErr } = await client
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordA,
        owner_id: ids.llA,
        name: `A Create ${suffix}`,
        address_line: "9 Create St",
        rent_amount: 150,
        currency: "USD",
        status: "available",
        is_listed: false,
        created_source: "landlord",
      })
      .select("id,tenant_id,name")
      .single();
    expect(createErr).toBeNull();
    expect(created?.tenant_id).toBe(ids.tenant_landlordA);
    ids.propACreated = created!.id;

    const { data: updated, error: updErr } = await client
      .from("properties")
      .update({ name: `A Edited ${suffix}` })
      .eq("id", ids.propACreated)
      .eq("tenant_id", ids.tenant_landlordA)
      .select("id,name")
      .maybeSingle();
    expect(updErr).toBeNull();
    expect(updated?.name).toBe(`A Edited ${suffix}`);
  });

  it("landlord A can upload and read own property photo object", async () => {
    const client = await asUser(emails.llA, password);
    const path = `${ids.tenant_landlordA}/${ids.propA}/${randomUUID()}.png`;
    // Minimal valid 1x1 PNG
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
    const { error: upErr } = await client.storage.from("property-photos").upload(path, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    expect(upErr).toBeNull();

    const { error: rowErr } = await client.from("property_photos").insert({
      property_id: ids.propA,
      tenant_id: ids.tenant_landlordA,
      storage_path: path,
      sort_order: 0,
    });
    expect(rowErr).toBeNull();

    const { data: signed, error: signErr } = await client.storage
      .from("property-photos")
      .createSignedUrl(path, 60);
    expect(signErr).toBeNull();
    expect(signed?.signedUrl).toBeTruthy();
    ids.photoPathA = path;
  });

  it("landlord B cannot upload photo under landlord A property path", async () => {
    const client = await asUser(emails.llB, password);
    const path = `${ids.tenant_landlordA}/${ids.propA}/${randomUUID()}.png`;
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const { error } = await client.storage.from("property-photos").upload(path, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    expect(error).toBeTruthy();
  });

  it("list_same_tenant_member_profiles returns only active renters for landlord ops", async () => {
    const landlord = await asUser(emails.llA, password);
    const { data, error } = await landlord.rpc("list_same_tenant_member_profiles", {
      p_tenant_id: ids.tenant_landlordA,
    });
    expect(error).toBeNull();
    const userIds = (data ?? []).map((r: { user_id: string }) => r.user_id);
    expect(userIds).toEqual(expect.arrayContaining([ids.rA, ids.rB]));
    expect(userIds).not.toContain(ids.llA);
    expect((data ?? []).every((r: { role: string }) => r.role === "renter")).toBe(true);
  });

  it("landlord B cannot list landlord A renters via list_same_tenant_member_profiles", async () => {
    const landlordB = await asUser(emails.llB, password);
    const { data, error } = await landlordB.rpc("list_same_tenant_member_profiles", {
      p_tenant_id: ids.tenant_landlordA,
    });
    expect(error).toBeTruthy();
    expect(data).toBeNull();
  });

  it("landlord admin can invite renter onto own tenant via manage_membership", async () => {
    const landlord = await asUser(emails.llA, password);
    const { data, error } = await landlord.rpc("manage_membership", {
      p_tenant_id: ids.tenant_landlordA,
      p_user_id: ids.rNew,
      p_role: "renter",
      p_status: "active",
    });
    expect(error).toBeNull();
    const row = data as { user_id: string; role: string; tenant_id: string; status: string } | null;
    expect(row?.tenant_id).toBe(ids.tenant_landlordA);
    expect(row?.user_id).toBe(ids.rNew);
    expect(row?.role).toBe("renter");
    expect(row?.status).toBe("active");
  });

  it("landlord cannot invite renter onto another landlord tenant", async () => {
    const landlordA = await asUser(emails.llA, password);
    const { error } = await landlordA.rpc("manage_membership", {
      p_tenant_id: ids.tenant_landlordB,
      p_user_id: ids.rNew,
      p_role: "renter",
      p_status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("direct assignment insert is blocked", async () => {
    const client = await asUser(emails.llA, password);
    const { error } = await client.from("rental_assignments").insert({
      tenant_id: ids.tenant_landlordA,
      property_id: ids.propA,
      landlord_id: ids.llA,
      renter_id: ids.rA,
      rent_amount: 100,
      start_date: "2026-10-01",
      status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("landlord B cannot assign_renter on landlord A property", async () => {
    const client = await asUser(emails.llB, password);
    const { error } = await client.rpc("assign_renter", {
      p_property_id: ids.propA,
      p_renter_id: ids.rA,
      p_rent_amount: 100,
      p_start_date: "2026-10-01",
    });
    expect(error).toBeTruthy();
  });

  it("assign_renter works and blocks conflicting second active assignment", async () => {
    const client = await asUser(emails.llA, password);
    const { data, error } = await client.rpc("assign_renter", {
      p_property_id: ids.propA,
      p_renter_id: ids.rA,
      p_rent_amount: 100,
      p_start_date: "2026-10-01",
      p_due_day: 5,
      p_create_initial_charge: true,
    });
    expect(error).toBeNull();
    expect(data?.assignment?.id).toBeTruthy();
    ids.assignmentA = data.assignment.id;
    ids.chargeA = data.initial_charge_id;

    const second = await client.rpc("assign_renter", {
      p_property_id: ids.propA,
      p_renter_id: ids.rB,
      p_rent_amount: 120,
      p_start_date: "2026-10-02",
    });
    expect(second.error).toBeTruthy();
  });

  it("create_rent_charge works for landlord on active assignment", async () => {
    const landlord = await asUser(emails.llA, password);
    const { data, error } = await landlord.rpc("create_rent_charge", {
      p_assignment_id: ids.assignmentA,
      p_period_start: "2026-11-01",
      p_period_end: "2026-11-30",
      p_due_date: "2026-11-05",
      p_amount_due: 100,
    });
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    ids.chargeNov = data.id;
  });

  it("landlord B cannot create_rent_charge on landlord A assignment", async () => {
    const landlordB = await asUser(emails.llB, password);
    const { error } = await landlordB.rpc("create_rent_charge", {
      p_assignment_id: ids.assignmentA,
      p_period_start: "2026-12-01",
      p_period_end: "2026-12-31",
      p_due_date: "2026-12-05",
      p_amount_due: 100,
    });
    expect(error).toBeTruthy();
  });

  it("renter can upload rent payment proof; landlord B cannot", async () => {
    const path = `${ids.tenant_landlordA}/${ids.assignmentA}/${randomUUID()}.png`;
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );

    const renter = await asUser(emails.rA, password);
    const { error: upErr } = await renter.storage.from("payment-proofs").upload(path, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    expect(upErr).toBeNull();

    const landlordA = await asUser(emails.llA, password);
    const { data: signed, error: signErr } = await landlordA.storage
      .from("payment-proofs")
      .createSignedUrl(path, 60);
    expect(signErr).toBeNull();
    expect(signed?.signedUrl).toBeTruthy();

    const landlordB = await asUser(emails.llB, password);
    const badPath = `${ids.tenant_landlordA}/${ids.assignmentA}/${randomUUID()}.png`;
    const { error: badUp } = await landlordB.storage.from("payment-proofs").upload(badPath, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    expect(badUp).toBeTruthy();
  });

  it("landlord B cannot complete_move_out on landlord A assignment", async () => {
    const landlordB = await asUser(emails.llB, password);
    const { error } = await landlordB.rpc("complete_move_out", {
      p_assignment_id: ids.assignmentA,
      p_end_date: "2026-10-12",
    });
    expect(error).toBeTruthy();
  });

  it("landlord B cannot review landlord A payment", async () => {
    const renter = await asUser(emails.rA, password);
    const { data: payment, error: payErr } = await renter
      .from("rent_payments")
      .insert({
        rent_charge_id: ids.chargeA,
        amount: 10,
        method: "cash",
        tenant_id: ids.tenant_landlordA,
        property_id: ids.propA,
        assignment_id: ids.assignmentA,
        payer_id: ids.rA,
        status: "pending",
      })
      .select("id")
      .single();
    expect(payErr).toBeNull();
    ids.paymentCross = payment!.id;

    const landlordB = await asUser(emails.llB, password);
    const { error } = await landlordB.rpc("review_rent_payment", {
      p_payment_id: ids.paymentCross,
      p_decision: "approve",
    });
    expect(error).toBeTruthy();

    // Cleanup pending so later approve flow stays deterministic
    const landlordA = await asUser(emails.llA, password);
    const { error: rejErr } = await landlordA.rpc("review_rent_payment", {
      p_payment_id: ids.paymentCross,
      p_decision: "reject",
      p_rejection_reason: "cross-tenant isolation fixture",
    });
    expect(rejErr).toBeNull();
  });

  it("renter A can read own charge but not another renter payment after isolation setup", async () => {
    const client = await asUser(emails.rA, password);
    const { data, error } = await client.from("rent_charges").select("id").eq("id", ids.chargeA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("renter submits pending payment and cannot approve it", async () => {
    const renter = await asUser(emails.rA, password);
    const { data: payment, error } = await renter
      .from("rent_payments")
      .insert({
        rent_charge_id: ids.chargeA,
        amount: 40,
        method: "mobile_money",
        tenant_id: ids.tenant_landlordA,
        property_id: ids.propA,
        assignment_id: ids.assignmentA,
        payer_id: ids.rA,
        status: "pending",
      })
      .select("*")
      .single();
    expect(error).toBeNull();
    ids.paymentA = payment.id;
    expect(payment.status).toBe("pending");

    const { error: approveErr } = await renter.rpc("review_rent_payment", {
      p_payment_id: payment.id,
      p_decision: "approve",
    });
    expect(approveErr).toBeTruthy();
  });

  it("landlord approves payment and updates charge balance", async () => {
    const landlord = await asUser(emails.llA, password);
    const { data, error } = await landlord.rpc("review_rent_payment", {
      p_payment_id: ids.paymentA,
      p_decision: "approve",
    });
    expect(error).toBeNull();
    expect(data?.payment?.status).toBe("paid");
    expect(Number(data?.charge?.amount_paid)).toBe(40);
    expect(Number(data?.charge?.balance)).toBe(60);

    const again = await landlord.rpc("review_rent_payment", {
      p_payment_id: ids.paymentA,
      p_decision: "approve",
    });
    expect(again.error).toBeTruthy();
  });

  it("RPC reject without a valid reason leaves payment pending and charge unchanged", async () => {
    const renter = await asUser(emails.rA, password);
    const { data: payment, error } = await renter
      .from("rent_payments")
      .insert({
        rent_charge_id: ids.chargeA,
        amount: 15,
        method: "cash",
        tenant_id: ids.tenant_landlordA,
        property_id: ids.propA,
        assignment_id: ids.assignmentA,
        payer_id: ids.rA,
        status: "pending",
      })
      .select("*")
      .single();
    expect(error).toBeNull();
    ids.paymentRejectGuard = payment!.id;

    const landlord = await asUser(emails.llA, password);
    const { data: chargeBefore } = await landlord
      .from("rent_charges")
      .select("amount_paid,balance,status")
      .eq("id", ids.chargeA)
      .single();

    const nullReason = await landlord.rpc("review_rent_payment", {
      p_payment_id: payment!.id,
      p_decision: "reject",
      p_rejection_reason: null,
    });
    expect(nullReason.error).toBeTruthy();

    const emptyReason = await landlord.rpc("review_rent_payment", {
      p_payment_id: payment!.id,
      p_decision: "reject",
      p_rejection_reason: "",
    });
    expect(emptyReason.error).toBeTruthy();

    const whitespaceReason = await landlord.rpc("review_rent_payment", {
      p_payment_id: payment!.id,
      p_decision: "reject",
      p_rejection_reason: "  \t  ",
    });
    expect(whitespaceReason.error).toBeTruthy();

    const omittedReason = await landlord.rpc("review_rent_payment", {
      p_payment_id: payment!.id,
      p_decision: "reject",
    });
    expect(omittedReason.error).toBeTruthy();

    const { data: stillPending } = await landlord
      .from("rent_payments")
      .select("id,status,rejection_reason")
      .eq("id", payment!.id)
      .single();
    expect(stillPending?.status).toBe("pending");
    expect(stillPending?.rejection_reason).toBeNull();

    const { data: chargeAfter } = await landlord
      .from("rent_charges")
      .select("amount_paid,balance,status")
      .eq("id", ids.chargeA)
      .single();
    expect(Number(chargeAfter?.amount_paid)).toBe(Number(chargeBefore?.amount_paid));
    expect(Number(chargeAfter?.balance)).toBe(Number(chargeBefore?.balance));
    expect(chargeAfter?.status).toBe(chargeBefore?.status);

    // Clean up pending so later reject/resubmit stays deterministic
    const { error: cleanupErr } = await landlord.rpc("review_rent_payment", {
      p_payment_id: payment!.id,
      p_decision: "reject",
      p_rejection_reason: "cleanup after missing-reason guard",
    });
    expect(cleanupErr).toBeNull();
  });

  it("rejected payment retains history, shows trimmed reason to renter, and allows later resubmit", async () => {
    const renter = await asUser(emails.rA, password);
    const landlord = await asUser(emails.llA, password);

    const { data: chargeBefore } = await landlord
      .from("rent_charges")
      .select("amount_paid,balance,status")
      .eq("id", ids.chargeA)
      .single();

    const { data: payment, error } = await renter
      .from("rent_payments")
      .insert({
        rent_charge_id: ids.chargeA,
        amount: 20,
        method: "cash",
        tenant_id: ids.tenant_landlordA,
        property_id: ids.propA,
        assignment_id: ids.assignmentA,
        payer_id: ids.rA,
        status: "pending",
      })
      .select("*")
      .single();
    expect(error).toBeNull();

    const { data: rejected, error: rejErr } = await landlord.rpc("review_rent_payment", {
      p_payment_id: payment.id,
      p_decision: "reject",
      p_rejection_reason: "  unclear proof  ",
    });
    expect(rejErr).toBeNull();
    expect(rejected?.payment?.status).toBe("rejected");
    expect(rejected?.payment?.rejection_reason).toBe("unclear proof");

    const { data: stillThere } = await landlord
      .from("rent_payments")
      .select("id,status,rejection_reason")
      .eq("id", payment.id)
      .single();
    expect(stillThere?.status).toBe("rejected");
    expect(stillThere?.rejection_reason).toBe("unclear proof");

    const { data: chargeAfterReject } = await landlord
      .from("rent_charges")
      .select("amount_paid,balance,status")
      .eq("id", ids.chargeA)
      .single();
    expect(Number(chargeAfterReject?.amount_paid)).toBe(Number(chargeBefore?.amount_paid));
    expect(Number(chargeAfterReject?.balance)).toBe(Number(chargeBefore?.balance));
    expect(chargeAfterReject?.status).toBe(chargeBefore?.status);

    const { data: renterView } = await renter
      .from("rent_payments")
      .select("id,status,rejection_reason")
      .eq("id", payment.id)
      .single();
    expect(renterView?.status).toBe("rejected");
    expect(renterView?.rejection_reason).toBe("unclear proof");

    const { data: resubmit, error: resubmitErr } = await renter
      .from("rent_payments")
      .insert({
        rent_charge_id: ids.chargeA,
        amount: 20,
        method: "mobile_money",
        tenant_id: ids.tenant_landlordA,
        property_id: ids.propA,
        assignment_id: ids.assignmentA,
        payer_id: ids.rA,
        status: "pending",
      })
      .select("id,status")
      .single();
    expect(resubmitErr).toBeNull();
    expect(resubmit?.status).toBe("pending");

    // Leave only one pending for later suites / move-out: reject the resubmit
    const { error: closePendingErr } = await landlord.rpc("review_rent_payment", {
      p_payment_id: resubmit!.id,
      p_decision: "reject",
      p_rejection_reason: "fixture close after resubmit check",
    });
    expect(closePendingErr).toBeNull();
  });

  it("renter B cannot read renter A payment", async () => {
    const client = await asUser(emails.rB, password);
    const { data, error } = await client.from("rent_payments").select("id").eq("id", ids.paymentA);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("move-out returns property to available and keeps charge history", async () => {
    const landlord = await asUser(emails.llA, password);
    const { error } = await landlord.rpc("complete_move_out", {
      p_assignment_id: ids.assignmentA,
      p_end_date: "2026-10-13",
    });
    expect(error).toBeNull();

    const { data: prop } = await landlord.from("properties").select("status,current_renter_id").eq("id", ids.propA).single();
    expect(prop?.status).toBe("available");
    expect(prop?.current_renter_id).toBeNull();

    const { data: charges } = await landlord.from("rent_charges").select("id").eq("assignment_id", ids.assignmentA);
    expect((charges ?? []).length).toBeGreaterThan(0);
  });
});

if (!isolatedConfigured) {
  describe.skip("Phase 2 rental RLS (skipped — not an isolated local Supabase target)", () => {
    it("requires frontend/.env.isolated with loopback IJAARO_ISOLATED_* keys", () => {
      expect(isolatedConfigured).toBe(false);
    });
  });
}
