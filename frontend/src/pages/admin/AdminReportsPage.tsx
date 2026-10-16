import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Droplets, Landmark, Wallet } from "lucide-react";
import { BarChart, DonutChart } from "@/components/charts/SimpleCharts";
import { money } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Tenant } from "@/types/database";
import {
  AdminError,
  AdminKpi,
  AdminKpiRow,
  AdminPageHeader,
} from "./shared";

export function AdminReportsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [propertyCount, setPropertyCount] = useState(0);
  const [waterAccounts, setWaterAccounts] = useState(0);
  const [elecAccounts, setElecAccounts] = useState(0);
  const [rentPaid, setRentPaid] = useState(0);
  const [utilityPaid, setUtilityPaid] = useState(0);
  const [utilityOutstanding, setUtilityOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [
      tenantsRes,
      propsRes,
      waterRes,
      elecRes,
      rentRes,
      utilPayRes,
      billsRes,
    ] = await Promise.all([
      supabase.from("tenants").select("*"),
      supabase.from("properties").select("id", { count: "exact", head: true }),
      supabase
        .from("utility_accounts")
        .select("id", { count: "exact", head: true })
        .eq("service_type", "water"),
      supabase
        .from("utility_accounts")
        .select("id", { count: "exact", head: true })
        .eq("service_type", "electricity"),
      supabase
        .from("rent_payments")
        .select("amount, status")
        .eq("status", "paid"),
      supabase
        .from("utility_payments")
        .select("amount, status")
        .eq("status", "paid"),
      supabase.from("utility_bills").select("balance"),
    ]);

    const err =
      tenantsRes.error ||
      propsRes.error ||
      waterRes.error ||
      elecRes.error ||
      rentRes.error ||
      utilPayRes.error ||
      billsRes.error;
    if (err) setError(err.message);

    setTenants(tenantsRes.data ?? []);
    setPropertyCount(propsRes.count ?? 0);
    setWaterAccounts(waterRes.count ?? 0);
    setElecAccounts(elecRes.count ?? 0);
    setRentPaid(
      (rentRes.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0),
    );
    setUtilityPaid(
      (utilPayRes.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0),
    );
    setUtilityOutstanding(
      (billsRes.data ?? []).reduce((s, r) => s + Number(r.balance || 0), 0),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orgTenants = useMemo(
    () => tenants.filter((t) => t.tenant_type !== "platform"),
    [tenants],
  );

  const typeSlices = useMemo(() => {
    const landlord = orgTenants.filter((t) => t.tenant_type === "landlord").length;
    const water = orgTenants.filter((t) => t.tenant_type === "water_company").length;
    const electricity = orgTenants.filter(
      (t) => t.tenant_type === "electricity_company",
    ).length;
    return [
      { key: "landlord", label: "Landlords", value: landlord, color: "#2b8cff" },
      { key: "water", label: "Water", value: water, color: "#1fa85a" },
      {
        key: "electricity",
        label: "Electricity",
        value: electricity,
        color: "#f59e0b",
      },
    ];
  }, [orgTenants]);

  const opsBars = useMemo(
    () => [
      { key: "properties", label: "Props", value: propertyCount },
      { key: "water", label: "Water", value: waterAccounts },
      { key: "elec", label: "Power", value: elecAccounts },
    ],
    [propertyCount, waterAccounts, elecAccounts],
  );

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform · Reports"
        title="Reports"
        description="Cross-tenant snapshot of workspaces, assets, and collections."
      />

      {error && <AdminError message={error} />}

      <AdminKpiRow>
        <AdminKpi
          label="Organization tenants"
          value={loading ? "—" : orgTenants.length}
          icon={Landmark}
          accent="navy"
        />
        <AdminKpi
          label="Properties"
          value={loading ? "—" : propertyCount}
          icon={Building2}
          accent="water"
        />
        <AdminKpi
          label="Collected (rent)"
          value={loading ? "—" : money(rentPaid)}
          icon={Wallet}
          accent="green"
        />
        <AdminKpi
          label="Utility outstanding"
          value={loading ? "—" : money(utilityOutstanding)}
          hint={`Collected ${money(utilityPaid)}`}
          icon={Droplets}
          accent="amber"
        />
      </AdminKpiRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none">
          <h3 className="font-display text-base font-semibold">Workspace mix</h3>
          <p className="mb-5 text-sm text-muted-foreground">By tenant type</p>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : (
            <DonutChart
              slices={typeSlices}
              variant="semi"
              size={190}
              thickness={26}
              centerValue={orgTenants.length}
              centerLabel="tenants"
            />
          )}
        </section>

        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none">
          <h3 className="font-display text-base font-semibold">
            Operational volume
          </h3>
          <p className="mb-5 text-sm text-muted-foreground">
            Properties and utility accounts on the platform
          </p>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : (
            <BarChart
              points={opsBars}
              height={210}
              color="var(--color-brand-water)"
              highlightColor="#f59e0b"
            />
          )}
        </section>
      </div>
    </div>
  );
}
