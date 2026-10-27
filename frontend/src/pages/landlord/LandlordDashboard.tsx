import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ClipboardList,
  CreditCard,
  Home,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { BarChart, DonutChart } from "@/components/charts/SimpleCharts";
import { MetricCard, MetricRow } from "@/components/ui/metric-card";
import { supabase } from "@/lib/supabase";
import { brandingString } from "@/lib/uploadImage";
import type {
  LandlordRentalApplicationRow,
  Property,
  RentPayment,
} from "@/types/database";

export function LandlordDashboard() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const branding = (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>;
  const workspaceName =
    brandingString(branding, "display_name") || activeMembership?.tenant.name || "Workspace";

  const [properties, setProperties] = useState<Property[]>([]);
  const [pending, setPending] = useState<RentPayment[]>([]);
  const [applications, setApplications] = useState<LandlordRentalApplicationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [propsRes, payRes, appRes] = await Promise.all([
        supabase
          .from("properties")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("rent_payments")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("status", "pending")
          .order("submitted_at", { ascending: false })
          .limit(8),
        supabase.rpc("list_landlord_rental_applications", { p_status: null }),
      ]);
      if (cancelled) return;
      if (propsRes.error || payRes.error || appRes.error) {
        setError(
          propsRes.error?.message ||
            payRes.error?.message ||
            appRes.error?.message ||
            "Failed to load",
        );
        setLoading(false);
      } else {
        setError(null);
        setProperties(propsRes.data ?? []);
        setPending(payRes.data ?? []);
        const all = (appRes.data as LandlordRentalApplicationRow[] | null) ?? [];
        setApplications(all.filter((r) => r.tenant_id === tenantId));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const available = properties.filter((p) => p.status === "available").length;
  const occupied = properties.filter((p) => p.status === "occupied").length;
  const otherStatus = properties.length - available - occupied;
  const pendingApplications = applications.filter((a) => a.status === "pending").length;
  const acceptedApplications = applications.filter((a) => a.status === "accepted").length;
  const rejectedApplications = applications.filter((a) => a.status === "rejected").length;
  const published = properties.filter((p) => p.is_listed).length;

  const occupancySlices = useMemo(
    () =>
      [
        { key: "available", label: "Available", value: available, color: "#1fa85a" },
        { key: "occupied", label: "Occupied", value: occupied, color: "#2b8cff" },
        ...(otherStatus > 0
          ? [{ key: "other", label: "Other", value: otherStatus, color: "#94a3b8" }]
          : []),
      ].filter((s) => s.value > 0),
    [available, occupied, otherStatus],
  );

  const attentionBars = useMemo(
    () => [
      { key: "apps", label: "Apps", value: pendingApplications },
      { key: "rent", label: "Rent", value: pending.length },
      { key: "listed", label: "Listed", value: published },
      { key: "open", label: "Open", value: available },
    ],
    [pendingApplications, pending.length, published, available],
  );

  if (!tenantId || activeMembership?.tenant.tenant_type !== "landlord") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a landlord workspace membership to manage rental properties.
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-green">
          Landlord · Today
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {workspaceName}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Property inventory, applications, and rent approvals at a glance.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <MetricRow>
        <MetricCard
          compact
          label="Properties"
          value={properties.length}
          icon={Building2}
          accent="navy"
        />
        <MetricCard compact label="Available" value={available} icon={Home} accent="green" />
        <MetricCard compact label="Occupied" value={occupied} icon={Users} accent="water" />
        <MetricCard
          compact
          label="Applications"
          value={pendingApplications}
          icon={ClipboardList}
          accent="warning"
        />
        <MetricCard
          compact
          label="Rent review"
          value={pending.length}
          icon={CreditCard}
          accent="warning"
        />
      </MetricRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition-colors hover:border-brand-water/30 dark:border-border dark:shadow-none dark:hover:border-brand-water/35 sm:p-6">
          <div className="mb-5">
            <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
              Property occupancy
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Available vs occupied inventory
            </p>
          </div>
          {occupancySlices.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No properties yet.</p>
          ) : (
            <DonutChart
              slices={occupancySlices}
              size={176}
              thickness={26}
              centerValue={properties.length}
              centerLabel="Total"
            />
          )}
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition-colors hover:border-brand-water/30 dark:border-border dark:shadow-none dark:hover:border-brand-water/35 sm:p-6">
          <div className="mb-5">
            <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
              Attention & listings
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pending work and published stock
            </p>
          </div>
          <BarChart
            points={attentionBars}
            height={210}
            color="var(--color-brand-water)"
            highlightColor="#f5c400"
          />
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <span>
              Accepted{" "}
              <strong className="tabular-nums text-foreground">{acceptedApplications}</strong>
            </span>
            <span>
              Rejected{" "}
              <strong className="tabular-nums text-foreground">{rejectedApplications}</strong>
            </span>
          </div>
        </section>
      </div>

    </div>
  );
}
