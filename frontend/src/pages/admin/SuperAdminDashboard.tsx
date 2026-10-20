import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CreditCard,
  Droplets,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { BarChart, DonutChart } from "@/components/charts/SimpleCharts";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { LucideIcon } from "lucide-react";
import type { Tenant } from "@/types/database";

const TYPE_COLORS = {
  landlord: "#2b8cff",
  water_company: "#1fa85a",
  electricity_company: "#f59e0b",
} as const;

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  hintTone = "muted",
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: LucideIcon;
  accent: "blue" | "green" | "violet" | "amber";
  hintTone?: "muted" | "danger" | "success";
}) {
  const accents = {
    blue: "bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300",
    green:
      "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
    violet:
      "bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300",
    amber: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={cn("rounded-xl p-2", accents[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      <p
        className={cn(
          "mt-2 text-xs",
          hintTone === "danger" && "text-red-600 dark:text-red-400",
          hintTone === "success" && "text-emerald-600 dark:text-emerald-400",
          hintTone === "muted" && "text-muted-foreground",
        )}
      >
        {hint}
      </p>
    </div>
  );
}

const OPS_LINKS: {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
}[] = [
  {
    to: "/app/admin/tenants",
    label: "Tenants",
    description: "Create, edit, delete",
    icon: Shield,
    accent: "bg-brand-green/15 text-brand-green dark:text-emerald-300",
  },
  {
    to: "/app/admin/properties",
    label: "Properties",
    description: "Landlord inventory",
    icon: Building2,
    accent: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  },
  {
    to: "/app/admin/water",
    label: "Water",
    description: "Accounts & meters",
    icon: Droplets,
    accent: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
  {
    to: "/app/admin/electricity",
    label: "Electricity",
    description: "Power utility ops",
    icon: Zap,
    accent: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  },
  {
    to: "/app/admin/payments",
    label: "Payments",
    description: "Rent & utility",
    icon: CreditCard,
    accent: "bg-brand-blue/15 text-brand-blue dark:text-sky-300",
  },
  {
    to: "/app/admin/reports",
    label: "Reports",
    description: "Platform snapshot",
    icon: BarChart3,
    accent: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  },
];

export function SuperAdminDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: memberships }] = await Promise.all([
      supabase.from("tenants").select("*").order("created_at", { ascending: false }),
      supabase.from("tenant_memberships").select("tenant_id").eq("status", "active"),
    ]);
    setTenants(t ?? []);
    const counts: Record<string, number> = {};
    for (const row of memberships ?? []) {
      counts[row.tenant_id] = (counts[row.tenant_id] ?? 0) + 1;
    }
    setMemberCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orgTenants = useMemo(
    () => tenants.filter((t) => t.tenant_type !== "platform"),
    [tenants],
  );

  const stats = useMemo(() => {
    const active = orgTenants.filter((x) => x.status === "active").length;
    const attention = orgTenants.filter(
      (x) =>
        x.status === "pending" ||
        x.status === "suspended" ||
        x.status === "disabled",
    ).length;
    const members = orgTenants.reduce((s, t) => s + (memberCounts[t.id] ?? 0), 0);
    const landlord = orgTenants.filter((x) => x.tenant_type === "landlord").length;
    const water = orgTenants.filter((x) => x.tenant_type === "water_company").length;
    const electricity = orgTenants.filter(
      (x) => x.tenant_type === "electricity_company",
    ).length;
    return {
      total: orgTenants.length,
      active,
      attention,
      members,
      landlord,
      water,
      electricity,
    };
  }, [orgTenants, memberCounts]);

  const typeSlices = useMemo(
    () => [
      {
        key: "landlord",
        label: "Landlords",
        value: stats.landlord,
        color: TYPE_COLORS.landlord,
      },
      {
        key: "water",
        label: "Water companies",
        value: stats.water,
        color: TYPE_COLORS.water_company,
      },
      {
        key: "electricity",
        label: "Electricity companies",
        value: stats.electricity,
        color: TYPE_COLORS.electricity_company,
      },
    ],
    [stats],
  );

  const growthBars = useMemo(() => {
    const now = new Date();
    const keys: string[] = [];
    for (let i = 4; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(monthKey(d));
    }
    const map: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const t of orgTenants) {
      const k = monthKey(new Date(t.created_at));
      if (k in map) map[k] += 1;
    }
    return keys.map((k) => ({ key: k, label: monthLabel(k), value: map[k] }));
  }, [orgTenants]);

  const rangeLabel =
    growthBars.length > 0
      ? `${growthBars[0].label} – ${growthBars[growthBars.length - 1].label}`
      : "";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-green">
          Platform · Today
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Administrator Dashboard
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Tenant mix, workspace health, and growth in one scan.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <KpiCard
          label="Total tenants"
          value={loading ? "—" : stats.total}
          hint={`${stats.active} currently active`}
          icon={Shield}
          accent="blue"
        />
        <KpiCard
          label="Active workspaces"
          value={loading ? "—" : stats.active}
          hint="Running normally"
          icon={Building2}
          accent="violet"
        />
        <KpiCard
          label="Active members"
          value={loading ? "—" : stats.members}
          hint="Across all tenants"
          icon={Users}
          accent="green"
          hintTone="success"
        />
        <KpiCard
          label="Needs attention"
          value={loading ? "—" : stats.attention}
          hint={
            stats.attention > 0
              ? "Pending, suspended, or disabled"
              : "All clear"
          }
          icon={AlertTriangle}
          accent="amber"
          hintTone={stats.attention > 0 ? "danger" : "muted"}
        />
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-foreground">
              Operations
            </h3>
            <p className="text-sm text-muted-foreground">
              Jump into cross-tenant monitoring
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {OPS_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition hover:border-brand-water/40 hover:bg-muted/40 dark:border-border dark:shadow-none dark:hover:bg-muted/20"
            >
              <div className={cn("rounded-xl p-2", item.accent)}>
                <item.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none">
          <h3 className="font-display text-base font-semibold text-foreground">
            Tenant distribution
          </h3>
          <p className="mb-5 text-sm text-muted-foreground">By workspace type</p>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <DonutChart
              slices={typeSlices}
              variant="semi"
              size={200}
              thickness={28}
              centerValue={stats.total}
              centerLabel="Total tenants"
            />
          )}
        </section>

        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-foreground">
                New workspaces
              </h3>
              <p className="text-sm text-muted-foreground">Monthly tenant signups</p>
            </div>
            {rangeLabel && (
              <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {rangeLabel}
              </span>
            )}
          </div>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <BarChart
              points={growthBars}
              height={220}
              color="var(--color-brand-water)"
              highlightColor="#f59e0b"
            />
          )}
        </section>
      </div>
    </div>
  );
}
