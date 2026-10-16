import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Droplets,
  ExternalLink,
  Gauge,
  Landmark,
  Wallet,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { money, statusTone } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { tenantSubdomainLabel, tenantWorkspaceUrl } from "@/lib/tenant";
import type {
  Meter,
  UtilityAccount,
  UtilityAccountStatus,
  UtilityBill,
} from "@/types/database";
import type { UtilityKind } from "@/pages/utility/shared";
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

type AccountRow = UtilityAccount & { tenants: TenantRef | null };
type MeterRow = Meter & { tenants: TenantRef | null };
type BillRow = UtilityBill & { tenants: TenantRef | null };

const KIND_CONFIG = {
  water: {
    label: "Water",
    tenantType: "water_company" as const,
    icon: Droplets,
    accent: "water" as const,
  },
  electricity: {
    label: "Electricity",
    tenantType: "electricity_company" as const,
    icon: Zap,
    accent: "power" as const,
  },
};

export function AdminUtilityOpsPage({ kind }: { kind: UtilityKind }) {
  const config = KIND_CONFIG[kind];
  const KindIcon = config.icon;
  const [workspaces, setWorkspaces] = useState<WorkspaceTenant[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [meters, setMeters] = useState<MeterRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | UtilityAccountStatus>(
    "all",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [tenantsRes, membershipsRes, a, m, b] = await Promise.all([
      supabase
        .from("tenants")
        .select("id, name, slug, subdomain, tenant_type, status, created_at")
        .eq("tenant_type", config.tenantType)
        .order("created_at", { ascending: false }),
      supabase
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("status", "active"),
      supabase
        .from("utility_accounts")
        .select(`*, ${TENANT_EMBED}`)
        .eq("service_type", kind)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("meters")
        .select(`*, ${TENANT_EMBED}`)
        .eq("service_type", kind)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("utility_bills")
        .select(`*, ${TENANT_EMBED}`)
        .eq("service_type", kind)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const err =
      tenantsRes.error ||
      membershipsRes.error ||
      a.error ||
      m.error ||
      b.error;
    if (err) setError(err.message);

    setWorkspaces((tenantsRes.data as WorkspaceTenant[] | null) ?? []);
    const counts: Record<string, number> = {};
    for (const row of membershipsRes.data ?? []) {
      counts[row.tenant_id] = (counts[row.tenant_id] ?? 0) + 1;
    }
    setMemberCounts(counts);
    setAccounts((a.data as AccountRow[] | null) ?? []);
    setMeters((m.data as MeterRow[] | null) ?? []);
    setBills((b.data as BillRow[] | null) ?? []);
    setLoading(false);
  }, [kind, config.tenantType]);

  useEffect(() => {
    void load();
  }, [load]);

  const accountsByTenant = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of accounts) {
      map[a.tenant_id] = (map[a.tenant_id] ?? 0) + 1;
    }
    return map;
  }, [accounts]);

  const metersByTenant = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of meters) {
      map[m.tenant_id] = (map[m.tenant_id] ?? 0) + 1;
    }
    return map;
  }, [meters]);

  const filteredAccounts = useMemo(
    () =>
      statusFilter === "all"
        ? accounts
        : accounts.filter((r) => r.status === statusFilter),
    [accounts, statusFilter],
  );

  const outstanding = useMemo(
    () => bills.reduce((s, bil) => s + Number(bil.balance || 0), 0),
    [bills],
  );

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow={`Platform · ${config.label}`}
        title={config.label}
        description={`${config.label} company workspaces, customer accounts, meters, and bills.`}
        actions={
          <Select
            className={filterSelectClassName()}
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | UtilityAccountStatus)
            }
          >
            <option value="all">All account statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="closed">Closed</option>
          </Select>
        }
      />

      <AdminKpiRow>
        <AdminKpi
          label={`${config.label} companies`}
          value={loading ? "—" : workspaces.length}
          icon={Landmark}
          accent="navy"
        />
        <AdminKpi
          label="Accounts"
          value={loading ? "—" : filteredAccounts.length}
          icon={KindIcon}
          accent={config.accent}
        />
        <AdminKpi
          label="Meters"
          value={loading ? "—" : meters.length}
          icon={Gauge}
          accent="amber"
        />
        <AdminKpi
          label="Outstanding"
          value={loading ? "—" : money(outstanding)}
          hint={`${bills.length} bill(s)`}
          icon={Wallet}
          accent="green"
        />
      </AdminKpiRow>

      {error && <AdminError message={error} />}

      <AdminTableCard
        footer={
          !loading
            ? `${workspaces.length} ${config.label.toLowerCase()} company workspace(s)`
            : undefined
        }
      >
        <AdminSectionTitle
          title={`${config.label} company workspaces`}
          description="Utility tenants provisioned on the platform"
        />
        <table className="w-full text-left text-sm">
          <thead className={adminTableHeadClass()}>
            <tr>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Accounts</th>
              <th className="px-4 py-3 font-medium">Meters</th>
              <th className="px-4 py-3 font-medium">Subdomain</th>
              <th className="px-4 py-3 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <AdminEmpty>Loading…</AdminEmpty>
                </td>
              </tr>
            ) : workspaces.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <AdminEmpty>
                    No {config.label.toLowerCase()} company workspaces yet. Create
                    one under Tenants.
                  </AdminEmpty>
                </td>
              </tr>
            ) : (
              workspaces.map((t) => {
                const key = t.subdomain || t.slug;
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
                      <Badge tone={statusBadgeTone(t.status)}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {memberCounts[t.id] ?? 0}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      {accountsByTenant[t.id] ?? 0}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      {metersByTenant[t.id] ?? 0}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {tenantSubdomainLabel(key)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={tenantWorkspaceUrl(key)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
                      >
                        Workspace
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </AdminTableCard>

      <AdminTableCard
        footer={
          !loading
            ? `${filteredAccounts.length} ${config.label.toLowerCase()} accounts`
            : undefined
        }
      >
        <AdminSectionTitle
          title="Customer accounts"
          description="Accounts opened by these utility companies"
        />
        <table className="w-full text-left text-sm">
          <thead className={adminTableHeadClass()}>
            <tr>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Unit price</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>
                  <AdminEmpty>Loading…</AdminEmpty>
                </td>
              </tr>
            ) : filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <AdminEmpty>
                    {workspaces.length > 0
                      ? `${config.label} companies exist, but no customer accounts yet.`
                      : `No ${config.label.toLowerCase()} accounts yet.`}
                  </AdminEmpty>
                </td>
              </tr>
            ) : (
              filteredAccounts.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-border/70 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">{a.account_number}</td>
                  <td className="px-4 py-3">
                    {a.tenants ? (
                      <Link
                        to={`/app/admin/tenants/${a.tenant_id}`}
                        className="text-brand-blue hover:underline"
                      >
                        {a.tenants.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{money(a.unit_price)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminTableCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminTableCard footer={!loading ? `${meters.length} meters` : undefined}>
          <AdminSectionTitle title="Meters" />
          <table className="w-full text-left text-sm">
            <thead className={adminTableHeadClass()}>
              <tr>
                <th className="px-4 py-3 font-medium">Meter #</th>
                <th className="px-4 py-3 font-medium">Workspace</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3}>
                    <AdminEmpty>Loading…</AdminEmpty>
                  </td>
                </tr>
              ) : meters.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <AdminEmpty>No meters yet.</AdminEmpty>
                  </td>
                </tr>
              ) : (
                meters.slice(0, 20).map((m) => (
                  <tr
                    key={m.id}
                    className="border-t border-border/70 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">{m.meter_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {m.tenants?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </AdminTableCard>

        <AdminTableCard footer={!loading ? `${bills.length} recent bills` : undefined}>
          <AdminSectionTitle title="Recent bills" />
          <table className="w-full text-left text-sm">
            <thead className={adminTableHeadClass()}>
              <tr>
                <th className="px-4 py-3 font-medium">Workspace</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>
                    <AdminEmpty>Loading…</AdminEmpty>
                  </td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <AdminEmpty>No bills yet.</AdminEmpty>
                  </td>
                </tr>
              ) : (
                bills.slice(0, 20).map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-border/70 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.tenants?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {money(b.total_amount)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{money(b.balance)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </AdminTableCard>
      </div>
    </div>
  );
}
