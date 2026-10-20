import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  ExternalLink,
  Gauge,
  Landmark,
  Search,
  Wallet,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { tenantSubdomainLabel, tenantWorkspaceUrl } from "@/lib/tenant";
import type { UtilityKind } from "@/pages/utility/shared";
import {
  AdminEmpty,
  AdminError,
  AdminKpi,
  AdminKpiRow,
  AdminPageHeader,
  AdminSectionTitle,
  AdminTableCard,
  adminTableHeadClass,
  statusBadgeTone,
  type WorkspaceTenant,
} from "./shared";

const PAGE_SIZE = 10;

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
  const [accountCounts, setAccountCounts] = useState<Record<string, number>>({});
  const [meterCounts, setMeterCounts] = useState<Record<string, number>>({});
  const [accountTotal, setAccountTotal] = useState(0);
  const [meterTotal, setMeterTotal] = useState(0);
  const [billCount, setBillCount] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

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
        .select("id, tenant_id")
        .eq("service_type", kind)
        .limit(500),
      supabase
        .from("meters")
        .select("id, tenant_id")
        .eq("service_type", kind)
        .limit(500),
      supabase
        .from("utility_bills")
        .select("id, balance")
        .eq("service_type", kind)
        .limit(500),
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

    const ac: Record<string, number> = {};
    for (const row of a.data ?? []) {
      ac[row.tenant_id] = (ac[row.tenant_id] ?? 0) + 1;
    }
    setAccountCounts(ac);
    setAccountTotal((a.data ?? []).length);

    const mc: Record<string, number> = {};
    for (const row of m.data ?? []) {
      mc[row.tenant_id] = (mc[row.tenant_id] ?? 0) + 1;
    }
    setMeterCounts(mc);
    setMeterTotal((m.data ?? []).length);

    const bills = b.data ?? [];
    setBillCount(bills.length);
    setOutstanding(bills.reduce((s, bil) => s + Number(bil.balance || 0), 0));
    setLoading(false);
  }, [kind, config.tenantType]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((t) => {
      const hay = `${t.name} ${t.slug} ${t.subdomain ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [workspaces, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [search, kind]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow={`Platform · ${config.label}`}
        title={config.label}
        description={`${config.label} company workspaces across the platform.`}
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
          value={loading ? "—" : accountTotal}
          icon={KindIcon}
          accent={config.accent}
        />
        <AdminKpi
          label="Meters"
          value={loading ? "—" : meterTotal}
          icon={Gauge}
          accent="amber"
        />
        <AdminKpi
          label="Outstanding"
          value={loading ? "—" : money(outstanding)}
          hint={`${billCount} bill(s)`}
          icon={Wallet}
          accent="green"
        />
      </AdminKpiRow>

      {error && <AdminError message={error} />}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workspace name, slug…"
          className="pl-9"
          aria-label="Search workspaces"
        />
      </div>

      <AdminTableCard>
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
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <AdminEmpty>No workspaces match “{search.trim()}”.</AdminEmpty>
                </td>
              </tr>
            ) : (
              pageRows.map((t) => {
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
                      {accountCounts[t.id] ?? 0}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      {meterCounts[t.id] ?? 0}
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
        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {rangeFrom}–{rangeTo} of {filtered.length} workspace
              {filtered.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <span className="min-w-[5.5rem] text-center text-xs font-medium text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </AdminTableCard>
    </div>
  );
}
