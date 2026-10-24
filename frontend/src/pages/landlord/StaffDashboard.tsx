import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ClipboardList, Eye, EyeOff, Plus, UserRound } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { Property } from "@/types/database";

export function StaffDashboard() {
  const { activeMembership, user, profile } = useAuth();
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

  const published = properties.filter((p) => p.is_listed).length;
  const unpublished = properties.length - published;
  const available = properties.filter((p) => p.status === "available").length;
  const mine = user
    ? properties.filter((p) => p.owner_id === user.id).length
    : 0;
  const displayName = profile?.full_name || profile?.email || "there";
  const workspaceName = activeMembership.tenant.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Property management</p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Welcome, {displayName}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Manage listings for <span className="font-medium text-foreground">{workspaceName}</span>.
            You can create, update, and publish properties. Property and photo deletion require a
            landlord admin.
          </p>
        </div>
        <Link to="/app/landlord/properties/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden />
            Create property
          </Button>
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground" aria-live="polite">
          Loading dashboard…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="All properties" value={properties.length} icon={Building2} accent="navy" />
            <MetricCard label="Published" value={published} icon={Eye} accent="green" />
            <MetricCard label="Unpublished" value={unpublished} icon={EyeOff} accent="warning" />
            <MetricCard
              label="Created by you"
              value={mine}
              icon={UserRound}
              accent="water"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            “Created by you” uses the property creator attribution field (<code className="text-[11px]">owner_id</code>)
            set when the listing was created.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Available status
              </div>
              <div className="mt-1 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-lg font-semibold tabular-nums">{available}</span>
                <span className="text-sm text-muted-foreground">of {properties.length}</span>
              </div>
            </div>
            <div className="flex items-center justify-end rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
              <Link to="/app/landlord/properties" className="text-sm text-brand-blue hover:underline">
                View all properties →
              </Link>
            </div>
          </div>

          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Recent properties</h3>
              <Link
                to="/app/landlord/properties"
                className="text-sm text-brand-blue hover:underline"
              >
                View all
              </Link>
            </div>
            {properties.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">No properties yet.</p>
                <Link to="/app/landlord/properties/new" className="mt-3 inline-block">
                  <Button size="sm">Create your first property</Button>
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {properties.slice(0, 8).map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
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
        </>
      )}
    </div>
  );
}
