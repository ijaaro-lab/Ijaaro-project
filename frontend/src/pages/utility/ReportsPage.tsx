import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CreditCard, Download, FileText, Receipt } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { BarChart, DonutChart } from "@/components/charts/SimpleCharts";
import { AppLoading } from "@/components/ui/app-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { money, paymentStatusLabel, statusTone } from "@/lib/format";
import { downloadTablePdf } from "@/lib/simplePdf";
import { supabase } from "@/lib/supabase";
import type { BillStatus, UtilityAccount, UtilityBill, UtilityPayment } from "@/types/database";
import {
  isSimplifiedFinance,
  KIND_LABEL,
  KIND_TENANT_TYPE,
  monthlyFeeLabel,
  type UtilityKind,
} from "./shared";

type RangeKey = "30d" | "90d" | "365d" | "all";

type AccountLite = Pick<UtilityAccount, "id" | "account_number"> & {
  properties?: {
    name: string | null;
    address_line: string | null;
  } | null;
};

type FinanceRow = {
  id: string;
  customerName: string;
  accountNumber: string;
  chargeType: string;
  dateLabel: string;
  statusKey: string;
  statusLabel: string;
  amount: number;
  isOther: boolean;
  isPaid: boolean;
};

function rangeStart(key: RangeKey): string | null {
  if (key === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const days = key === "30d" ? 30 : key === "90d" ? 90 : 365;
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString();
}

function rangeLabel(key: RangeKey): string {
  if (key === "30d") return "Last 30 days";
  if (key === "90d") return "Last 90 days";
  if (key === "365d") return "Last year";
  return "All time";
}

function formatReportDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function billChargeType(
  bill: UtilityBill,
  kind: UtilityKind,
  simplified: boolean,
): { label: string; isOther: boolean } {
  const snap = bill.occupancy_snapshot ?? {};
  const description =
    typeof snap.description === "string" ? snap.description.trim() : "";
  if (description) {
    const isOther = /other|adhoc|registration|extra/i.test(description);
    return { label: description, isOther };
  }
  if (snap.billing_mode === "adhoc_charge") {
    return { label: simplified ? "Other charge" : "Ad-hoc charge", isOther: true };
  }
  return { label: simplified ? monthlyFeeLabel(kind) : "Utility fee", isOther: false };
}

function billStatusLabel(status: string, simplifiedWater: boolean) {
  if (status === "paid") return simplifiedWater ? "Paid" : paymentStatusLabel("paid");
  if (status === "issued") return "Unpaid";
  if (status === "partial") return "Partial";
  if (status === "overdue") return "Overdue";
  return status.replaceAll("_", " ");
}

export function ReportsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];
  const simplifiedWater = isSimplifiedFinance(kind);
  const chartColor = kind === "water" ? "var(--color-brand-water)" : "var(--color-brand-power)";
  const companyName =
    activeMembership?.tenant.name || `${label} company`;

  const [range, setRange] = useState<RangeKey>("90d");
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [payments, setPayments] = useState<UtilityPayment[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
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
      const [billRes, payRes, accRes] = await Promise.all([
        billQ.order("created_at", { ascending: false }),
        payQ,
        supabase
          .from("utility_accounts")
          .select("id, account_number, properties(name, address_line)")
          .eq("tenant_id", tenantId),
      ]);
      if (cancelled) return;
      if (billRes.error || payRes.error || accRes.error) {
        setError(
          billRes.error?.message ||
            payRes.error?.message ||
            accRes.error?.message ||
            "Failed to load",
        );
      } else {
        setError(null);
        setBills(billRes.data ?? []);
        setPayments(payRes.data ?? []);
        setAccounts((accRes.data as unknown as AccountLite[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, matchesKind, isStaff, range]);

  const accountById = useMemo(() => {
    const map = new Map<string, AccountLite>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  const financeRows = useMemo((): FinanceRow[] => {
    return bills
      .filter((b) => b.status !== "cancelled")
      .map((b) => {
        const account = accountById.get(b.utility_account_id);
        const customerName =
          account?.properties?.name?.trim() ||
          account?.properties?.address_line?.trim() ||
          "Customer";
        const { label: chargeType, isOther } = billChargeType(b, kind, simplifiedWater);
        return {
          id: b.id,
          customerName,
          accountNumber: account?.account_number ?? "—",
          chargeType,
          dateLabel: formatReportDate(b.created_at),
          statusKey: b.status,
          statusLabel: billStatusLabel(b.status, simplifiedWater),
          amount: Number(b.total_amount),
          isOther,
          isPaid: b.status === "paid" || Number(b.balance) <= 0,
        };
      });
  }, [bills, accountById, kind, simplifiedWater]);

  const totals = useMemo(() => {
    const totalBilled = bills.reduce((s, b) => s + Number(b.total_amount), 0);
    const totalCollected = bills.reduce((s, b) => s + Number(b.amount_paid), 0);
    const totalOutstanding = bills.reduce((s, b) => s + Number(b.balance), 0);
    const overdueCount = bills.filter((b) => b.status === "overdue").length;
    const paid = payments.filter((p) => p.status === "paid");
    const rejected = payments.filter((p) => p.status === "rejected");
    const pending = payments.filter((p) => p.status === "pending");
    const waterFeeCharged = financeRows
      .filter((r) => !r.isOther)
      .reduce((s, r) => s + r.amount, 0);
    const otherCharged = financeRows
      .filter((r) => r.isOther)
      .reduce((s, r) => s + r.amount, 0);
    return {
      totalBilled,
      totalCollected,
      totalOutstanding,
      overdueCount,
      approvedAmount: paid.reduce((s, p) => s + Number(p.amount), 0),
      rejectedCount: rejected.length,
      pendingCount: pending.length,
      waterFeeCharged,
      otherCharged,
    };
  }, [bills, payments, financeRows]);

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
        label: new Date(key + "-01T12:00:00").toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        }),
        value: v.billed,
        collected: v.collected,
      }));
  }, [bills]);

  const periodTitle = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, []);

  const downloadReport = () => {
    const generated = new Date().toLocaleString();
    const slug = (activeMembership?.tenant.slug || "report").replace(/[^\w-]+/g, "-");
    const feeLabel = simplifiedWater ? monthlyFeeLabel(kind) : "Utility fee";

    downloadTablePdf({
      fileName: `${slug}-${kind}-finance-${range}.pdf`,
      title: `Finance Status Report - ${periodTitle}`,
      subtitle: companyName,
      meta: [
        `Period: ${rangeLabel(range)}`,
        `Collected: ${money(totals.totalCollected)} | ${feeLabel}: ${money(totals.waterFeeCharged)} | Other: ${money(totals.otherCharged)} | Outstanding: ${money(totals.totalOutstanding)}`,
        `Generated: ${generated}`,
      ],
      tables: [
        {
          title: "Charges",
          headers: ["Customer Name", "Account No.", "Type", "Date", "Status", "Amount"],
          colWeights: [1.8, 1.2, 1.2, 1.1, 0.9, 0.9],
          rows:
            financeRows.length > 0
              ? financeRows.map((r) => [
                  r.customerName,
                  r.accountNumber,
                  r.chargeType,
                  r.dateLabel,
                  r.statusLabel,
                  money(r.amount),
                ])
              : [["No charges in this period", "—", "—", "—", "—", "—"]],
        },
      ],
    });
  };

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
  if (loading) {
    return <AppLoading message="Loading reports…" fullScreen={false} />;
  }

  const feeLabel = simplifiedWater ? monthlyFeeLabel(kind) : "Utility fee";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">
            {simplifiedWater ? "Reports" : `${label} reports`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {simplifiedWater
              ? `Collections, outstanding balances, and payment outcomes for this ${label.toLowerCase()} company.`
              : "Collections, arrears, and verification outcomes for this company."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            aria-label="Report period"
          >
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="365d">Last year</option>
            <option value="all">All time</option>
          </select>
          <Button type="button" variant="secondary" onClick={downloadReport}>
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={simplifiedWater ? "Total charged" : "Total billed"}
          value={money(totals.totalBilled)}
          icon={FileText}
          accent="navy"
        />
        <MetricCard
          label={simplifiedWater ? "Collected" : "Collected (bill paid)"}
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

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {simplifiedWater ? "Charges by month" : "Billing totals by month"}
          </h3>
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
            emptyLabel={simplifiedWater ? "No charges in this period" : "No bills in this period"}
            showValues={false}
          />
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

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-display text-lg font-bold text-foreground">
            Finance Status Report - {periodTitle}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{companyName}</p>
          <p className="mt-2 text-sm text-foreground">
            <span className="text-muted-foreground">Collected:</span>{" "}
            <span className="font-semibold tabular-nums">{money(totals.totalCollected)}</span>
            <span className="mx-2 text-muted-foreground">|</span>
            <span className="text-muted-foreground">{feeLabel}:</span>{" "}
            <span className="font-semibold tabular-nums">{money(totals.waterFeeCharged)}</span>
            <span className="mx-2 text-muted-foreground">|</span>
            <span className="text-muted-foreground">Other:</span>{" "}
            <span className="font-semibold tabular-nums">{money(totals.otherCharged)}</span>
            <span className="mx-2 text-muted-foreground">|</span>
            <span className="text-muted-foreground">Outstanding:</span>{" "}
            <span className="font-semibold tabular-nums">{money(totals.totalOutstanding)}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reference date: {formatReportDate(new Date().toISOString())} · {rangeLabel(range)}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead
              className="border-b border-border text-xs uppercase tracking-wide text-foreground"
              style={{
                background: `color-mix(in srgb, ${chartColor} 18%, transparent)`,
              }}
            >
              <tr>
                <th className="px-5 py-3 font-semibold">Customer Name</th>
                <th className="px-5 py-3 font-semibold">Account No.</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {financeRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-muted-foreground">
                    No charges in this period.
                  </td>
                </tr>
              ) : (
                financeRows.map((r, i) => (
                  <tr
                    key={r.id}
                    className={i % 2 === 1 ? "bg-muted/30" : undefined}
                  >
                    <td className="px-5 py-3 font-medium text-foreground">{r.customerName}</td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {r.accountNumber}
                    </td>
                    <td className="px-5 py-3 text-foreground">{r.chargeType}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.dateLabel}</td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(r.statusKey as BillStatus)}>{r.statusLabel}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-foreground">
                      {money(r.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
