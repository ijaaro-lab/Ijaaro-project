import { useEffect, useState } from "react";
import { AlertTriangle, CreditCard, FileText, Receipt } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { BillStatus, UtilityBill } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function ReportsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff = activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];

  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !matchesKind || !isStaff) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase.from("utility_bills").select("*").eq("tenant_id", tenantId);
      if (cancelled) return;
      if (err) setError(err.message);
      else {
        setError(null);
        setBills(data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, matchesKind, isStaff]);

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
        Reports require utility admin or staff access.
      </div>
    );
  }
  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const totalBilled = bills.reduce((s, b) => s + Number(b.total_amount), 0);
  const totalCollected = bills.reduce((s, b) => s + Number(b.amount_paid), 0);
  const totalOutstanding = bills.reduce((s, b) => s + Number(b.balance), 0);
  const overdueCount = bills.filter((b) => b.status === "overdue").length;

  const byStatus = bills.reduce<Record<string, { count: number; balance: number }>>((acc, b) => {
    const entry = acc[b.status] ?? { count: 0, balance: 0 };
    entry.count += 1;
    entry.balance += Number(b.balance);
    acc[b.status] = entry;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">{label} reports</h2>
        <p className="mt-1 text-sm text-muted-foreground">Collections and arrears snapshot from current billing data.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total billed" value={money(totalBilled)} icon={FileText} accent="navy" />
        <MetricCard label="Total collected" value={money(totalCollected)} icon={CreditCard} accent="green" />
        <MetricCard label="Outstanding (arrears)" value={money(totalOutstanding)} icon={Receipt} accent="warning" />
        <MetricCard label="Overdue bills" value={overdueCount} icon={AlertTriangle} accent={kind === "water" ? "water" : "power"} />
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-semibold">Breakdown by status</h3>
        </div>
        {Object.keys(byStatus).length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">No bills generated yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {Object.entries(byStatus).map(([status, v]) => (
              <li key={status} className="flex items-center justify-between px-5 py-3 text-sm">
                <Badge tone={statusTone(status as BillStatus)}>{status}</Badge>
                <div className="text-right">
                  <div className="font-medium">{v.count} bills</div>
                  <div className="text-muted-foreground">Balance {money(v.balance)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
