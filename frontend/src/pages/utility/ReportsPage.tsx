import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CreditCard, FileText, Receipt } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { BarChart, DonutChart } from "@/components/charts/SimpleCharts";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { BillStatus, UtilityBill, UtilityPayment } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

type RangeKey = "30d" | "90d" | "365d" | "all";

function rangeStart(key: RangeKey): string | null {
  if (key === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const days = key === "30d" ? 30 : key === "90d" ? 90 : 365;
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString();
}

export function ReportsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];
  const chartColor = kind === "water" ? "var(--color-brand-water)" : "var(--color-brand-power)";

  const [range, setRange] = useState<RangeKey>("90d");
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [payments, setPayments] = useState<UtilityPayment[]>([]);
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
      const from = rangeStart(range);
      let billQ = supabase.from("utility_bills").select("*").eq("tenant_id", tenantId);
      let payQ = supabase.from("utility_payments").select("*").eq("tenant_id", tenantId);
      if (from) {
        billQ = billQ.gte("created_at", from);
        payQ = payQ.gte("submitted_at", from);
      }
      const [billRes, payRes] = await Promise.all([billQ, payQ]);
      if (cancelled) return;
      if (billRes.error || payRes.error) {
        setError(billRes.error?.message || payRes.error?.message || "Failed to load");
      } else {
        setError(null);
        setBills(billRes.data ?? []);
        setPayments(payRes.data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, matchesKind, isStaff, range]);

  const totals = useMemo(() => {
    const totalBilled = bills.reduce((s, b) => s + Number(b.total_amount), 0);
    const totalCollected = bills.reduce((s, b) => s + Number(b.amount_paid), 0);
    const totalOutstanding = bills.reduce((s, b) => s + Number(b.balance), 0);
    const overdueCount = bills.filter((b) => b.status === "overdue").length;
    const paid = payments.filter((p) => p.status === "paid");
    const rejected = payments.filter((p) => p.status === "rejected");
    const pending = payments.filter((p) => p.status === "pending");
    return {
      totalBilled,
      totalCollected,
      totalOutstanding,
      overdueCount,
      approvedAmount: paid.reduce((s, p) => s + Number(p.amount), 0),
      rejectedCount: rejected.length,
      pendingCount: pending.length,
    };
  }, [bills, payments]);

  const billStatusSlices = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bills) map.set(b.status, (map.get(b.status) ?? 0) + 1);
    const colors: Record<string, string> = {
      paid: "#1FA85A",
      issued: "#2B8CFF",
      partial: "#D97706",
      overdue: "#DC2626",
      draft: "#5B6B7C",
      cancelled: "#94A3B8",
      disputed: "#7C3AED",
    };
    return Array.from(map.entries()).map(([status, value]) => ({
      key: status,
      label: status,
      value,
      color: colors[status] ?? "#5B6B7C",
    }));
  }, [bills]);

  const billingVsCollections = useMemo(() => {
    const months = new Map<string, { billed: number; collected: number }>();
    for (const b of bills) {
      const key = b.created_at.slice(0, 7);
      const cur = months.get(key) ?? { billed: 0, collected: 0 };
      cur.billed += Number(b.total_amount);
      cur.collected += Number(b.amount_paid);
      months.set(key, cur);
    }
    return Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, v]) => ({
        key,
        label: key,
        value: v.billed,
        collected: v.collected,
      }));
  }, [bills]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">{label} reports</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Collections, arrears, and verification outcomes for this company.
          </p>
        </div>
        <select
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
        >
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="365d">Last year</option>
          <option value="all">All time</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total billed" value={money(totals.totalBilled)} icon={FileText} accent="navy" />
        <MetricCard
          label="Collected (bill paid)"
          value={money(totals.totalCollected)}
          icon={CreditCard}
          accent="green"
        />
        <MetricCard
          label="Outstanding"
          value={money(totals.totalOutstanding)}
          icon={Receipt}
          accent="warning"
        />
        <MetricCard
          label="Overdue bills"
          value={totals.overdueCount}
          icon={AlertTriangle}
          accent={kind === "water" ? "water" : "power"}
        />
      </div>

      <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          Approved payment volume:{" "}
          <span className="font-semibold text-foreground">{money(totals.approvedAmount)}</span>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          Pending verification:{" "}
          <span className="font-semibold text-foreground">{totals.pendingCount}</span>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          Rejected payments:{" "}
          <span className="font-semibold text-foreground">{totals.rejectedCount}</span>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Billing totals by month</h3>
          <BarChart
            points={billingVsCollections.map((p) => ({
              key: p.key,
              label: p.label,
              value: p.value,
            }))}
            color={chartColor}
            highlightColor="var(--color-brand-green)"
            height={180}
            formatValue={(n) => money(n)}
            emptyLabel="No bills in this period"
            showValues={false}
          />
          {billingVsCollections.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              {billingVsCollections.map((p) => (
                <li key={p.key} className="flex justify-between gap-2">
                  <span>{p.label}</span>
                  <span>
                    Billed {money(p.value)} · Collected {money(p.collected)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Bill status distribution</h3>
          {billStatusSlices.length === 0 ? (
            <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
              No bills generated yet.
            </div>
          ) : (
            <DonutChart
              slices={billStatusSlices}
              size={150}
              thickness={20}
              centerLabel="bills"
              centerValue={bills.length}
            />
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-semibold text-foreground">Breakdown by status</h3>
        </div>
        {billStatusSlices.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">No bills generated yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {billStatusSlices.map((s) => {
              const balance = bills
                .filter((b) => b.status === s.key)
                .reduce((sum, b) => sum + Number(b.balance), 0);
              return (
                <li key={s.key} className="flex items-center justify-between px-5 py-3 text-sm">
                  <Badge tone={statusTone(s.key as BillStatus)}>{s.label}</Badge>
                  <div className="text-right">
                    <div className="font-medium text-foreground">{s.value} bills</div>
                    <div className="text-muted-foreground">Balance {money(balance)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
