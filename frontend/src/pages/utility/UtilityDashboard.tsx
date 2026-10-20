import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  FileText,
  Gauge,
  Home,
  type LucideIcon,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { BarChart, DonutChart } from "@/components/charts/SimpleCharts";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MeterReading, UtilityBill, UtilityPayment } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

type RangeKey = "7d" | "30d" | "90d";
type ChartSpan = "6m" | "3m";

function rangeStart(key: RangeKey): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  d.setDate(d.getDate() - (days - 1));
  return d;
}

function monthsAgoStart(count: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() - (count - 1));
  return d;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function formatRangeLabel(key: RangeKey): string {
  const end = new Date();
  const start = rangeStart(key);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0 && current <= 0) return null;
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function formatCount(n: number): string {
  return new Intl.NumberFormat(undefined).format(n);
}

export function UtilityDashboard({ kind }: { kind: UtilityKind }) {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const isCustomer = activeMembership?.role === "utility_customer";
  const tenantSearch = activeMembership?.tenant.slug
    ? `?tenant=${encodeURIComponent(activeMembership.tenant.slug)}`
    : "";
  const accent = kind === "water" ? "water" : "power";
  const chartColor = kind === "water" ? "#3B82F6" : "var(--color-brand-power)";
  const serviceLabel = KIND_LABEL[kind];

  const [range, setRange] = useState<RangeKey>("30d");
  const [chartSpan, setChartSpan] = useState<ChartSpan>("6m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountCount, setAccountCount] = useState(0);
  const [activeConnections, setActiveConnections] = useState(0);
  const [meterCount, setMeterCount] = useState(0);
  const [billsIssued, setBillsIssued] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [collected, setCollected] = useState(0);
  const [prevCollected, setPrevCollected] = useState(0);
  const [prevBillsIssued, setPrevBillsIssued] = useState(0);

  const [approvedInCharts, setApprovedInCharts] = useState<UtilityPayment[]>([]);
  const [allPayments, setAllPayments] = useState<UtilityPayment[]>([]);
  const [allBills, setAllBills] = useState<Array<{ status: string }>>([]);
  const [readingsInCharts, setReadingsInCharts] = useState<MeterReading[]>([]);

  const [customerBills, setCustomerBills] = useState<UtilityBill[]>([]);
  const [customerPayments, setCustomerPayments] = useState<UtilityPayment[]>([]);

  useEffect(() => {
    if (!tenantId || !matchesKind) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const from = rangeStart(range).toISOString();
    const periodDays = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const prevStart = new Date(rangeStart(range));
    prevStart.setDate(prevStart.getDate() - periodDays);
    const chartMonths = chartSpan === "6m" ? 6 : 3;
    const chartFrom = monthsAgoStart(chartMonths);

    (async () => {
      setLoading(true);
      setError(null);

      if (isStaff) {
        const [
          accRes,
          activeAccRes,
          meterRes,
          billsPeriodRes,
          prevBillsRes,
          openBillsRes,
          paidRes,
          prevPaidRes,
          statusPayRes,
          billStatusRes,
          chartPaidRes,
          chartReadingsRes,
        ] = await Promise.all([
          supabase.from("utility_accounts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase
            .from("utility_accounts")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("status", "active"),
          supabase.from("meters").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase
            .from("utility_bills")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .gte("created_at", from)
            .neq("status", "cancelled"),
          supabase
            .from("utility_bills")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .gte("created_at", prevStart.toISOString())
            .lt("created_at", from)
            .neq("status", "cancelled"),
          supabase
            .from("utility_bills")
            .select("balance,status")
            .eq("tenant_id", tenantId)
            .in("status", ["issued", "partial", "overdue"]),
          supabase
            .from("utility_payments")
            .select("amount,currency,reviewed_at,submitted_at,status")
            .eq("tenant_id", tenantId)
            .eq("status", "paid")
            .gte("reviewed_at", from),
          supabase
            .from("utility_payments")
            .select("amount")
            .eq("tenant_id", tenantId)
            .eq("status", "paid")
            .gte("reviewed_at", prevStart.toISOString())
            .lt("reviewed_at", from),
          supabase.from("utility_payments").select("status,amount").eq("tenant_id", tenantId),
          supabase
            .from("utility_bills")
            .select("status")
            .eq("tenant_id", tenantId)
            .neq("status", "cancelled"),
          supabase
            .from("utility_payments")
            .select("amount,currency,reviewed_at,submitted_at,status")
            .eq("tenant_id", tenantId)
            .eq("status", "paid")
            .gte("reviewed_at", chartFrom.toISOString()),
          supabase
            .from("meter_readings")
            .select("reading_date,units_consumed,status")
            .eq("tenant_id", tenantId)
            .gte("reading_date", chartFrom.toISOString().slice(0, 10))
            .in("status", ["valid", "corrected", "reset"]),
        ]);

        if (cancelled) return;

        const firstErr =
          accRes.error ||
          activeAccRes.error ||
          meterRes.error ||
          billsPeriodRes.error ||
          prevBillsRes.error ||
          openBillsRes.error ||
          paidRes.error ||
          prevPaidRes.error ||
          statusPayRes.error ||
          billStatusRes.error ||
          chartPaidRes.error ||
          chartReadingsRes.error;

        if (firstErr) {
          setError(firstErr.message);
        } else {
          setAccountCount(accRes.count ?? 0);
          setActiveConnections(activeAccRes.count ?? 0);
          setMeterCount(meterRes.count ?? 0);
          setBillsIssued(billsPeriodRes.count ?? 0);
          setPrevBillsIssued(prevBillsRes.count ?? 0);
          setOutstanding((openBillsRes.data ?? []).reduce((s, b) => s + Number(b.balance), 0));
          setCollected((paidRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0));
          setPrevCollected((prevPaidRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0));
          setAllPayments((statusPayRes.data as unknown as UtilityPayment[]) ?? []);
          setAllBills(billStatusRes.data ?? []);
          setApprovedInCharts((chartPaidRes.data as unknown as UtilityPayment[]) ?? []);
          setReadingsInCharts((chartReadingsRes.data as unknown as MeterReading[]) ?? []);
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
          supabase
            .from("utility_bills")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("responsible_party_id", user.id),
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
          setError(
            byAccount.error?.message || byResp.error?.message || payRes.error?.message || "Failed",
          );
        } else {
          const merged = new Map<string, UtilityBill>();
          for (const b of [...(byAccount.data ?? []), ...(byResp.data ?? [])]) merged.set(b.id, b);
          setCustomerBills(
            Array.from(merged.values()).sort((a, b) => a.due_date.localeCompare(b.due_date)),
          );
          setCustomerPayments(payRes.data ?? []);
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, matchesKind, isStaff, isCustomer, user, range, chartSpan]);

  const collectionPoints = useMemo(() => {
    const months = chartSpan === "6m" ? 6 : 3;
    const buckets = new Map<string, number>();
    const start = monthsAgoStart(months);
    for (let i = 0; i < months; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, 0);
    }
    for (const p of approvedInCharts) {
      const ts = p.reviewed_at || p.submitted_at;
      if (!ts) continue;
      const key = monthKey(ts);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(p.amount));
    }
    return Array.from(buckets.entries()).map(([key, value]) => ({
      key,
      label: new Date(key + "-01T12:00:00").toLocaleDateString(undefined, { month: "short" }),
      value,
    }));
  }, [approvedInCharts, chartSpan]);

  const consumptionPoints = useMemo(() => {
    const months = chartSpan === "6m" ? 6 : 3;
    const buckets = new Map<string, number>();
    const start = monthsAgoStart(months);
    for (let i = 0; i < months; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, 0);
    }
    for (const r of readingsInCharts) {
      if (r.units_consumed == null) continue;
      const key = monthKey(r.reading_date);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(r.units_consumed));
    }
    return Array.from(buckets.entries()).map(([key, value]) => ({
      key,
      label: new Date(key + "-01T12:00:00").toLocaleDateString(undefined, { month: "short" }),
      value,
    }));
  }, [readingsInCharts, chartSpan]);

  const paymentStatusSlices = useMemo(() => {
    const paid = allPayments.filter((p) => p.status === "paid").length;
    const pending = allPayments.filter((p) => p.status === "pending").length;
    const rejected = allPayments.filter((p) => p.status === "rejected").length;
    const overdue = allBills.filter((b) => b.status === "overdue").length;
    return [
      { key: "paid", label: "Paid", value: paid, color: "#22C55E" },
      { key: "pending", label: "Pending", value: pending, color: "#F59E0B" },
      { key: "rejected", label: "Rejected", value: rejected, color: "#EF4444" },
      { key: "overdue", label: "Overdue", value: overdue, color: "#8B5CF6" },
    ].filter((s) => s.value > 0);
  }, [allPayments, allBills]);

  const statusTotal =
    paymentStatusSlices.reduce((s, x) => s + x.value, 0) || allBills.length || allPayments.length;

  const lastCollection = collectionPoints[collectionPoints.length - 1]?.value ?? 0;
  const prevCollection = collectionPoints[collectionPoints.length - 2]?.value ?? 0;
  const collectionDelta = pctChange(lastCollection, prevCollection);

  const lastConsumption = consumptionPoints[consumptionPoints.length - 1]?.value ?? 0;
  const prevConsumption = consumptionPoints[consumptionPoints.length - 2]?.value ?? 0;
  const consumptionDelta = pctChange(lastConsumption, prevConsumption);

  const collectedDelta = pctChange(collected, prevCollected);
  const billsDelta = pctChange(billsIssued, prevBillsIssued);

  const lastMonthLabel = collectionPoints[collectionPoints.length - 1]?.label ?? "period";
  const prevMonthLabel = collectionPoints[collectionPoints.length - 2]?.label ?? "prior";

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {KIND_LABEL[kind].toLowerCase()} company membership to view this workspace.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <div
          className={cn(
            "h-9 w-9 animate-pulse rounded-full",
            kind === "water" ? "bg-brand-water/25" : "bg-brand-power/30",
          )}
        />
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-2">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {isStaff && (
        <>
          <header className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Overview
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Here&apos;s what&apos;s happening with your {serviceLabel.toLowerCase()} operations
                today.
              </p>
            </div>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                className="h-10 appearance-none rounded-xl border border-border bg-card py-2 pl-10 pr-9 text-sm font-medium text-foreground shadow-sm"
                value={range}
                onChange={(e) => setRange(e.target.value as RangeKey)}
                aria-label="Date range"
              >
                <option value="7d">{formatRangeLabel("7d")} (7 days)</option>
                <option value="30d">{formatRangeLabel("30d")}</option>
                <option value="90d">{formatRangeLabel("90d")} (90 days)</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiTile
              label="Total Customers"
              value={formatCount(accountCount)}
              icon={Users}
              tone="blue"
              to={`/app/${kind}/customers${tenantSearch}`}
            />
            <KpiTile
              label="Active Connections"
              value={formatCount(activeConnections)}
              icon={Home}
              tone="green"
              to={`/app/${kind}/connections${tenantSearch}`}
            />
            <KpiTile
              label="Total Meters"
              value={formatCount(meterCount)}
              icon={Gauge}
              tone="violet"
              to={`/app/${kind}/meters${tenantSearch}`}
            />
            <KpiTile
              label="Bills Issued"
              value={formatCount(billsIssued)}
              icon={FileText}
              tone="sky"
              delta={billsDelta}
              to={`/app/${kind}/bills${tenantSearch}`}
            />
            <KpiTile
              label="Payments Collected"
              value={money(collected)}
              icon={Wallet}
              tone="orange"
              delta={collectedDelta}
              to={`/app/${kind}/payments${tenantSearch}`}
            />
            <KpiTile
              label="Outstanding Balance"
              value={money(outstanding)}
              icon={RefreshCw}
              tone="rose"
              to={`/app/${kind}/bills${tenantSearch}`}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <section className="flex min-h-[380px] flex-col rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_3px_rgba(11,31,58,0.05)] dark:border-border dark:shadow-none">
              <div className="mb-5 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">
                    {serviceLabel} Collections
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Monthly collected payments</p>
                </div>
                <ChartSpanSelect value={chartSpan} onChange={setChartSpan} />
              </div>
              <BarChart
                points={collectionPoints}
                color={chartColor}
                highlightColor={chartColor}
                height={220}
                formatValue={(n) => money(n)}
                emptyLabel="No approved collections yet"
                showValues={false}
                className="flex-1"
              />
              <div className="mt-5 border-t border-border/80 pt-4">
                <p className="text-xs text-muted-foreground">Total collected · {lastMonthLabel}</p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-2xl font-bold tabular-nums text-foreground">
                    {money(lastCollection)}
                  </span>
                  <DeltaBadge value={collectionDelta} vsLabel={prevMonthLabel} />
                </div>
              </div>
            </section>

            <section className="flex min-h-[380px] flex-col rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_3px_rgba(11,31,58,0.05)] dark:border-border dark:shadow-none">
              <div className="mb-5">
                <h3 className="font-display text-base font-semibold text-foreground">
                  Payment Status Distribution
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Payments & overdue bills</p>
              </div>
              {paymentStatusSlices.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">No payments yet</p>
                  <p className="text-xs text-muted-foreground">
                    Status mix appears after customers submit payments.
                  </p>
                </div>
              ) : (
                <DonutChart
                  slices={paymentStatusSlices}
                  size={180}
                  thickness={24}
                  centerLabel="Total"
                  centerValue={formatCount(statusTotal)}
                  className="flex-1 !flex-col !items-center justify-center sm:!flex-col sm:!items-center"
                />
              )}
            </section>

            <section className="flex min-h-[380px] flex-col rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_3px_rgba(11,31,58,0.05)] dark:border-border dark:shadow-none">
              <div className="mb-5 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">
                    {serviceLabel} Consumption
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Total consumption (units)</p>
                </div>
                <ChartSpanSelect value={chartSpan} onChange={setChartSpan} />
              </div>
              <BarChart
                points={consumptionPoints}
                color={kind === "water" ? "#60A5FA" : "var(--color-brand-power)"}
                highlightColor={kind === "water" ? "#60A5FA" : "var(--color-brand-power)"}
                height={220}
                emptyLabel="No meter readings with consumption yet"
                showValues={false}
                className="flex-1"
              />
              <div className="mt-5 border-t border-border/80 pt-4">
                <p className="text-xs text-muted-foreground">
                  Total consumption · {lastMonthLabel}
                </p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-2xl font-bold tabular-nums text-foreground">
                    {formatCount(Math.round(lastConsumption))}{" "}
                    <span className="text-base font-semibold text-muted-foreground">units</span>
                  </span>
                  <DeltaBadge value={consumptionDelta} vsLabel={prevMonthLabel} />
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {isCustomer && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Open bills"
              value={customerBills.filter((b) => b.balance > 0).length}
              icon={FileText}
              accent="warning"
              to={`/app/${kind}/my-bills${tenantSearch}`}
            />
            <MetricCard
              label="Outstanding balance"
              value={money(customerBills.reduce((s, b) => s + Number(b.balance), 0))}
              icon={Wallet}
              accent={accent}
              to={`/app/${kind}/my-bills${tenantSearch}`}
            />
            <MetricCard
              label="Recent payments"
              value={customerPayments.length}
              icon={Wallet}
              accent="green"
              to={`/app/${kind}/my-payments${tenantSearch}`}
            />
          </div>

          <section className="rounded-2xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none">
            <div className="flex items-center justify-between border-b border-border/80 px-4 py-3.5">
              <h3 className="font-display text-sm font-semibold text-foreground">My bills</h3>
              <Link
                to={`/app/${kind}/my-bills${tenantSearch}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline dark:text-brand-water"
              >
                View all
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {customerBills.length === 0 ? (
              <div className="px-4 py-5 text-sm text-muted-foreground">No bills yet.</div>
            ) : (
              <ul className="divide-y divide-border/80">
                {customerBills.slice(0, 5).map((b) => (
                  <li key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <div className="font-medium text-foreground">Due {b.due_date}</div>
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
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Your membership role does not have utility dashboard access.
        </div>
      )}
    </div>
  );
}

function ChartSpanSelect({
  value,
  onChange,
}: {
  value: ChartSpan;
  onChange: (v: ChartSpan) => void;
}) {
  return (
    <div className="relative shrink-0">
      <select
        className="h-8 appearance-none rounded-lg border border-border bg-background py-1 pl-2.5 pr-7 text-xs font-medium text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value as ChartSpan)}
        aria-label="Chart time span"
      >
        <option value="6m">Last 6 months</option>
        <option value="3m">Last 3 months</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function DeltaBadge({ value, vsLabel }: { value: number | null; vsLabel: string }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold",
        up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {up ? "+" : ""}
      {value}% vs {vsLabel}
    </span>
  );
}

type KpiTone = "blue" | "green" | "violet" | "sky" | "orange" | "rose";

function KpiTile({
  label,
  value,
  icon: Icon,
  tone,
  delta,
  to,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: KpiTone;
  delta?: number | null;
  to: string;
}) {
  const tones: Record<
    KpiTone,
    { wrap: string; icon: string; deltaUp: string; deltaDown: string }
  > = {
    blue: {
      wrap: "border-blue-100 bg-blue-50/80 dark:border-blue-500/20 dark:bg-blue-500/10",
      icon: "bg-blue-500 text-white",
      deltaUp: "text-emerald-600 dark:text-emerald-400",
      deltaDown: "text-rose-600 dark:text-rose-400",
    },
    green: {
      wrap: "border-emerald-100 bg-emerald-50/80 dark:border-emerald-500/20 dark:bg-emerald-500/10",
      icon: "bg-emerald-500 text-white",
      deltaUp: "text-emerald-600 dark:text-emerald-400",
      deltaDown: "text-rose-600 dark:text-rose-400",
    },
    violet: {
      wrap: "border-violet-100 bg-violet-50/80 dark:border-violet-500/20 dark:bg-violet-500/10",
      icon: "bg-violet-500 text-white",
      deltaUp: "text-emerald-600 dark:text-emerald-400",
      deltaDown: "text-rose-600 dark:text-rose-400",
    },
    sky: {
      wrap: "border-sky-100 bg-sky-50/80 dark:border-sky-500/20 dark:bg-sky-500/10",
      icon: "bg-sky-500 text-white",
      deltaUp: "text-emerald-600 dark:text-emerald-400",
      deltaDown: "text-rose-600 dark:text-rose-400",
    },
    orange: {
      wrap: "border-orange-100 bg-orange-50/80 dark:border-orange-500/20 dark:bg-orange-500/10",
      icon: "bg-orange-500 text-white",
      deltaUp: "text-emerald-600 dark:text-emerald-400",
      deltaDown: "text-rose-600 dark:text-rose-400",
    },
    rose: {
      wrap: "border-rose-100 bg-rose-50/80 dark:border-rose-500/20 dark:bg-rose-500/10",
      icon: "bg-rose-500 text-white",
      deltaUp: "text-emerald-600 dark:text-emerald-400",
      deltaDown: "text-rose-600 dark:text-rose-400",
    },
  };
  const t = tones[tone];

  return (
    <Link
      to={to}
      className={cn(
        "block rounded-2xl border px-3.5 py-3.5 transition hover:-translate-y-0.5 hover:shadow-md",
        t.wrap,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full shadow-sm",
            t.icon,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-display text-xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      {delta != null && (
        <p
          className={cn(
            "mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold",
            delta >= 0 ? t.deltaUp : t.deltaDown,
          )}
        >
          {delta >= 0 ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {delta >= 0 ? "+" : ""}
          {delta}% vs prior period
        </p>
      )}
    </Link>
  );
}
