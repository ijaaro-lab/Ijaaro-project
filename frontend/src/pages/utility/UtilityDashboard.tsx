import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CreditCard,
  FileText,
  Home,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { BarChart, DonutChart } from "@/components/charts/SimpleCharts";
import { MetricCard, MetricRow } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { brandingString } from "@/lib/uploadImage";
import { supabase } from "@/lib/supabase";
import { money, paymentStatusLabel, statusTone } from "@/lib/format";
import { tenantSearchSuffix } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import type {
  ExtraChargesConfig,
  UtilityAccount,
  UtilityBill,
  UtilityPayment,
} from "@/types/database";
import {
  isBillPeriodOpen,
  KIND_LABEL,
  KIND_TENANT_TYPE,
  monthlyFeeLabel,
  type UtilityKind,
} from "./shared";

function accountMonthlyFee(account: UtilityAccount): number {
  const cfg = (account.extra_charges_config ?? {}) as ExtraChargesConfig;
  return Number(cfg.fixed_amount ?? 0);
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

function formatCount(n: number): string {
  return new Intl.NumberFormat(undefined).format(n);
}

const CHART_MONTHS = 6;

export function UtilityDashboard({ kind }: { kind: UtilityKind }) {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const role = activeMembership?.role;
  const isStaff = role === "utility_admin" || role === "utility_staff";
  const isCustomer = role === "utility_customer";
  const tenantSearch = tenantSearchSuffix(activeMembership?.tenant.slug);
  const accent = kind === "water" ? "water" : "power";
  const chartColor = kind === "water" ? "var(--color-brand-water)" : "var(--color-brand-power)";
  const hoverBorder =
    kind === "water"
      ? "hover:border-brand-water/30 dark:hover:border-brand-water/35"
      : "hover:border-brand-power/40 dark:hover:border-brand-power/45";
  const serviceLabel = KIND_LABEL[kind];
  const branding = (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>;
  const companyDisplayName =
    brandingString(branding, "display_name") || activeMembership?.tenant.name || serviceLabel;
  const companyPhone = brandingString(branding, "contact_phone");
  const companyEmail = brandingString(branding, "contact_email");
  const eyebrowTone = kind === "water" ? "text-brand-water" : "text-brand-power";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountCount, setAccountCount] = useState(0);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [activeConnections, setActiveConnections] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [collected, setCollected] = useState(0);

  const [approvedInCharts, setApprovedInCharts] = useState<UtilityPayment[]>([]);
  const [allPayments, setAllPayments] = useState<UtilityPayment[]>([]);
  const [allBills, setAllBills] = useState<Array<{ status: string }>>([]);

  const [customerBills, setCustomerBills] = useState<UtilityBill[]>([]);
  const [customerPayments, setCustomerPayments] = useState<UtilityPayment[]>([]);
  const [customerAccounts, setCustomerAccounts] = useState<UtilityAccount[]>([]);

  useEffect(() => {
    if (!tenantId || !matchesKind) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const periodFrom = new Date();
    periodFrom.setHours(0, 0, 0, 0);
    periodFrom.setDate(periodFrom.getDate() - 29);
    const chartFrom = monthsAgoStart(CHART_MONTHS);

    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (isStaff) {
          const [
            accRes,
            activeAccRes,
            openBillsRes,
            paidRes,
            statusPayRes,
            billStatusRes,
            chartPaidRes,
            pendingRes,
          ] = await Promise.all([
            supabase
              .from("utility_accounts")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId),
            supabase
              .from("utility_accounts")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .eq("status", "active"),
            supabase
              .from("utility_bills")
              .select("balance,status")
              .eq("tenant_id", tenantId)
              .in("status", ["issued", "partial", "overdue"]),
            supabase
              .from("utility_payments")
              .select("amount")
              .eq("tenant_id", tenantId)
              .eq("status", "paid")
              .gte("reviewed_at", periodFrom.toISOString()),
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
              .from("utility_payments")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .eq("status", "pending"),
          ]);

          if (cancelled) return;

          const firstErr =
            accRes.error ||
            activeAccRes.error ||
            openBillsRes.error ||
            paidRes.error ||
            statusPayRes.error ||
            billStatusRes.error ||
            chartPaidRes.error ||
            pendingRes.error;

          if (firstErr) {
            setError(firstErr.message);
          } else {
            setAccountCount(accRes.count ?? 0);
            setActiveConnections(activeAccRes.count ?? 0);
            setOutstanding((openBillsRes.data ?? []).reduce((s, b) => s + Number(b.balance), 0));
            setCollected((paidRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0));
            setAllPayments((statusPayRes.data as unknown as UtilityPayment[]) ?? []);
            setAllBills(billStatusRes.data ?? []);
            setApprovedInCharts((chartPaidRes.data as unknown as UtilityPayment[]) ?? []);
            setPendingPayments(pendingRes.count ?? 0);
          }
        } else if (isCustomer && user) {
          const { data: accounts, error: accErr } = await supabase
            .from("utility_accounts")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("customer_id", user.id);
          if (cancelled) return;
          if (accErr) {
            setError(accErr.message);
            return;
          }
          const accountRows = (accounts ?? []) as UtilityAccount[];
          const accountIds = accountRows.map((a) => a.id);
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
              .order("submitted_at", { ascending: false }),
          ]);
          if (cancelled) return;
          if (byAccount.error || byResp.error || payRes.error) {
            setError(
              byAccount.error?.message || byResp.error?.message || payRes.error?.message || "Failed",
            );
          } else {
            const merged = new Map<string, UtilityBill>();
            for (const b of [...(byAccount.data ?? []), ...(byResp.data ?? [])]) merged.set(b.id, b);
            setCustomerAccounts(accountRows);
            setCustomerBills(
              Array.from(merged.values()).sort((a, b) => a.due_date.localeCompare(b.due_date)),
            );
            setCustomerPayments(payRes.data ?? []);
            setAccountCount(accountIds.length);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, matchesKind, isStaff, isCustomer, user]);

  const collectionPoints = useMemo(() => {
    const buckets = new Map<string, number>();
    const start = monthsAgoStart(CHART_MONTHS);
    for (let i = 0; i < CHART_MONTHS; i++) {
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
  }, [approvedInCharts]);

  const paymentStatusSlices = useMemo(() => {
    const paid = allPayments.filter((p) => p.status === "paid").length;
    const pending = allPayments.filter((p) => p.status === "pending").length;
    const rejected = allPayments.filter((p) => p.status === "rejected").length;
    const overdue = allBills.filter((b) => b.status === "overdue").length;
    return [
      { key: "paid", label: "Paid", value: paid, color: "#1fa85a" },
      { key: "pending", label: "Pending", value: pending, color: "#f5c400" },
      { key: "rejected", label: "Rejected", value: rejected, color: "#ef4444" },
      { key: "overdue", label: "Overdue", value: overdue, color: "#94a3b8" },
    ].filter((s) => s.value > 0);
  }, [allPayments, allBills]);

  const statusTotal = paymentStatusSlices.reduce((s, x) => s + x.value, 0);

  const openCustomerBills = useMemo(
    () =>
      customerBills
        .filter(
          (b) => Number(b.balance) > 0 && b.status !== "cancelled" && isBillPeriodOpen(b),
        )
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [customerBills],
  );
  const customerOutstanding = useMemo(
    () => openCustomerBills.reduce((s, b) => s + Number(b.balance), 0),
    [openCustomerBills],
  );
  const customerMonthlyFeeTotal = useMemo(
    () => customerAccounts.reduce((s, a) => s + accountMonthlyFee(a), 0),
    [customerAccounts],
  );

  const customerStatusSlices = useMemo(() => {
    const paid = customerPayments.filter((p) => p.status === "paid").length;
    const pending = customerPayments.filter((p) => p.status === "pending").length;
    const rejected = customerPayments.filter((p) => p.status === "rejected").length;
    return [
      { key: "paid", label: "Approved", value: paid, color: "#1fa85a" },
      { key: "pending", label: "Pending", value: pending, color: "#f5c400" },
      { key: "rejected", label: "Rejected", value: rejected, color: "#ef4444" },
    ].filter((s) => s.value > 0);
  }, [customerPayments]);

  const customerStatusTotal = customerStatusSlices.reduce((s, x) => s + x.value, 0);

  const customerPaymentPoints = useMemo(() => {
    const buckets = new Map<string, number>();
    const start = monthsAgoStart(CHART_MONTHS);
    for (let i = 0; i < CHART_MONTHS; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, 0);
    }
    for (const p of customerPayments) {
      if (p.status !== "paid") continue;
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
  }, [customerPayments]);

  const overdueCount = allBills.filter((b) => b.status === "overdue").length;
  const paidCount = allPayments.filter((p) => p.status === "paid").length;

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {KIND_LABEL[kind].toLowerCase()} company membership to view this workspace.
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {isStaff && (
        <>
          <div>
            <p className={cn("text-[11px] font-semibold tracking-[0.08em]", eyebrowTone)}>
              {serviceLabel} · Today
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {companyDisplayName}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Customers, collections, and payment review at a glance.
            </p>
          </div>

          <MetricRow>
            <MetricCard
              compact
              label="Customers"
              value={formatCount(accountCount)}
              icon={Users}
              accent="navy"
            />
            <MetricCard
              compact
              label="Active"
              value={formatCount(activeConnections)}
              icon={Home}
              accent="green"
            />
            <MetricCard
              compact
              label="Awaiting"
              value={formatCount(pendingPayments)}
              icon={CreditCard}
              accent="warning"
            />
            <MetricCard
              compact
              label="Collected"
              value={money(collected)}
              icon={Wallet}
              accent={accent}
            />
            <MetricCard
              compact
              label="Outstanding"
              value={money(outstanding)}
              icon={FileText}
              accent="warning"
            />
          </MetricRow>

          <div className="grid gap-4 lg:grid-cols-2">
            <section
              className={cn(
                "rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition-colors dark:border-border dark:shadow-none sm:p-6",
                hoverBorder,
              )}
            >
              <div className="mb-5">
                <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                  Collections
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Approved payments · last 6 months
                </p>
              </div>
              <BarChart
                points={collectionPoints}
                height={210}
                color={chartColor}
                highlightColor={kind === "water" ? "#f5c400" : chartColor}
                formatValue={(n) => money(n)}
                emptyLabel="No approved collections yet"
                showValues={false}
              />
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                <span>
                  This month{" "}
                  <strong className="tabular-nums text-foreground">
                    {money(collectionPoints[collectionPoints.length - 1]?.value ?? 0)}
                  </strong>
                </span>
                <Link
                  to={`/app/${kind}/payments${tenantSearch}`}
                  className="inline-flex items-center gap-0.5 font-medium text-brand-blue hover:underline dark:text-brand-water"
                >
                  Review payments
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </section>

            <section
              className={cn(
                "rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition-colors dark:border-border dark:shadow-none sm:p-6",
                hoverBorder,
              )}
            >
              <div className="mb-5">
                <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                  Payment status
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Mix of payments and overdue bills
                </p>
              </div>
              {paymentStatusSlices.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No payment activity yet.
                </p>
              ) : (
                <DonutChart
                  slices={paymentStatusSlices}
                  size={176}
                  thickness={26}
                  centerValue={formatCount(statusTotal)}
                  centerLabel="Total"
                />
              )}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                <span>
                  Paid{" "}
                  <strong className="tabular-nums text-foreground">{formatCount(paidCount)}</strong>
                </span>
                <span>
                  Overdue{" "}
                  <strong className="tabular-nums text-foreground">
                    {formatCount(overdueCount)}
                  </strong>
                </span>
              </div>
            </section>
          </div>
        </>
      )}

      {isCustomer && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className={cn("text-[11px] font-semibold tracking-[0.08em]", eyebrowTone)}>
                {serviceLabel} · Account
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {companyDisplayName}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Balance and payment status for your {serviceLabel.toLowerCase()} account.
              </p>
            </div>
            <Link
              to={`/app/${kind}/my-payments${tenantSearch}`}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition hover:opacity-90",
                kind === "water"
                  ? "bg-brand-blue dark:bg-brand-water"
                  : "bg-brand-navy dark:bg-brand-power dark:text-brand-navy",
              )}
            >
              <Wallet className="h-4 w-4" />
              Submit payment
            </Link>
          </div>

          <MetricRow>
            <MetricCard compact label="Accounts" value={accountCount} icon={Home} accent="navy" />
            <MetricCard
              compact
              label="Outstanding"
              value={money(customerOutstanding)}
              icon={Wallet}
              accent={accent}
            />
            <MetricCard
              compact
              label="Payments"
              value={customerPayments.length}
              icon={FileText}
              accent="green"
            />
          </MetricRow>

          <section
            className={cn(
              "rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition-colors dark:border-border dark:shadow-none",
              hoverBorder,
            )}
          >
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3.5 sm:px-5">
              <h3 className="font-display text-sm font-semibold text-foreground">What you owe</h3>
              {customerOutstanding > 0 && (
                <Link
                  to={`/app/${kind}/my-payments${tenantSearch}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline dark:text-brand-water"
                >
                  Submit payment
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
            {openCustomerBills.length === 0 ? (
              <div className="px-4 py-5 text-sm text-muted-foreground sm:px-5">
                No open charges.
                {customerMonthlyFeeTotal > 0
                  ? ` Monthly fee ${money(customerMonthlyFeeTotal)}.`
                  : ""}
                {customerAccounts[0] ? ` Account ${customerAccounts[0].account_number}.` : ""}
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border/70">
                  {openCustomerBills.map((b) => {
                    const snap = (b.occupancy_snapshot ?? {}) as Record<string, unknown>;
                    const desc =
                      typeof snap.description === "string" && snap.description.trim()
                        ? snap.description.trim()
                        : snap.billing_mode === "adhoc_charge"
                          ? "Other charge"
                          : `${monthlyFeeLabel(kind)} · ${b.period_start} → ${b.period_end}`;
                    return (
                      <li
                        key={b.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{desc}</div>
                          <div className="text-muted-foreground">Due {b.due_date}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                            {money(b.balance)}
                          </div>
                          <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {(companyPhone || companyEmail) && (
                  <div className="border-t border-border/70 bg-sky-50/50 px-4 py-3 text-sm dark:bg-sky-500/10 sm:px-5">
                    <p className="font-medium text-foreground">Pay to {companyDisplayName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[companyPhone, companyEmail].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                )}
              </>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section
              className={cn(
                "rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition-colors dark:border-border dark:shadow-none sm:p-6",
                hoverBorder,
              )}
            >
              <div className="mb-5">
                <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                  Approved payments
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">Monthly total · last 6 months</p>
              </div>
              <BarChart
                points={customerPaymentPoints}
                height={200}
                color={chartColor}
                highlightColor={chartColor}
                formatValue={(n) => money(n)}
                emptyLabel="No approved payments yet"
                showValues={false}
              />
            </section>

            <section
              className={cn(
                "rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition-colors dark:border-border dark:shadow-none sm:p-6",
                hoverBorder,
              )}
            >
              <div className="mb-5">
                <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                  Payment status
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Pending, approved, rejected
                </p>
              </div>
              {customerStatusSlices.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No payment requests yet.
                </p>
              ) : (
                <DonutChart
                  slices={customerStatusSlices}
                  size={176}
                  thickness={26}
                  centerValue={formatCount(customerStatusTotal)}
                  centerLabel="Total"
                />
              )}
            </section>
          </div>

          <section
            className={cn(
              "rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition-colors dark:border-border dark:shadow-none",
              hoverBorder,
            )}
          >
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3.5 sm:px-5">
              <h3 className="font-display text-sm font-semibold text-foreground">Recent payments</h3>
              <Link
                to={`/app/${kind}/my-payments${tenantSearch}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline dark:text-brand-water"
              >
                View all
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {customerPayments.length === 0 ? (
              <div className="px-4 py-5 text-sm text-muted-foreground sm:px-5">No payments yet.</div>
            ) : (
              <ul className="divide-y divide-border/70">
                {customerPayments.slice(0, 5).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5"
                  >
                    <div className="min-w-0">
                      <div className="font-medium tabular-nums text-foreground">
                        {money(p.amount, p.currency)}
                      </div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {p.method.replaceAll("_", " ")}
                        {" · "}
                        {new Date(p.submitted_at).toLocaleString()}
                      </div>
                    </div>
                    <Badge tone={statusTone(p.status)}>{paymentStatusLabel(p.status)}</Badge>
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
