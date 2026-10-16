import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { UtilityBill } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function CustomerBillsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isCustomer = activeMembership?.role === "utility_customer";
  const label = KIND_LABEL[kind];

  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !matchesKind || !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
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
      const [byAccount, byResp] = await Promise.all([
        accountIds.length > 0
          ? supabase.from("utility_bills").select("*").in("utility_account_id", accountIds)
          : Promise.resolve({ data: [] as UtilityBill[], error: null }),
        supabase.from("utility_bills").select("*").eq("tenant_id", tenantId).eq("responsible_party_id", user.id),
      ]);
      if (cancelled) return;
      if (byAccount.error || byResp.error) {
        setError(byAccount.error?.message || byResp.error?.message || "Failed to load");
      } else {
        const merged = new Map<string, UtilityBill>();
        for (const b of [...(byAccount.data ?? []), ...(byResp.data ?? [])]) merged.set(b.id, b);
        setBills(Array.from(merged.values()).sort((a, b) => b.due_date.localeCompare(a.due_date)));
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, matchesKind, user]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }
  if (!isCustomer) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        This page is for utility customer accounts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">My {label.toLowerCase()} bills</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Units = current − previous reading. Total = (units × unit price) + extra charges.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : bills.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No bills yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Period</th>
                <th className="px-4 py-3 font-semibold">Units</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Balance</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bills.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3">
                    {b.period_start} → {b.period_end}
                  </td>
                  <td className="px-4 py-3">{b.units_consumed}</td>
                  <td className="px-4 py-3">{money(b.total_amount)}</td>
                  <td className="px-4 py-3">{money(b.balance)}</td>
                  <td className="px-4 py-3">{b.due_date}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
