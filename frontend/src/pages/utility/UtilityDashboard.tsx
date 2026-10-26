import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, FileText, Gauge, Users } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { UtilityBill, UtilityPayment } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function UtilityDashboard({ kind }: { kind: UtilityKind }) {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff = activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const isCustomer = activeMembership?.role === "utility_customer";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Staff metrics
  const [accountCount, setAccountCount] = useState(0);
  const [meterCount, setMeterCount] = useState(0);
  const [pendingPayments, setPendingPayments] = useState<UtilityPayment[]>([]);
  const [unpaidBalance, setUnpaidBalance] = useState(0);

  // Customer data
  const [customerBills, setCustomerBills] = useState<UtilityBill[]>([]);
  const [customerPayments, setCustomerPayments] = useState<UtilityPayment[]>([]);

  useEffect(() => {
    if (!tenantId || !matchesKind) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      if (isStaff) {
        const [accRes, meterRes, payRes, billRes] = await Promise.all([
          supabase.from("utility_accounts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase.from("meters").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase
            .from("utility_payments")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("status", "pending")
            .order("submitted_at", { ascending: false })
            .limit(8),
          supabase
            .from("utility_bills")
            .select("balance,status")
            .eq("tenant_id", tenantId)
            .in("status", ["issued", "partial", "overdue"]),
        ]);
        if (cancelled) return;
        if (accRes.error || meterRes.error || payRes.error || billRes.error) {
          setError(
            accRes.error?.message ||
              meterRes.error?.message ||
              payRes.error?.message ||
              billRes.error?.message ||
              "Failed to load",
          );
        } else {
          setAccountCount(accRes.count ?? 0);
          setMeterCount(meterRes.count ?? 0);
          setPendingPayments(payRes.data ?? []);
          setUnpaidBalance((billRes.data ?? []).reduce((sum, b) => sum + Number(b.balance), 0));
        }
      } else if (isCustomer && user) {
        const { data: accounts, error: accErr } = await supabase
          .from("utility_accounts")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("customer_id", user.id);
        if (cancelled) return;
        if (accErr) {
          setError(accErr.message);
          setLoading(false);
          return;
        }
        const accountIds = (accounts ?? []).map((a) => a.id);
        const [byAccount, byResp, payRes] = await Promise.all([
          accountIds.length > 0
            ? supabase.from("utility_bills").select("*").in("utility_account_id", accountIds)
            : Promise.resolve({ data: [] as UtilityBill[], error: null }),
          supabase.from("utility_bills").select("*").eq("tenant_id", tenantId).eq("responsible_party_id", user.id),
          supabase
            .from("utility_payments")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("payer_id", user.id)
            .order("submitted_at", { ascending: false })
            .limit(5),
        ]);
        if (cancelled) return;
        if (byAccount.error || byResp.error || payRes.error) {
          setError(byAccount.error?.message || byResp.error?.message || payRes.error?.message || "Failed to load");
        } else {
          const merged = new Map<string, UtilityBill>();
          for (const b of [...(byAccount.data ?? []), ...(byResp.data ?? [])]) merged.set(b.id, b);
          setCustomerBills(Array.from(merged.values()).sort((a, b) => a.due_date.localeCompare(b.due_date)));
          setCustomerPayments(payRes.data ?? []);
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, matchesKind, isStaff, isCustomer, user]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {KIND_LABEL[kind].toLowerCase()} company membership to view this workspace.
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {isStaff && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Customer accounts" value={accountCount} icon={Users} accent="navy" />
            <MetricCard label="Meters" value={meterCount} icon={Gauge} accent={kind === "water" ? "water" : "power"} />
            <MetricCard label="Pending payments" value={pendingPayments.length} icon={CreditCard} accent="warning" />
            <MetricCard label="Unpaid bill balance" value={money(unpaidBalance)} icon={FileText} accent="green" />
          </div>

          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Pending payments awaiting review</h3>
              <Link to={`/app/${kind}/payments`} className="text-sm text-brand-blue hover:underline">
                Review queue
              </Link>
            </div>
            {pendingPayments.length === 0 ? (
              <div className="px-4 py-4 text-sm text-muted-foreground">No pending submissions.</div>
            ) : (
              <ul className="divide-y divide-border">
                {pendingPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div>
                      <div className="font-medium">{money(p.amount, p.currency)}</div>
                      <div className="text-muted-foreground">{p.method.replaceAll("_", " ")}</div>
                    </div>
                    <Badge tone="warning">pending</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {isCustomer && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <MetricCard
              label="Open bills"
              value={customerBills.filter((b) => b.balance > 0).length}
              icon={FileText}
              accent="warning"
            />
            <MetricCard
              label="Outstanding balance"
              value={money(customerBills.reduce((s, b) => s + Number(b.balance), 0))}
              icon={CreditCard}
              accent={kind === "water" ? "water" : "power"}
            />
            <MetricCard label="Recent payments" value={customerPayments.length} icon={CreditCard} accent="green" />
          </div>

          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">My bills</h3>
              <Link to={`/app/${kind}/my-bills`} className="text-sm text-brand-blue hover:underline">
                View all
              </Link>
            </div>
            {customerBills.length === 0 ? (
              <div className="px-4 py-4 text-sm text-muted-foreground">No bills yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {customerBills.slice(0, 5).map((b) => (
                  <li key={b.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <div className="font-medium">Due {b.due_date}</div>
                      <div className="text-muted-foreground">Balance {money(b.balance)}</div>
                    </div>
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {!isStaff && !isCustomer && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your membership role does not have utility dashboard access.
        </div>
      )}
    </div>
  );
}
