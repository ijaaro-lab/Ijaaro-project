import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  CreditCard,
  Home,
  MapPin,
  Plus,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createPropertyPhotoSignedUrl,
  fetchCoverPathsForProperties,
} from "@/lib/propertyPhotos";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Property, RentPayment } from "@/types/database";

type StatAccent = "navy" | "green" | "teal" | "orange" | "pink";

const STAT_ACCENTS: Record<StatAccent, string> = {
  navy: "bg-brand-navy/10 text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water",
  green: "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-brand-green",
  teal: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  pink: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300",
};

function DashboardStatCard({
  label,
  value,
  icon: Icon,
  accent,
  valueTitle,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent: StatAccent;
  valueTitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card px-4 py-3.5 shadow-[0_2px_8px_rgba(11,31,58,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(11,31,58,0.08)] dark:shadow-none dark:hover:shadow-none">
      <div className="flex items-center gap-3">
        <div className={cn("shrink-0 rounded-xl p-2.5", STAT_ACCENTS[accent])}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
          <div
            className="mt-0.5 truncate font-display text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums"
            title={valueTitle}
          >
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3.5 sm:px-5">
        <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {action}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function PropertyThumb({
  name,
  storagePath,
}: {
  name: string;
  storagePath?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!storagePath) {
      setUrl(null);
      setFailed(false);
      return;
    }
    setFailed(false);
    void (async () => {
      const signed = await createPropertyPhotoSignedUrl(storagePath);
      if (cancelled) return;
      if (!signed) {
        setUrl(null);
        setFailed(true);
        return;
      }
      setUrl(signed);
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  if (storagePath && !failed && url) {
    return (
      <img
        src={url}
        alt={name}
        className="h-12 w-12 shrink-0 rounded-xl object-cover"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-navy/8 text-brand-navy dark:bg-brand-blue/15 dark:text-brand-water",
        storagePath && !failed && !url && "animate-pulse",
      )}
      role="img"
      aria-label={
        storagePath && !failed && !url
          ? "Loading property photo"
          : `${name} thumbnail`
      }
    >
      <Home className="h-5 w-5 opacity-70" aria-hidden />
    </div>
  );
}

export function LandlordDashboard() {
  const { activeMembership, profile } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const [properties, setProperties] = useState<Property[]>([]);
  const [pending, setPending] = useState<RentPayment[]>([]);
  const [assignmentCount, setAssignmentCount] = useState(0);
  /** Tenant staff roster length from list_landlord_staff_profiles; null = unavailable / error. */
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [coverByPropertyId, setCoverByPropertyId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      setStaffCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Clear prior tenant's staff count immediately so a switch never shows a stale number.
      setStaffCount(null);
      const [propsRes, payRes, asgRes, staffRes] = await Promise.all([
        supabase.from("properties").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
        supabase
          .from("rent_payments")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("status", "pending")
          .order("submitted_at", { ascending: false })
          .limit(8),
        supabase
          .from("rental_assignments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active"),
        // Same RPC + args as StaffMembersPage (tenant-scoped landlord_staff, active + disabled).
        supabase.rpc("list_landlord_staff_profiles", { p_tenant_id: tenantId }),
      ]);
      if (cancelled) return;
      if (propsRes.error || payRes.error || asgRes.error) {
        setError(propsRes.error?.message || payRes.error?.message || asgRes.error?.message || "Failed to load");
        setCoverByPropertyId({});
        setStaffCount(null);
        setLoading(false);
      } else {
        setError(null);
        const props = propsRes.data ?? [];
        setProperties(props);
        setPending(payRes.data ?? []);
        setAssignmentCount(asgRes.count ?? 0);
        if (staffRes.error) {
          setStaffCount(null);
          setError(staffRes.error.message);
        } else {
          // Staff page lists every returned row (active and disabled); count matches that list.
          setStaffCount((staffRes.data ?? []).length);
        }
        setLoading(false);
        // Display-only covers for the recent list; failures stay silent (placeholder thumb).
        const recentIds = props.slice(0, 5).map((p) => p.id);
        const covers = await fetchCoverPathsForProperties(tenantId, recentIds);
        if (!cancelled) setCoverByPropertyId(covers);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (!tenantId || activeMembership?.tenant.tenant_type !== "landlord") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a landlord workspace membership to manage rental properties.
      </div>
    );
  }

  const available = properties.filter((p) => p.status === "available").length;
  const occupied = properties.filter((p) => p.status === "occupied").length;
  const displayName = profile?.full_name || profile?.email || "there";
  const workspaceName = activeMembership.tenant.name;
  const recent = properties.slice(0, 5);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue/80">
            Landlord dashboard
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
            Welcome, {displayName}
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Overview for{" "}
            <span className="font-medium text-foreground">{workspaceName}</span>. Track listings,
            occupancy, and pending rent reviews in one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/app/landlord/renters">
            <Button variant="outline" size="sm" className="min-h-9 gap-1.5">
              <UserPlus className="h-4 w-4" aria-hidden />
              Invite renter
            </Button>
          </Link>
          <Link to="/app/landlord/payments">
            <Button variant="outline" size="sm" className="min-h-9 gap-1.5">
              <CreditCard className="h-4 w-4" aria-hidden />
              Review payments
            </Button>
          </Link>
          <Link to="/app/landlord/properties/new">
            <Button size="sm" className="min-h-9 gap-1.5">
              <Plus className="h-4 w-4" aria-hidden />
              Add property
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground" aria-live="polite">
          Loading dashboard…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <DashboardStatCard
              label="Properties"
              value={properties.length}
              icon={Building2}
              accent="navy"
            />
            <DashboardStatCard
              label="Available"
              value={available}
              icon={ClipboardList}
              accent="green"
            />
            <DashboardStatCard
              label="Occupied"
              value={occupied}
              icon={Users}
              accent="teal"
            />
            <DashboardStatCard
              label="Active tenancies"
              value={assignmentCount}
              icon={CreditCard}
              accent="orange"
            />
            <DashboardStatCard
              label="Staff Members"
              value={staffCount === null ? "—" : staffCount}
              icon={UsersRound}
              accent="pink"
              valueTitle={
                staffCount === null
                  ? "Staff count unavailable"
                  : undefined
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <Panel
              title="Recent Properties"
              action={
                <Link
                  to="/app/landlord/properties"
                  className="rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View all
                </Link>
              }
            >
              {recent.length === 0 ? (
                <div className="px-4 py-10 text-center sm:px-5">
                  <p className="text-sm text-muted-foreground">No properties yet.</p>
                  <Link to="/app/landlord/properties/new" className="mt-3 inline-block">
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-4 w-4" aria-hidden />
                      Add property
                    </Button>
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-border/80">
                  {recent.map((p) => {
                    const title = p.name || p.address_line;
                    const location = p.district || p.city || "—";
                    return (
                      <li key={p.id}>
                        <Link
                          to={`/app/landlord/properties/${p.id}`}
                          className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:items-center sm:px-5"
                        >
                          <PropertyThumb name={title} storagePath={coverByPropertyId[p.id]} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="break-words font-medium text-foreground">{title}</div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                                  <span className="tabular-nums">{money(p.rent_amount, p.currency)}</span>
                                  <span className="text-border" aria-hidden>
                                    ·
                                  </span>
                                  <span className="inline-flex min-w-0 items-center gap-1 break-words">
                                    <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                                    {location}
                                  </span>
                                </div>
                              </div>
                              <Badge tone={statusTone(p.status)} className="shrink-0 capitalize">
                                {p.status}
                              </Badge>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel
              title="Pending Rent Payments"
              action={
                <Link
                  to="/app/landlord/payments"
                  className="rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Review queue
                </Link>
              }
            >
              {pending.length === 0 ? (
                <div className="px-4 py-10 text-center sm:px-5">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    <CreditCard className="h-5 w-5" aria-hidden />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">No pending submissions.</p>
                  <Link
                    to="/app/landlord/payments"
                    className="mt-2 inline-block text-sm font-medium text-brand-blue hover:underline"
                  >
                    Open payments review
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-border/80">
                  {pending.map((pay) => (
                    <li
                      key={pay.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-sm sm:px-5"
                    >
                      <div className="min-w-0">
                        <div className="font-medium tabular-nums text-foreground">
                          {money(pay.amount, pay.currency)}
                        </div>
                        <div className="mt-0.5 capitalize text-muted-foreground">
                          {pay.method.replaceAll("_", " ")}
                        </div>
                      </div>
                      <Badge tone="warning" className="shrink-0">
                        pending
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
