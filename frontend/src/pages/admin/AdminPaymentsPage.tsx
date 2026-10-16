import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  Building2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Droplets,
  Landmark,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { money, statusTone } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { tenantTypeLabel } from "@/lib/tenant";
import type {
  PaymentStatus,
  RentPayment,
  TenantType,
  UtilityPayment,
} from "@/types/database";
import {
  AdminEmpty,
  AdminError,
  AdminKpi,
  AdminKpiRow,
  AdminPageHeader,
  AdminSectionTitle,
  AdminTableCard,
  TENANT_EMBED,
  adminTableHeadClass,
  filterSelectClassName,
  statusBadgeTone,
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
  reference: string | null;
  status: PaymentStatus;
  submitted_at: string;
  tenants: TenantRef | null;
};

const OPS_TYPES: TenantType[] = [
  "landlord",
  "water_company",
  "electricity_company",
];

function typeIcon(type: string) {
  if (type === "water_company") return Droplets;
  if (type === "electricity_company") return Zap;
  return Building2;
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
        .in("tenant_type", OPS_TYPES)
        .order("created_at", { ascending: false }),
      supabase
        .from("rent_payments")
        .select(`*, ${TENANT_EMBED}`)
        .order("submitted_at", { ascending: false })
        .limit(150),
      supabase
        .from("utility_payments")
        .select(`*, ${TENANT_EMBED}`)
        .order("submitted_at", { ascending: false })
        .limit(150),
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
      reference: p.reference,
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
      reference: p.reference,
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

  const paymentsByTenant = useMemo(() => {
    const map: Record<string, { count: number; pending: number; volume: number }> =
      {};
    for (const p of rows) {
      const cur = map[p.tenant_id] ?? { count: 0, pending: 0, volume: 0 };
      cur.count += 1;
      if (p.status === "pending") cur.pending += 1;
      if (p.status === "paid") cur.volume += p.amount;
      map[p.tenant_id] = cur;
    }
    return map;
  }, [rows]);

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

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform · Payments"
        title="Payments"
        description="Workspaces that collect rent or utility payments, plus every submission."
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

      <AdminTableCard
        footer={
          !loading ? `${workspaces.length} landlord & utility workspace(s)` : undefined
        }
      >
        <AdminSectionTitle
          title="Payment workspaces"
          description="Landlord and utility companies that can receive payments"
        />
        <table className="w-full text-left text-sm">
          <thead className={adminTableHeadClass()}>
            <tr>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Payments</th>
              <th className="px-4 py-3 font-medium">Pending</th>
              <th className="px-4 py-3 font-medium">Paid volume</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <AdminEmpty>Loading…</AdminEmpty>
                </td>
              </tr>
            ) : workspaces.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <AdminEmpty>
                    No landlord or utility workspaces yet. Create them under Tenants.
                  </AdminEmpty>
                </td>
              </tr>
            ) : (
              workspaces.map((t) => {
                const Icon = typeIcon(t.tenant_type);
                const pay = paymentsByTenant[t.id] ?? {
                  count: 0,
                  pending: 0,
                  volume: 0,
                };
                return (
                  <tr
                    key={t.id}
                    className="border-t border-border/70 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/app/admin/tenants/${t.id}`}
                        className="font-medium text-foreground hover:text-brand-blue hover:underline"
                      >
                        {t.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {tenantTypeLabel(t.tenant_type as TenantType)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusBadgeTone(t.status)}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      {pay.count}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {pay.pending}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {money(pay.volume)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </AdminTableCard>

      <AdminTableCard footer={!loading ? `${filtered.length} payments` : undefined}>
        <AdminSectionTitle
          title="Payment submissions"
          description="Rent and utility payment records across workspaces"
        />
        <table className="w-full text-left text-sm">
          <thead className={adminTableHeadClass()}>
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Method</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <AdminEmpty>Loading…</AdminEmpty>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <AdminEmpty>
                    {workspaces.length > 0
                      ? "Workspaces exist, but no payment submissions yet."
                      : "No payments yet."}
                  </AdminEmpty>
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr
                  key={`${p.source}-${p.id}`}
                  className="border-t border-border/70 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(p.submitted_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 capitalize">{p.source}</td>
                  <td className="px-4 py-3">{p.tenants?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-medium tabular-nums">
                    {money(p.amount, p.currency)}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {p.method}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminTableCard>
    </div>
  );
}
