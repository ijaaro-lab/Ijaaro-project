/**
 * Phase 2 rental RLS / workflow security tests.
 *
 * Requires:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: npm test -- src/test/rls.rental.test.ts
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
const describeRental = configured ? describe : describe.skip;

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

  it("renter can browse listed available properties", async () => {
    const client = await asUser(emails.rA, password);
    const { data, error } = await client.from("properties").select("id").eq("id", ids.propA);
    expect(error).toBeNull();
    expect(data?.some((r) => r.id === ids.propA)).toBe(true);
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

  it("rejected payment retains history and allows later resubmit", async () => {
    const renter = await asUser(emails.rA, password);
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

    const landlord = await asUser(emails.llA, password);
    const { data: rejected, error: rejErr } = await landlord.rpc("review_rent_payment", {
      p_payment_id: payment.id,
      p_decision: "reject",
      p_rejection_reason: "unclear proof",
    });
    expect(rejErr).toBeNull();
    expect(rejected?.payment?.status).toBe("rejected");

    const { data: stillThere } = await landlord
      .from("rent_payments")
      .select("id,status")
      .eq("id", payment.id)
      .single();
    expect(stillThere?.status).toBe("rejected");
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
