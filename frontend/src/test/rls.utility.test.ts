/**
 * Phase 3–4 utility RLS / billing / payment security tests (Prompt 03).
 *
 * Requires:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: npm test -- src/test/rls.utility.test.ts
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
const describeUtility = configured ? describe : describe.skip;

async function asUser(email: string, password: string) {
  const client = createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

describeUtility("Phase 3–4 utility RLS, billing & payments", () => {
  const password = "TestPass123!_utility";
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

    await make("waA", "Water Admin A");
    await make("waB", "Water Admin B");
    await make("wsA", "Water Staff A");
    await make("elA", "Elec Admin A");
    await make("elB", "Elec Admin B");
    await make("custA", "Customer A");
    await make("custB", "Customer B");
    await make("llA", "Landlord A");
    await make("outsider", "Outsider");

    const insertTenant = async (
      key: string,
      type: "water_company" | "electricity_company" | "landlord",
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
    };

    await insertTenant("waterA", "water_company", "waA", "utility_admin");
    await insertTenant("waterB", "water_company", "waB", "utility_admin");

    const { error: staffMemErr } = await admin.from("tenant_memberships").insert({
      tenant_id: ids.tenant_waterA,
      user_id: ids.wsA,
      role: "utility_staff",
      status: "active",
    });
    if (staffMemErr) throw staffMemErr;
    await insertTenant("elecA", "electricity_company", "elA", "utility_admin");
    await insertTenant("elecB", "electricity_company", "elB", "utility_admin");
    await insertTenant("landlordA", "landlord", "llA", "landlord_admin");

    const { data: prop, error: pErr } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordA,
        owner_id: ids.llA,
        name: `Utility Prop ${suffix}`,
        address_line: `99 Utility Ave ${suffix}`,
        city: "Mogadishu",
        status: "vacant",
        is_listed: false,
        created_source: "landlord",
      })
      .select("*")
      .single();
    if (pErr) throw pErr;
    ids.property = prop.id;

    // Seed water A account + meter via service role (bypass RPC for setup speed)
    const { data: acctA, error: aErr } = await admin
      .from("utility_accounts")
      .insert({
        tenant_id: ids.tenant_waterA,
        property_id: ids.property,
        service_type: "water",
        account_number: `WA-${suffix}`,
        customer_id: ids.custA,
        status: "active",
        unit_price: 0.5,
        extra_charges_config: {},
      })
      .select("*")
      .single();
    if (aErr) throw aErr;
    ids.accountA = acctA.id;

    await admin.from("tenant_memberships").insert({
      tenant_id: ids.tenant_waterA,
      user_id: ids.custA,
      role: "utility_customer",
      status: "active",
    });

    const { data: meterA, error: mErr } = await admin
      .from("meters")
      .insert({
        tenant_id: ids.tenant_waterA,
        utility_account_id: ids.accountA,
        meter_number: `MWA-${suffix}`,
        service_type: "water",
        status: "active",
        installed_at: "2026-01-01",
      })
      .select("*")
      .single();
    if (mErr) throw mErr;
    ids.meterA = meterA.id;

    // Water B parallel account for isolation tests
    const { data: acctB, error: bErr } = await admin
      .from("utility_accounts")
      .insert({
        tenant_id: ids.tenant_waterB,
        property_id: ids.property,
        service_type: "water",
        account_number: `WB-${suffix}`,
        customer_id: ids.custB,
        status: "active",
        unit_price: 0.75,
      })
      .select("*")
      .single();
    if (bErr) throw bErr;
    ids.accountB = acctB.id;

    await admin.from("tenant_memberships").insert({
      tenant_id: ids.tenant_waterB,
      user_id: ids.custB,
      role: "utility_customer",
      status: "active",
    });

    const { data: meterB, error: mbErr } = await admin
      .from("meters")
      .insert({
        tenant_id: ids.tenant_waterB,
        utility_account_id: ids.accountB,
        meter_number: `MWB-${suffix}`,
        service_type: "water",
        status: "active",
      })
      .select("*")
      .single();
    if (mbErr) throw mbErr;
    ids.meterB = meterB.id;

    // Electricity A account
    const { data: acctE, error: eErr } = await admin
      .from("utility_accounts")
      .insert({
        tenant_id: ids.tenant_elecA,
        property_id: ids.property,
        service_type: "electricity",
        account_number: `EA-${suffix}`,
        customer_id: ids.custA,
        status: "active",
        unit_price: 0.2,
      })
      .select("*")
      .single();
    if (eErr) throw eErr;
    ids.accountE = acctE.id;

    await admin.from("tenant_memberships").upsert({
      tenant_id: ids.tenant_elecA,
      user_id: ids.custA,
      role: "utility_customer",
      status: "active",
    });

    const { data: meterE, error: meErr } = await admin
      .from("meters")
      .insert({
        tenant_id: ids.tenant_elecA,
        utility_account_id: ids.accountE,
        meter_number: `MEA-${suffix}`,
        service_type: "electricity",
        status: "active",
      })
      .select("*")
      .single();
    if (meErr) throw meErr;
    ids.meterE = meterE.id;
  }, 120_000);

  it("1. Water Co A cannot read Water Co B customers", async () => {
    const client = await asUser(emails.waA, password);
    const { data, error } = await client
      .from("utility_accounts")
      .select("id")
      .eq("id", ids.accountB);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("2. Water Co A cannot create records for Water Co B", async () => {
    const client = await asUser(emails.waA, password);
    const { error } = await client.from("utility_accounts").insert({
      tenant_id: ids.tenant_waterB,
      property_id: ids.property,
      service_type: "water",
      account_number: `HACK-${suffix}`,
      customer_id: ids.custA,
      unit_price: 1,
    });
    expect(error).toBeTruthy();
  });

  it("3. Water Co A cannot update/delete Water Co B bills", async () => {
    // Create a bill on B via service + reading
    const { data: reading } = await admin.rpc("record_meter_reading", {
      p_meter_id: ids.meterB,
      p_reading_value: 10,
      p_reading_date: "2026-02-01",
    });
    // service role has no auth.uid — seed reading/bill directly
    const { data: mr } = await admin
      .from("meter_readings")
      .insert({
        tenant_id: ids.tenant_waterB,
        meter_id: ids.meterB,
        utility_account_id: ids.accountB,
        reading_value: 10,
        previous_reading_value: 0,
        reading_date: "2026-02-01",
        units_consumed: 10,
        status: "valid",
        recorded_by: ids.waB,
      })
      .select("*")
      .single();
    void reading;

    const { data: bill } = await admin
      .from("utility_bills")
      .insert({
        tenant_id: ids.tenant_waterB,
        utility_account_id: ids.accountB,
        property_id: ids.property,
        meter_reading_id: mr!.id,
        service_type: "water",
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        previous_reading: 0,
        current_reading: 10,
        units_consumed: 10,
        unit_price: 0.75,
        extra_charges: 0,
        total_amount: 7.5,
        amount_paid: 0,
        balance: 7.5,
        due_date: "2026-02-14",
        status: "issued",
        responsible_party_id: ids.llA,
        responsible_party_role: "owner",
        occupancy_snapshot: {},
      })
      .select("*")
      .single();
    ids.billB = bill!.id;

    const client = await asUser(emails.waA, password);
    const { data: seen } = await client.from("utility_bills").select("id").eq("id", ids.billB);
    expect(seen ?? []).toHaveLength(0);

    const { error: updErr } = await client
      .from("utility_bills")
      .update({ status: "cancelled" })
      .eq("id", ids.billB);
    // RLS blocks update (no matching rows / policy false)
    expect(updErr || true).toBeTruthy();

    const { error: delErr } = await client.from("utility_bills").delete().eq("id", ids.billB);
    expect(delErr || true).toBeTruthy();

    const { data: still } = await admin.from("utility_bills").select("status").eq("id", ids.billB).single();
    expect(still?.status).toBe("issued");
  });

  it("4. Electricity Co A cannot access Electricity Co B records", async () => {
    const { data: acctEB } = await admin
      .from("utility_accounts")
      .insert({
        tenant_id: ids.tenant_elecB,
        property_id: ids.property,
        service_type: "electricity",
        account_number: `EB-${suffix}`,
        customer_id: ids.custB,
        status: "active",
        unit_price: 0.3,
      })
      .select("*")
      .single();

    const client = await asUser(emails.elA, password);
    const { data } = await client.from("utility_accounts").select("id").eq("id", acctEB!.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("5. Cross-type water/electricity private access is denied", async () => {
    const water = await asUser(emails.waA, password);
    const { data: elecRows } = await water
      .from("utility_accounts")
      .select("id")
      .eq("id", ids.accountE);
    expect(elecRows ?? []).toHaveLength(0);

    const elec = await asUser(emails.elA, password);
    const { data: waterRows } = await elec
      .from("utility_accounts")
      .select("id")
      .eq("id", ids.accountA);
    expect(waterRows ?? []).toHaveLength(0);
  });

  it("6. Utility customer cannot access another customer's private bills", async () => {
    const { data: mr } = await admin
      .from("meter_readings")
      .insert({
        tenant_id: ids.tenant_waterA,
        meter_id: ids.meterA,
        utility_account_id: ids.accountA,
        reading_value: 100,
        previous_reading_value: 0,
        reading_date: "2026-03-01",
        units_consumed: 100,
        status: "valid",
        recorded_by: ids.waA,
      })
      .select("*")
      .single();

    const { data: bill } = await admin
      .from("utility_bills")
      .insert({
        tenant_id: ids.tenant_waterA,
        utility_account_id: ids.accountA,
        property_id: ids.property,
        meter_reading_id: mr!.id,
        service_type: "water",
        period_start: "2026-02-01",
        period_end: "2026-02-28",
        previous_reading: 0,
        current_reading: 100,
        units_consumed: 100,
        unit_price: 0.5,
        extra_charges: 0,
        total_amount: 50,
        amount_paid: 0,
        balance: 50,
        due_date: "2026-03-14",
        status: "issued",
        responsible_party_id: ids.custA,
        responsible_party_role: "customer",
        occupancy_snapshot: {},
      })
      .select("*")
      .single();
    ids.billA = bill!.id;

    const custB = await asUser(emails.custB, password);
    const { data } = await custB.from("utility_bills").select("id").eq("id", ids.billA);
    expect(data ?? []).toHaveLength(0);
  });

  it("7. Customer cannot reassign their account to another tenant", async () => {
    const cust = await asUser(emails.custA, password);
    // RLS blocks update (0 rows). PostgREST often returns error=null on silent deny.
    const { data: updated, error } = await cust
      .from("utility_accounts")
      .update({ tenant_id: ids.tenant_waterB, customer_id: ids.custB })
      .eq("id", ids.accountA)
      .select("id");
    expect(error || (updated ?? []).length === 0).toBeTruthy();

    const { data } = await admin
      .from("utility_accounts")
      .select("tenant_id, customer_id")
      .eq("id", ids.accountA)
      .single();
    expect(data?.tenant_id).toBe(ids.tenant_waterA);
    expect(data?.customer_id).toBe(ids.custA);
  });

  it("8. Unauthorized users cannot create or modify meter readings", async () => {
    const outsider = await asUser(emails.outsider, password);
    const { error: insertErr } = await outsider.from("meter_readings").insert({
      tenant_id: ids.tenant_waterA,
      meter_id: ids.meterA,
      utility_account_id: ids.accountA,
      reading_value: 999,
      reading_date: "2026-04-01",
      status: "valid",
      recorded_by: ids.outsider,
    });
    expect(insertErr).toBeTruthy();

    const { error: rpcErr } = await outsider.rpc("record_meter_reading", {
      p_meter_id: ids.meterA,
      p_reading_value: 999,
    });
    expect(rpcErr).toBeTruthy();

    const landlord = await asUser(emails.llA, password);
    const { error: llErr } = await landlord.rpc("record_meter_reading", {
      p_meter_id: ids.meterA,
      p_reading_value: 120,
    });
    expect(llErr).toBeTruthy();
  });

  it("9. Invalid or decreasing readings are rejected", async () => {
    const staff = await asUser(emails.waA, password);

    // Baseline reading
    const { data: first, error: firstErr } = await staff.rpc("record_meter_reading", {
      p_meter_id: ids.meterA,
      p_reading_value: 200,
      p_reading_date: "2026-05-01",
    });
    expect(firstErr).toBeNull();
    expect(Number(first.reading_value)).toBe(200);

    const { error: decErr } = await staff.rpc("record_meter_reading", {
      p_meter_id: ids.meterA,
      p_reading_value: 150,
      p_reading_date: "2026-05-02",
    });
    expect(decErr).toBeTruthy();

    const { error: negErr } = await staff.rpc("record_meter_reading", {
      p_meter_id: ids.meterA,
      p_reading_value: -1,
      p_reading_date: "2026-05-03",
    });
    expect(negErr).toBeTruthy();
  });

  it("10. Duplicate bill generation for same account/period is prevented", async () => {
    const staff = await asUser(emails.waA, password);
    const { data: reading, error: rErr } = await staff.rpc("record_meter_reading", {
      p_meter_id: ids.meterA,
      p_reading_value: 230,
      p_reading_date: "2026-06-01",
    });
    expect(rErr).toBeNull();

    const { data: bill1, error: b1 } = await staff.rpc("generate_utility_bill", {
      p_meter_reading_id: reading.id,
      p_period_start: "2026-05-01",
      p_period_end: "2026-05-31",
    });
    expect(b1).toBeNull();
    ids.billDup = bill1.id;

    // Another reading in same period window still cannot create same period bill
    const { data: reading2 } = await staff.rpc("record_meter_reading", {
      p_meter_id: ids.meterA,
      p_reading_value: 240,
      p_reading_date: "2026-06-02",
    });
    const { error: b2 } = await staff.rpc("generate_utility_bill", {
      p_meter_reading_id: reading2.id,
      p_period_start: "2026-05-01",
      p_period_end: "2026-05-31",
    });
    expect(b2).toBeTruthy();
  });

  it("11. Billing calculation matches documented formula (100→130 @ 0.50 = 15)", async () => {
    // Unique (tenant, property, service) for active accounts — use a dedicated property
    const { data: calcProp, error: cpErr } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordA,
        owner_id: ids.llA,
        address_line: `Calc Ave ${suffix}`,
        status: "vacant",
        is_listed: false,
      })
      .select("*")
      .single();
    if (cpErr) throw cpErr;

    const { data: calcAcct, error: caErr } = await admin
      .from("utility_accounts")
      .insert({
        tenant_id: ids.tenant_waterA,
        property_id: calcProp!.id,
        service_type: "water",
        account_number: `CALC-${suffix}`,
        customer_id: ids.custA,
        status: "active",
        unit_price: 0.5,
      })
      .select("*")
      .single();
    if (caErr) throw caErr;

    const { data: meter, error: mErr } = await admin
      .from("meters")
      .insert({
        tenant_id: ids.tenant_waterA,
        utility_account_id: calcAcct!.id,
        meter_number: `MCALC-${suffix}`,
        service_type: "water",
        status: "active",
      })
      .select("*")
      .single();
    if (mErr) throw mErr;

    const staff = await asUser(emails.waA, password);
    const { error: r1Err } = await staff.rpc("record_meter_reading", {
      p_meter_id: meter!.id,
      p_reading_value: 100,
      p_reading_date: "2026-07-01",
    });
    expect(r1Err).toBeNull();

    const { data: r2, error: r2Err } = await staff.rpc("record_meter_reading", {
      p_meter_id: meter!.id,
      p_reading_value: 130,
      p_reading_date: "2026-07-31",
    });
    expect(r2Err).toBeNull();

    const { data: bill, error: billErr } = await staff.rpc("generate_utility_bill", {
      p_meter_reading_id: r2.id,
      p_period_start: "2026-07-01",
      p_period_end: "2026-07-31",
    });
    expect(billErr).toBeNull();
    expect(Number(bill.units_consumed)).toBe(30);
    expect(Number(bill.unit_price)).toBe(0.5);
    expect(Number(bill.total_amount)).toBe(15);
    expect(Number(bill.balance)).toBe(15);
    ids.calcBill = bill.id;
    ids.calcAcct = calcAcct!.id;
  });

  it("12. Historical bills remain consistent when tariff changes", async () => {
    await admin
      .from("utility_accounts")
      .update({ unit_price: 9.99 })
      .eq("id", ids.calcAcct);

    const { data: bill } = await admin
      .from("utility_bills")
      .select("unit_price, total_amount, balance")
      .eq("id", ids.calcBill)
      .single();
    expect(Number(bill?.unit_price)).toBe(0.5);
    expect(Number(bill?.total_amount)).toBe(15);
  });

  it("13. Payments cannot be attached to another customer's bill", async () => {
    const custB = await asUser(emails.custB, password);
    const { error } = await custB.from("utility_payments").insert({
      utility_bill_id: ids.calcBill,
      amount: 5,
      method: "mobile_money",
    });
    expect(error).toBeTruthy();
  });

  it("14–15. Payment approval updates balance once; duplicate pending blocked", async () => {
    const cust = await asUser(emails.custA, password);
    const { data: pay1, error: p1 } = await cust
      .from("utility_payments")
      .insert({
        utility_bill_id: ids.calcBill,
        amount: 10,
        method: "mobile_money",
        reference: `ref1-${suffix}`,
      })
      .select("*")
      .single();
    expect(p1).toBeNull();

    const { error: pDup } = await cust.from("utility_payments").insert({
      utility_bill_id: ids.calcBill,
      amount: 5,
      method: "cash",
    });
    expect(pDup).toBeTruthy(); // one pending per bill+payer

    const staff = await asUser(emails.waA, password);
    const { data: reviewed, error: revErr } = await staff.rpc("review_utility_payment", {
      p_payment_id: pay1!.id,
      p_decision: "approve",
    });
    expect(revErr).toBeNull();
    expect(Number(reviewed.bill.amount_paid)).toBe(10);
    expect(Number(reviewed.bill.balance)).toBe(5);
    expect(reviewed.bill.status).toBe("partial");

    // Re-approve same payment must fail
    const { error: again } = await staff.rpc("review_utility_payment", {
      p_payment_id: pay1!.id,
      p_decision: "approve",
    });
    expect(again).toBeTruthy();

    const { data: bill } = await admin
      .from("utility_bills")
      .select("amount_paid, balance, status")
      .eq("id", ids.calcBill)
      .single();
    expect(Number(bill?.amount_paid)).toBe(10);
    expect(Number(bill?.balance)).toBe(5);
  });

  it("16. Utility payment workflows do not require landlord confirmation", async () => {
    const cust = await asUser(emails.custA, password);
    const { data: pay, error: payErr } = await cust
      .from("utility_payments")
      .insert({
        utility_bill_id: ids.calcBill,
        amount: 5,
        method: "cash",
        reference: `final-${suffix}`,
      })
      .select("*")
      .single();
    expect(payErr).toBeNull();

    const landlord = await asUser(emails.llA, password);
    const { error } = await landlord.rpc("review_utility_payment", {
      p_payment_id: pay!.id,
      p_decision: "approve",
    });
    expect(error).toBeTruthy();

    // Landlord cannot use rent review on a utility payment id
    const { error: rentErr } = await landlord.rpc("review_rent_payment", {
      p_payment_id: pay!.id,
      p_decision: "approve",
    });
    expect(rentErr).toBeTruthy();

    // Company can approve without landlord
    const staff = await asUser(emails.waA, password);
    const { data, error: ok } = await staff.rpc("review_utility_payment", {
      p_payment_id: pay!.id,
      p_decision: "approve",
    });
    expect(ok).toBeNull();
    expect(data.bill.status).toBe("paid");
    expect(Number(data.bill.balance)).toBe(0);
  });

  it("17. Landlord rental permissions remain unchanged (no utility admin access)", async () => {
    const landlord = await asUser(emails.llA, password);
    const { data: accounts } = await landlord.from("utility_accounts").select("id");
    expect(accounts ?? []).toHaveLength(0);

    const { data: props } = await landlord
      .from("properties")
      .select("id")
      .eq("tenant_id", ids.tenant_landlordA);
    expect((props ?? []).length).toBeGreaterThan(0);
  });

  it("18. link_utility_account works for company staff on existing property", async () => {
    // Use electricity B on a second property to avoid unique conflicts
    const { data: prop2 } = await admin
      .from("properties")
      .insert({
        tenant_id: ids.tenant_landlordA,
        owner_id: ids.llA,
        address_line: `Link St ${suffix}`,
        status: "vacant",
        is_listed: false,
      })
      .select("*")
      .single();

    const staff = await asUser(emails.elB, password);
    const { data, error } = await staff.rpc("link_utility_account", {
      p_company_tenant_id: ids.tenant_elecB,
      p_property_id: prop2!.id,
      p_customer_id: ids.custB,
      p_account_number: `LINK-${suffix}`,
      p_unit_price: 0.25,
      p_meter_number: `MLINK-${suffix}`,
    });
    expect(error).toBeNull();
    expect(data.account.account_number).toBe(`LINK-${suffix}`);
    expect(data.meter.meter_number).toBe(`MLINK-${suffix}`);
  });

  it(
    "19. utility_staff can register pending payment and approve (records balance)",
    async () => {
      const wa = await asUser(emails.waA, password);
      const { data: reg, error: regErr } = await wa.rpc("register_utility_house", {
        p_company_tenant_id: ids.tenant_waterA,
        p_address_line: `Staff Pay St ${suffix}`,
        p_account_number: `STAFFPAY-${suffix}`,
        p_monthly_amount: 40,
        p_customer_email: emails.custA,
        p_property_type: "house",
      });
      expect(regErr).toBeNull();

      const { data: bill, error: billErr } = await wa.rpc("generate_flat_utility_bill", {
        p_utility_account_id: reg.account.id,
        p_period_start: "2026-10-01",
        p_period_end: "2026-10-31",
        p_due_date: null,
      });
      expect(billErr).toBeNull();
      ids.staffPayBill = bill.id;

      const staff = await asUser(emails.wsA, password);
      const { data: registered, error: regPayErr } = await staff.rpc(
        "register_utility_payment_by_ops",
        {
          p_utility_bill_id: ids.staffPayBill,
          p_amount: 20,
          p_method: "mobile_money",
          p_reference: `ops-${suffix}`,
        },
      );
      expect(regPayErr).toBeNull();
      expect(registered.status).toBe("pending");
      expect(registered.payer_id).toBe(ids.custA);
      ids.staffRegisteredPay = registered.id;

      // Cross-tenant admin cannot register on another company's bill
      const otherAdmin = await asUser(emails.waB, password);
      const { error: crossErr } = await otherAdmin.rpc("register_utility_payment_by_ops", {
        p_utility_bill_id: ids.staffPayBill,
        p_amount: 5,
        p_method: "cash",
      });
      expect(crossErr).toBeTruthy();

      // Staff can approve — balance updates only after approve
      const { data: reviewed, error: ok } = await staff.rpc("review_utility_payment", {
        p_payment_id: ids.staffRegisteredPay,
        p_decision: "approve",
      });
      expect(ok).toBeNull();
      expect(reviewed.payment.status).toBe("paid");
      expect(Number(reviewed.bill.amount_paid)).toBe(20);
    },
    30_000,
  );
});
