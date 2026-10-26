import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CreditCard,
  FileText,
  Home,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createPropertyPhotoSignedUrl,
  fetchCoverPathsForProperties,
} from "@/lib/propertyPhotos";
import { money, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { Property, RentCharge, RentPayment, RentalAssignment } from "@/types/database";

type StatAccent = "navy" | "green" | "warning";

const STAT_ACCENTS: Record<StatAccent, string> = {
  navy: "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-water",
  green: "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-brand-green",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
};

function DashboardStatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent: StatAccent;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card px-4 py-3.5 shadow-[0_2px_8px_rgba(11,31,58,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(11,31,58,0.08)] dark:shadow-none dark:hover:shadow-none">
      <div className="flex items-center gap-3">
        <div className={cn("shrink-0 rounded-xl p-2.5", STAT_ACCENTS[accent])}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate font-display text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  iconAccent,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconAccent: StatAccent;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none">
      <div className="flex items-start justify-between gap-3 border-b border-border/80 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("mt-0.5 shrink-0 rounded-xl p-2", STAT_ACCENTS[iconAccent])}>
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
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
        className="h-14 w-14 shrink-0 rounded-xl object-cover"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-navy/8 text-brand-navy dark:bg-brand-blue/15 dark:text-brand-water",
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

function formatStatusLabel(status: string) {
  if (!status) return status;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function RenterDashboard() {
  const { user, profile } = useAuth();
  const [assignments, setAssignments] = useState<RentalAssignment[]>([]);
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [propertiesById, setPropertiesById] = useState<Record<string, Property>>({});
  const [coverByPropertyId, setCoverByPropertyId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [a, c, p] = await Promise.all([
        supabase
          .from("rental_assignments")
          .select("*")
          .eq("renter_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("rent_charges")
          .select("*")
          .eq("renter_id", user.id)
          .neq("status", "paid")
          .order("due_date"),
        supabase
          .from("rent_payments")
          .select("*")
          .eq("payer_id", user.id)
          .order("submitted_at", { ascending: false })
          .limit(5),
      ]);
      if (cancelled) return;
      if (a.error || c.error || p.error) {
        setError(a.error?.message || c.error?.message || p.error?.message || "Load failed");
        setCoverByPropertyId({});
        setPropertiesById({});
        setLoading(false);
        return;
      }

      setError(null);
      const nextAssignments = a.data ?? [];
      setAssignments(nextAssignments);
      setCharges(c.data ?? []);
      setPayments(p.data ?? []);
      setLoading(false);

      const propertyIds = [
        ...new Set(nextAssignments.slice(0, 5).map((row) => row.property_id).filter(Boolean)),
      ];
      if (propertyIds.length === 0) {
        setPropertiesById({});
        setCoverByPropertyId({});
        return;
      }

      const { data: propsData } = await supabase
        .from("properties")
        .select("*")
        .in("id", propertyIds);
      if (cancelled) return;

      const byId: Record<string, Property> = {};
      for (const prop of propsData ?? []) {
        byId[prop.id] = prop;
      }
      setPropertiesById(byId);

      // Display-only covers for tenancy cards; failures stay silent (placeholder thumb).
      const coversByTenant = new Map<string, string[]>();
      for (const row of nextAssignments.slice(0, 5)) {
        const list = coversByTenant.get(row.tenant_id) ?? [];
        if (!list.includes(row.property_id)) list.push(row.property_id);
        coversByTenant.set(row.tenant_id, list);
      }
      const covers: Record<string, string> = {};
      await Promise.all(
        [...coversByTenant.entries()].map(async ([tenantId, ids]) => {
          const partial = await fetchCoverPathsForProperties(tenantId, ids);
          Object.assign(covers, partial);
        }),
      );
      if (!cancelled) setCoverByPropertyId(covers);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const active = assignments.filter((a) => a.status === "active").length;
  const outstanding = charges.reduce((sum, c) => sum + Number(c.balance), 0);
  const displayName = profile?.full_name?.trim() || profile?.email || "there";
  const openCharges = charges.slice(0, 5);
  const myTenancies = assignments.slice(0, 5);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
            Welcome back, {displayName}
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Here&apos;s an overview of your rental activity.
          </p>
        </div>

        <Link to="/app/renter/browse" className="shrink-0 self-start sm:self-auto">
          <Button size="sm" className="min-h-9 gap-1.5">
            <Search className="h-4 w-4" aria-hidden />
            Browse listings
          </Button>
        </Link>
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
        <div
          className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground"
          aria-live="polite"
        >
          Loading dashboard…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
            <DashboardStatCard
              label="Active tenancies"
              value={active}
              icon={Building2}
              accent="navy"
            />
            <DashboardStatCard
              label="Open balance"
              value={money(outstanding)}
              icon={CreditCard}
              accent="warning"
            />
            <DashboardStatCard
              label="Recent payments"
              value={payments.length}
              icon={CreditCard}
              accent="green"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:gap-5">
            <Panel
              title="Open rent charges"
              subtitle="View and pay your outstanding rent charges."
              icon={FileText}
              iconAccent="navy"
              action={
                <Link
                  to="/app/renter/payments"
                  className="shrink-0 rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Pay / history →
                </Link>
              }
            >
              {!error && openCharges.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-12 text-center sm:px-5">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-water">
                    <FileText className="h-7 w-7" aria-hidden />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    You&apos;re all caught up — no open charges.
                  </p>
                  <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                    There are no outstanding rent charges at the moment.
                  </p>
                </div>
              ) : openCharges.length > 0 ? (
                <ul className="divide-y divide-border/80">
                  {openCharges.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">
                          {c.period_start} → {c.period_end}
                        </div>
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          Due {c.due_date}
                          <span className="mx-1.5 text-border" aria-hidden>
                            ·
                          </span>
                          Balance {money(c.balance)}
                        </div>
                      </div>
                      <Badge tone={statusTone(c.status)} className="w-fit capitalize">
                        {formatStatusLabel(c.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>

            <Panel
              title="My tenancies"
              subtitle="Your current and past tenancies."
              icon={Home}
              iconAccent="green"
            >
              {!error && myTenancies.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-12 text-center sm:px-5">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-green/10 text-brand-green dark:bg-brand-green/20">
                    <Home className="h-7 w-7" aria-hidden />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No tenancies yet.</p>
                  <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                    When you are assigned a rental, it will appear here.
                  </p>
                  <Link to="/app/renter/browse" className="mt-4">
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Search className="h-4 w-4" aria-hidden />
                      Browse listings
                    </Button>
                  </Link>
                </div>
              ) : myTenancies.length > 0 ? (
                <ul className="space-y-3 p-4 sm:p-5">
                  {myTenancies.map((a) => {
                    const property = propertiesById[a.property_id];
                    const title =
                      property?.name?.trim() ||
                      property?.address_line ||
                      "Property";
                    const isActive = a.status === "active";
                    return (
                      <li
                        key={a.id}
                        className="rounded-xl border border-border/80 bg-muted/20 p-3.5 dark:bg-muted/10"
                      >
                        <div className="flex items-start gap-3">
                          <PropertyThumb
                            name={title}
                            storagePath={coverByPropertyId[a.property_id]}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">
                                  {title}
                                </div>
                                <div className="mt-0.5 font-display text-base font-bold tracking-tight text-foreground tabular-nums">
                                  {money(a.rent_amount, a.currency)}{" "}
                                  <span className="text-sm font-medium text-muted-foreground">
                                    / period
                                  </span>
                                </div>
                                <div className="mt-0.5 text-sm text-muted-foreground">
                                  Started {a.start_date}
                                </div>
                              </div>
                              <div
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                                  isActive
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                    : "bg-slate-50 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    isActive ? "bg-emerald-500" : "bg-slate-400",
                                  )}
                                  aria-hidden
                                />
                                {formatStatusLabel(a.status)}
                              </div>
                            </div>
                            <Link
                              to={`/app/renter/tenancy/${a.id}`}
                              className="mt-3 inline-flex"
                            >
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-brand-blue/25 bg-brand-blue/5 text-brand-blue hover:bg-brand-blue/10 dark:border-brand-blue/40 dark:bg-brand-blue/10 dark:text-brand-water dark:hover:bg-brand-blue/20"
                              >
                                View tenancy →
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
