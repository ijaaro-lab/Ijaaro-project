import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CreditCard,
  Download,
  FileText,
  Receipt,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard, MetricRow } from "@/components/ui/metric-card";
import { brandingString } from "@/lib/uploadImage";
import { money, statusTone } from "@/lib/format";
import { openUtilityInvoice } from "@/lib/utilityInvoice";
import { supabase } from "@/lib/supabase";
import type { BillStatus, UtilityAccount, UtilityBill } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function ReportsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];
  const branding = (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>;
  const companyName =
    brandingString(branding, "display_name") || activeMembership?.tenant.name || label;
  const accent = kind === "water" ? "water" : "power";

  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [accounts, setAccounts] = useState<UtilityAccount[]>([]);
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
      const [billsRes, accountsRes] = await Promise.all([
        supabase
          .from("utility_bills")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("period_start", { ascending: false }),
        supabase.from("utility_accounts").select("*").eq("tenant_id", tenantId),
      ]);
      if (cancelled) return;
      if (billsRes.error || accountsRes.error) {
        setError(billsRes.error?.message || accountsRes.error?.message || "Failed to load");
      } else {
        setError(null);
        setBills(billsRes.data ?? []);
        setAccounts(accountsRes.data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, matchesKind, isStaff]);

  const accountById = useMemo(() => {
    const map = new Map<string, UtilityAccount>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  const totals = useMemo(() => {
    const totalBilled = bills.reduce((s, b) => s + Number(b.total_amount), 0);
    const totalCollected = bills.reduce((s, b) => s + Number(b.amount_paid), 0);
    const totalOutstanding = bills.reduce((s, b) => s + Number(b.balance), 0);
    const overdueCount = bills.filter((b) => b.status === "overdue").length;
    return { totalBilled, totalCollected, totalOutstanding, overdueCount };
  }, [bills]);

  const byStatus = useMemo(() => {
    return bills.reduce<Record<string, { count: number; balance: number }>>((acc, b) => {
      const entry = acc[b.status] ?? { count: 0, balance: 0 };
      entry.count += 1;
      entry.balance += Number(b.balance);
      acc[b.status] = entry;
      return acc;
    }, {});
  }, [bills]);

  const recentBills = useMemo(() => bills.slice(0, 12), [bills]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Reports require utility admin or staff access.
      </div>
    );
  }
  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const downloadInvoice = (bill: UtilityBill) => {
    const account = accountById.get(bill.utility_account_id);
    openUtilityInvoice({
      bill,
      kind,
      companyName,
      accountNumber: account?.account_number,
      customerLabel: account?.account_number ? `Account ${account.account_number}` : null,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {label} reports
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Collections snapshot and downloadable invoices.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <MetricRow>
        <MetricCard
          compact
          label="Billed"
          value={money(totals.totalBilled)}
          icon={FileText}
          accent="navy"
        />
        <MetricCard
          compact
          label="Collected"
          value={money(totals.totalCollected)}
          icon={CreditCard}
          accent="green"
        />
        <MetricCard
          compact
          label="Outstanding"
          value={money(totals.totalOutstanding)}
          icon={Receipt}
          accent="warning"
        />
        <MetricCard
          compact
          label="Overdue"
          value={totals.overdueCount}
          icon={AlertTriangle}
          accent={accent}
        />
      </MetricRow>

      <section className="rounded-2xl border border-border/70 bg-card p-4 dark:border-border sm:p-5">
        <h3 className="font-display text-sm font-semibold text-foreground">Status breakdown</h3>
        {Object.keys(byStatus).length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No bills generated yet.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {Object.entries(byStatus).map(([status, v]) => (
              <li
                key={status}
                className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs dark:border-border"
              >
                <Badge tone={statusTone(status as BillStatus)}>{status}</Badge>
                <span className="tabular-nums text-muted-foreground">
                  {v.count} · {money(v.balance)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card dark:border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground">Recent invoices</h3>
            <p className="text-xs text-muted-foreground">Download or print as PDF from the invoice window.</p>
          </div>
        </div>
        {recentBills.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground sm:px-5">No invoices yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Account</th>
                  <th className="px-4 py-2.5 font-semibold">Period</th>
                  <th className="px-4 py-2.5 font-semibold">Total</th>
                  <th className="px-4 py-2.5 font-semibold">Balance</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-right sm:px-5">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {recentBills.map((bill) => {
                  const account = accountById.get(bill.utility_account_id);
                  return (
                    <tr key={bill.id} className="align-middle">
                      <td className="px-4 py-2.5 font-medium tabular-nums sm:px-5">
                        {account?.account_number ?? bill.utility_account_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {bill.period_start} → {bill.period_end}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{money(bill.total_amount)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(bill.balance)}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={statusTone(bill.status)}>{bill.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right sm:px-5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => downloadInvoice(bill)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
