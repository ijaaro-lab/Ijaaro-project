import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Home,
  Landmark,
  Search,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { tenantSubdomainLabel, tenantWorkspaceUrl } from "@/lib/tenant";
import type { Property } from "@/types/database";
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

export function AdminPropertiesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceTenant[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

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
        .select("id, tenant_id, status, is_listed")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const err = tenantsRes.error || membershipsRes.error || propsRes.error;
    if (err) setError(err.message);

    setWorkspaces((tenantsRes.data as WorkspaceTenant[] | null) ?? []);
    const counts: Record<string, number> = {};
    for (const row of membershipsRes.data ?? []) {
      counts[row.tenant_id] = (counts[row.tenant_id] ?? 0) + 1;
    }
    setMemberCounts(counts);
    setProperties((propsRes.data as Property[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const propsByTenant = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of properties) {
      map[p.tenant_id] = (map[p.tenant_id] ?? 0) + 1;
    }
    return map;
  }, [properties]);

  const stats = useMemo(
    () => ({
      workspaces: workspaces.length,
      total: properties.length,
      listed: properties.filter((r) => r.is_listed).length,
      occupied: properties.filter((r) => r.status === "occupied").length,
      available: properties.filter((r) => r.status === "available").length,
    }),
    [workspaces.length, properties],
  );

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
  }, [search]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform · Properties"
        title="Properties"
        description="Landlord workspaces and property counts across the platform."
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
          value={loading ? "—" : `${stats.occupied} / ${stats.available}`}
          icon={stats.occupied > 0 ? Home : CheckCircle2}
          accent="amber"
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
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <AdminEmpty>No workspaces match “{search.trim()}”.</AdminEmpty>
                </td>
              </tr>
            ) : (
              pageRows.map((t) => {
                const key = t.subdomain || t.slug;
                const propCount = propsByTenant[t.id] ?? 0;
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
