import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  Landmark,
} from "lucide-react";
import { BarChart, DonutChart } from "@/components/charts/SimpleCharts";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { money } from "@/lib/format";
import { downloadTablePdf } from "@/lib/simplePdf";
import { supabase } from "@/lib/supabase";
import type {
  PaymentStatus,
  RentPayment,
  UtilityPayment,
} from "@/types/database";
import {
  AdminError,
  AdminKpi,
  AdminKpiRow,
  AdminPageHeader,
  TENANT_EMBED,
  filterSelectClassName,
  type TenantRef,
  type WorkspaceTenant,
} from "./shared";

type Source = "all" | "rent" | "utility";

type PaymentRow = {
  id: string;
  source: "rent" | "utility";
  tenant_id: string;
  amount: number;
  currency: string;
  method: string;
  status: PaymentStatus;
  submitted_at: string;
  tenants: TenantRef | null;
};

const STATUS_COLORS: Record<string, string> = {
  paid: "#1fa85a",
  pending: "#f59e0b",
  processing: "#2b8cff",
  rejected: "#ef4444",
  failed: "#dc2626",
  cancelled: "#94a3b8",
  refunded: "#8b5cf6",
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

export function AdminPaymentsPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceTenant[]>([]);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PaymentStatus>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [tenantsRes, rent, utility] = await Promise.all([
      supabase
        .from("tenants")
        .select("id, name, slug, subdomain, tenant_type, status, created_at")
        .in("tenant_type", ["landlord", "water_company", "electricity_company"])
        .order("created_at", { ascending: false }),
      supabase
        .from("rent_payments")
        .select(`*, ${TENANT_EMBED}`)
        .order("submitted_at", { ascending: false })
        .limit(300),
      supabase
        .from("utility_payments")
        .select(`*, ${TENANT_EMBED}`)
        .order("submitted_at", { ascending: false })
        .limit(300),
    ]);

    const err = tenantsRes.error || rent.error || utility.error;
    if (err) setError(err.message);

    setWorkspaces((tenantsRes.data as WorkspaceTenant[] | null) ?? []);

    const rentRows: PaymentRow[] = (
      (rent.data as (RentPayment & { tenants: TenantRef | null })[] | null) ?? []
    ).map((p) => ({
      id: p.id,
      source: "rent" as const,
      tenant_id: p.tenant_id,
      amount: Number(p.amount),
      currency: p.currency,
      method: p.method,
      status: p.status,
      submitted_at: p.submitted_at,
      tenants: p.tenants,
    }));
    const utilRows: PaymentRow[] = (
      (utility.data as
        | (UtilityPayment & { tenants: TenantRef | null })[]
        | null) ?? []
    ).map((p) => ({
      id: p.id,
      source: "utility" as const,
      tenant_id: p.tenant_id,
      amount: Number(p.amount),
      currency: p.currency,
      method: p.method,
      status: p.status,
      submitted_at: p.submitted_at,
      tenants: p.tenants,
    }));

    setRows(
      [...rentRows, ...utilRows].sort(
        (a, b) =>
          new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (source !== "all" && r.source !== source) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, source, statusFilter]);

  const stats = useMemo(() => {
    const pending = filtered.filter((r) => r.status === "pending").length;
    const paid = filtered.filter((r) => r.status === "paid");
    const volume = paid.reduce((s, r) => s + r.amount, 0);
    return {
      workspaces: workspaces.length,
      total: filtered.length,
      pending,
      paid: paid.length,
      volume,
    };
  }, [filtered, workspaces.length]);

  const volumeBars = useMemo(() => {
    const now = new Date();
    const keys: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(monthKey(d));
    }
    const map: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const p of filtered) {
      if (p.status !== "paid") continue;
      const k = monthKey(new Date(p.submitted_at));
      if (k in map) map[k] += p.amount;
    }
    return keys.map((k) => ({
      key: k,
      label: monthLabel(k),
      value: Math.round(map[k] * 100) / 100,
    }));
  }, [filtered]);

  const statusSlices = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of filtered) {
      counts[p.status] = (counts[p.status] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([key, value]) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        value,
        color: STATUS_COLORS[key] ?? "#64748b",
      }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const sourceBreakdown = useMemo(() => {
    const rent = filtered.filter((r) => r.source === "rent");
    const utility = filtered.filter((r) => r.source === "utility");
    const rentPaid = rent
      .filter((r) => r.status === "paid")
      .reduce((s, r) => s + r.amount, 0);
    const utilPaid = utility
      .filter((r) => r.status === "paid")
      .reduce((s, r) => s + r.amount, 0);
    return {
      rentCount: rent.length,
      utilityCount: utility.length,
      rentPaid,
      utilPaid,
    };
  }, [filtered]);

  const downloadPdf = () => {
    const generated = new Date().toLocaleString();
    const statusRows = statusSlices.map((s) => [
      s.label,
      String(s.value),
      stats.total > 0 ? `${Math.round((s.value / stats.total) * 100)}%` : "0%",
    ]);
    const monthRows = volumeBars.map((b) => [b.label, money(b.value)]);

    downloadTablePdf({
      fileName: `ijaaro-payments-report-${new Date().toISOString().slice(0, 10)}`,
      title: "IJAARO Payments Report",
      subtitle: "Platform payment summary",
      meta: [
        `Generated: ${generated}`,
        `Filter: ${source === "all" ? "All sources" : source} · ${statusFilter === "all" ? "All statuses" : statusFilter}`,
        `Collecting workspaces: ${stats.workspaces}`,
        `Total payments: ${stats.total} · Pending: ${stats.pending} · Paid: ${stats.paid}`,
        `Paid volume: ${money(stats.volume)}`,
        `Rent paid: ${money(sourceBreakdown.rentPaid)} (${sourceBreakdown.rentCount} submissions)`,
        `Utility paid: ${money(sourceBreakdown.utilPaid)} (${sourceBreakdown.utilityCount} submissions)`,
      ],
      tables: [
        {
          title: "Status distribution",
          headers: ["Status", "Count", "Share"],
          rows: statusRows.length > 0 ? statusRows : [["—", "0", "0%"]],
          colWeights: [2, 1, 1],
        },
        {
          title: "Paid volume by month",
          headers: ["Month", "Paid volume"],
          rows: monthRows,
          colWeights: [1, 2],
        },
        {
          title: "Source mix",
          headers: ["Source", "Submissions", "Paid volume"],
          rows: [
            ["Rent", String(sourceBreakdown.rentCount), money(sourceBreakdown.rentPaid)],
            [
              "Utility",
              String(sourceBreakdown.utilityCount),
              money(sourceBreakdown.utilPaid),
            ],
          ],
          colWeights: [2, 1, 2],
        },
      ],
    });
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform · Payments"
        title="Payments"
        description="Platform payment overview — volume and status at a glance."
        actions={
          <>
            <Select
              className={filterSelectClassName()}
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
            >
              <option value="all">All sources</option>
              <option value="rent">Rent</option>
              <option value="utility">Utility</option>
            </Select>
            <Select
              className={filterSelectClassName()}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | PaymentStatus)
              }
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="paid">Paid</option>
              <option value="rejected">Rejected</option>
              <option value="failed">Failed</option>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={downloadPdf}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </>
        }
      />

      <AdminKpiRow>
        <AdminKpi
          label="Collecting workspaces"
          value={loading ? "—" : stats.workspaces}
          icon={Landmark}
          accent="navy"
        />
        <AdminKpi
          label="Payments"
          value={loading ? "—" : stats.total}
          icon={CreditCard}
          accent="water"
        />
        <AdminKpi
          label="Pending review"
          value={loading ? "—" : stats.pending}
          icon={Clock3}
          accent="amber"
        />
        <AdminKpi
          label="Paid volume"
          value={loading ? "—" : money(stats.volume)}
          hint={`${stats.paid} paid`}
          icon={stats.paid > 0 ? CircleDollarSign : Banknote}
          accent="green"
        />
      </AdminKpiRow>

      {error && <AdminError message={error} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none sm:p-8">
          <h3 className="font-display text-lg font-semibold text-foreground sm:text-xl">
            Paid volume
          </h3>
          <p className="mb-6 text-sm text-muted-foreground">
            Last 6 months · confirmed paid amounts
          </p>
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : (
            <BarChart
              points={volumeBars}
              height={280}
              color="var(--color-brand-water)"
              highlightColor="#1fa85a"
              formatValue={(n) => money(n)}
              emptyLabel="No paid volume yet"
            />
          )}
        </section>

        <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none sm:p-8">
          <h3 className="font-display text-lg font-semibold text-foreground sm:text-xl">
            Status mix
          </h3>
          <p className="mb-6 text-sm text-muted-foreground">
            Share of payment submissions by status
          </p>
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : statusSlices.length === 0 ? (
            <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
              No payments yet
            </p>
          ) : (
            <div className="flex min-h-[280px] items-center justify-center">
              <DonutChart
                slices={statusSlices}
                size={240}
                thickness={32}
                centerValue={stats.total}
                centerLabel="payments"
                showCounts
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
