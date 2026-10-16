import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Home,
  Landmark,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { money, statusTone } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { tenantSubdomainLabel, tenantWorkspaceUrl } from "@/lib/tenant";
import type { Property, PropertyStatus } from "@/types/database";
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

type PropertyRow = Property & { tenants: TenantRef | null };

export function AdminPropertiesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceTenant[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | PropertyStatus>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [tenantsRes, membershipsRes, propsRes] = await Promise.all([
      supabase
        .from("tenants")
        .select("id, name, slug, subdomain, tenant_type, status, created_at")
        .eq("tenant_type", "landlord")
        .order("created_at", { ascending: false }),
      supabase
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("status", "active"),
      supabase
        .from("properties")
        .select(`*, ${TENANT_EMBED}`)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const err = tenantsRes.error || membershipsRes.error || propsRes.error;
    if (err) setError(err.message);

    setWorkspaces((tenantsRes.data as WorkspaceTenant[] | null) ?? []);
    const counts: Record<string, number> = {};
    for (const row of membershipsRes.data ?? []) {
      counts[row.tenant_id] = (counts[row.tenant_id] ?? 0) + 1;
    }
    setMemberCounts(counts);
    setRows((propsRes.data as PropertyRow[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const propsByTenant = useMemo(() => {
    const map: Record<string, PropertyRow[]> = {};
    for (const p of rows) {
      (map[p.tenant_id] ??= []).push(p);
    }
    return map;
  }, [rows]);

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? rows
        : rows.filter((r) => r.status === statusFilter),
    [rows, statusFilter],
  );

  const stats = useMemo(
    () => ({
      workspaces: workspaces.length,
      total: filtered.length,
      listed: filtered.filter((r) => r.is_listed).length,
      occupied: filtered.filter((r) => r.status === "occupied").length,
      available: filtered.filter((r) => r.status === "available").length,
    }),
    [workspaces.length, filtered],
  );

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform · Properties"
        title="Properties"
        description="Landlord workspaces and their property inventory across the platform."
        actions={
          <Select
            className={filterSelectClassName()}
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | PropertyStatus)
            }
          >
            <option value="all">All property statuses</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="vacant">Vacant</option>
          </Select>
        }
      />

      <AdminKpiRow>
        <AdminKpi
          label="Landlord workspaces"
          value={loading ? "—" : stats.workspaces}
          icon={Landmark}
          accent="navy"
        />
        <AdminKpi
          label="Properties"
          value={loading ? "—" : stats.total}
          icon={Building2}
          accent="water"
        />
        <AdminKpi
          label="Listed"
          value={loading ? "—" : stats.listed}
          icon={Tag}
          accent="green"
        />
        <AdminKpi
          label="Occupied / Available"
          value={
            loading ? "—" : `${stats.occupied} / ${stats.available}`
          }
          icon={stats.occupied > 0 ? Home : CheckCircle2}
          accent="amber"
        />
      </AdminKpiRow>

      {error && <AdminError message={error} />}

      <AdminTableCard
        footer={
          !loading ? `${workspaces.length} landlord workspace(s)` : undefined
        }
      >
        <AdminSectionTitle
          title="Landlord workspaces"
          description="Tenants that can create and manage properties"
        />
        <table className="w-full text-left text-sm">
          <thead className={adminTableHeadClass()}>
            <tr>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Properties</th>
              <th className="px-4 py-3 font-medium">Subdomain</th>
              <th className="px-4 py-3 font-medium">Open</th>
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
                    No landlord workspaces yet. Create one under Tenants.
                  </AdminEmpty>
                </td>
              </tr>
            ) : (
              workspaces.map((t) => {
                const key = t.subdomain || t.slug;
                const propCount = propsByTenant[t.id]?.length ?? 0;
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
                      {propCount}
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

      <AdminTableCard footer={!loading ? `${filtered.length} properties` : undefined}>
        <AdminSectionTitle
          title="Property inventory"
          description="Units created inside landlord workspaces"
        />
        <table className="w-full text-left text-sm">
          <thead className={adminTableHeadClass()}>
            <tr>
              <th className="px-4 py-3 font-medium">Property</th>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Rent</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>
                  <AdminEmpty>Loading…</AdminEmpty>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <AdminEmpty>
                    {workspaces.length > 0
                      ? "Landlord workspaces exist, but none have added properties yet."
                      : "No properties yet. Landlord workspaces create them."}
                  </AdminEmpty>
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-border/70 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {p.name || p.address_line}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[p.district, p.city].filter(Boolean).join(", ") ||
                        p.address_line}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {p.tenants ? (
                      <Link
                        to={`/app/admin/tenants/${p.tenant_id}`}
                        className="font-medium text-brand-blue hover:underline"
                      >
                        {p.tenants.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {p.property_type}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {money(p.rent_amount, p.currency)}
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
