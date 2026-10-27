import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ClipboardList, Eye, Plus, UserRound } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { MetricCard, MetricRow } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { Property } from "@/types/database";

export function StaffDashboard() {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const [properties, setProperties] = useState<Property[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("properties")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false });
    if (err) {
      setError(err.message);
      setProperties([]);
    } else {
      setProperties(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  if (!tenantId || activeMembership?.tenant.tenant_type !== "landlord") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a landlord workspace membership to manage properties.
      </div>
    );
  }

  if (activeMembership.role !== "landlord_staff") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Staff dashboard is available for landlord staff memberships only.
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  const published = properties.filter((p) => p.is_listed).length;
  const available = properties.filter((p) => p.status === "available").length;
  const mine = user ? properties.filter((p) => p.owner_id === user.id).length : 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-green">
          Staff · Today
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Property workspace
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Create, edit, and publish listings you are authorized to manage.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      <MetricRow>
        <MetricCard compact label="Properties" value={properties.length} icon={Building2} accent="navy" />
        <MetricCard compact label="Available" value={available} icon={ClipboardList} accent="green" />
        <MetricCard compact label="Published" value={published} icon={Eye} accent="water" />
        <MetricCard compact label="Yours" value={mine} icon={UserRound} accent="warning" />
      </MetricRow>

      <section className="rounded-2xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <h3 className="font-display text-base font-semibold text-foreground">Recent properties</h3>
          <div className="flex items-center gap-3">
            <Link
              to="/app/landlord/properties/new"
              className="inline-flex items-center gap-1 text-sm text-brand-blue hover:underline"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Create property
            </Link>
            <Link to="/app/landlord/properties" className="text-sm text-brand-blue hover:underline">
              View all
            </Link>
          </div>
        </div>
        {properties.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">No properties yet.</p>
            <Link to="/app/landlord/properties/new" className="mt-3 inline-block">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                Create property
              </Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {properties.slice(0, 8).map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    to={`/app/landlord/properties/${p.id}`}
                    className="font-medium hover:underline"
                  >
                    {p.name || p.address_line}
                  </Link>
                  <div className="truncate text-muted-foreground">
                    {money(p.rent_amount, p.currency)} · {p.district || p.city || "—"}
                    {user && p.owner_id === user.id ? " · Yours" : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  <Badge tone={p.is_listed ? "success" : "neutral"}>
                    {p.is_listed ? "Published" : "Unpublished"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
