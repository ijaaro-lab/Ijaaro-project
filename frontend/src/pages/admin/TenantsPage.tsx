import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, ExternalLink, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Tenant, TenantStatus, TenantType } from "@/types/database";
import {
  tenantSubdomainLabel,
  tenantTypeLabel,
  tenantWorkspaceUrl,
} from "@/lib/tenant";
import { CreateTenantWizard } from "@/components/admin/CreateTenantWizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const statusTone: Record<
  TenantStatus,
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  disabled: "neutral",
};

export function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | TenantType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TenantStatus>("all");
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [{ data, error: err }, { data: memberships }] = await Promise.all([
      supabase.from("tenants").select("*").order("created_at", { ascending: false }),
      supabase.from("tenant_memberships").select("tenant_id").eq("status", "active"),
    ]);
    if (err) setError(err.message);
    setTenants(data ?? []);
    const counts: Record<string, number> = {};
    for (const row of memberships ?? []) {
      counts[row.tenant_id] = (counts[row.tenant_id] ?? 0) + 1;
    }
    setMemberCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const setStatus = async (tenantId: string, status: TenantStatus) => {
    setError(null);
    const { error: err } = await supabase.rpc("set_tenant_status", {
      p_tenant_id: tenantId,
      p_status: status,
    });
    if (err) {
      setError(err.message);
      return;
    }
    await load();
  };

  const copyWorkspace = async (tenantSlug: string) => {
    await navigator.clipboard.writeText(tenantWorkspaceUrl(tenantSlug));
    setCopiedSlug(tenantSlug);
    window.setTimeout(() => setCopiedSlug(null), 1800);
  };

  const filtered = tenants.filter((t) => {
    if (t.tenant_type === "platform") return false;
    if (typeFilter !== "all" && t.tenant_type !== typeFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Tenants</h2>
          <p className="text-sm text-muted-foreground">
            Real workspaces from the database — create, open, or suspend.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={showCreate ? "outline" : "primary"}
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? (
            <>
              <X className="h-4 w-4" />
              Close
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Create tenant
            </>
          )}
        </Button>
      </div>

      {showCreate && (
        <CreateTenantWizard
          compact
          onCreated={() => {
            setShowCreate(false);
            void load();
          }}
        />
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Select
          className="h-9 w-auto min-w-[9rem]"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | TenantType)}
        >
          <option value="all">All types</option>
          <option value="landlord">Landlord</option>
          <option value="water_company">Water</option>
          <option value="electricity_company">Electricity</option>
        </Select>
        <Select
          className="h-9 w-auto min-w-[9rem]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | TenantStatus)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="disabled">Disabled</option>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Subdomain</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={6}>
                  No tenants yet. Use Create tenant to add one.
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                const key = t.subdomain || t.slug;
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-foreground hover:text-brand-blue"
                        to={`/app/admin/tenants/${t.id}`}
                      >
                        {t.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tenantTypeLabel(t.tenant_type)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {memberCounts[t.id] ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-[11px] text-muted-foreground">
                        {tenantSubdomainLabel(key)}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void copyWorkspace(key)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedSlug === key ? "Copied" : "URL"}
                        </Button>
                        <a
                          href={tenantWorkspaceUrl(key)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-blue hover:bg-muted"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </a>
                        {t.status !== "active" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void setStatus(t.id, "active")}
                          >
                            Activate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void setStatus(t.id, "suspended")}
                          >
                            Suspend
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            {filtered.length} tenant{filtered.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}
