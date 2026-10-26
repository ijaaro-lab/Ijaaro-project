import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { Meter, MeterReading, UtilityAccount, UtilityBill, UtilityPayment } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function CustomerDetailPage({ kind }: { kind: UtilityKind }) {
  const { id } = useParams();
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff = activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];

  const [account, setAccount] = useState<UtilityAccount | null>(null);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [payments, setPayments] = useState<UtilityPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const accRes = await supabase.from("utility_accounts").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (accRes.error || !accRes.data) {
        setError(accRes.error?.message || "Account not found or unauthorized");
        setLoading(false);
        return;
      }
      setAccount(accRes.data);

      const metersRes = await supabase.from("meters").select("*").eq("utility_account_id", id).order("created_at");
      const meterIds = (metersRes.data ?? []).map((m) => m.id);

      const [readingsRes, billsRes, paymentsRes] = await Promise.all([
        meterIds.length > 0
          ? supabase
              .from("meter_readings")
              .select("*")
              .in("meter_id", meterIds)
              .order("reading_date", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] as MeterReading[], error: null }),
        supabase.from("utility_bills").select("*").eq("utility_account_id", id).order("period_start", { ascending: false }),
        supabase.from("utility_payments").select("*").eq("utility_account_id", id).order("submitted_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setMeters(metersRes.data ?? []);
      setReadings(readingsRes.data ?? []);
      setBills(billsRes.data ?? []);
      setPayments(paymentsRes.data ?? []);
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, tenantId]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Customer details require utility admin or staff access.
      </div>
    );
  }
  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (error || !account) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error || "Account not found"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/app/${kind}/customers`} className="text-sm text-brand-blue hover:underline">
          ← Customers
        </Link>
        <h2 className="mt-2 font-display text-2xl font-bold">{account.account_number}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone={statusTone(account.status)}>{account.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {Number(account.unit_price).toFixed(4)} / unit
            {account.extra_charges_config?.fixed_amount
              ? ` · extra ${money(account.extra_charges_config.fixed_amount)}`
              : ""}
          </span>
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-border bg-card p-5 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">Customer user ID</div>
          <div className="font-mono text-xs">{account.customer_id}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Property</div>
          <div className="font-mono text-xs">{account.property_id}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Effective</div>
          <div>
            {account.effective_from || "—"}
            {account.effective_to ? ` → ${account.effective_to}` : ""}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Meters</h3>
        {meters.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No meters linked yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {meters.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-medium">{m.meter_number}</div>
                  <div className="text-muted-foreground">Installed {m.installed_at || "—"}</div>
                </div>
                <Badge tone={statusTone(m.status)}>{m.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Recent readings</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Previous</th>
                <th className="py-2 pr-3">Current</th>
                <th className="py-2 pr-3">Units</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {readings.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3">{r.reading_date}</td>
                  <td className="py-2 pr-3">{r.previous_reading_value ?? "—"}</td>
                  <td className="py-2 pr-3">{r.reading_value}</td>
                  <td className="py-2 pr-3">{r.units_consumed ?? "—"}</td>
                  <td className="py-2">
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {readings.length === 0 && <p className="text-sm text-muted-foreground">No readings yet.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Bills</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Period</th>
                <th className="py-2 pr-3">Units</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Balance</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bills.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-3">
                    {b.period_start} → {b.period_end}
                  </td>
                  <td className="py-2 pr-3">{b.units_consumed}</td>
                  <td className="py-2 pr-3">{money(b.total_amount)}</td>
                  <td className="py-2 pr-3">{money(b.balance)}</td>
                  <td className="py-2">
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {bills.length === 0 && <p className="text-sm text-muted-foreground">No bills yet.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Payments</h3>
        <ul className="mt-3 divide-y divide-border">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">{money(p.amount, p.currency)}</div>
                <div className="text-muted-foreground">{new Date(p.submitted_at).toLocaleString()}</div>
              </div>
              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
            </li>
          ))}
          {payments.length === 0 && <li className="py-6 text-sm text-muted-foreground">No payments yet.</li>}
        </ul>
      </section>
    </div>
  );
}
