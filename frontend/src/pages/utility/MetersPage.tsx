import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, Gauge, Plus, Search } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricCard, MetricRow } from "@/components/ui/metric-card";
import { Select } from "@/components/ui/select";
import { statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { Meter, MeterStatus, UtilityAccount } from "@/types/database";
import { KIND_LABEL, KIND_SERVICE_TYPE, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function MetersPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];
  const accent = kind === "water" ? "water" : "power";

  const [meters, setMeters] = useState<Meter[]>([]);
  const [accounts, setAccounts] = useState<UtilityAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MeterStatus | "all">("all");
  const [form, setForm] = useState({ utility_account_id: "", meter_number: "", installed_at: "" });

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [metersRes, accountsRes] = await Promise.all([
      supabase
        .from("meters")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      supabase.from("utility_accounts").select("*").eq("tenant_id", tenantId).order("account_number"),
    ]);
    if (metersRes.error || accountsRes.error) {
      setError(metersRes.error?.message || accountsRes.error?.message || "Failed to load");
    } else {
      setError(null);
      setMeters(metersRes.data ?? []);
      setAccounts(accountsRes.data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const stats = useMemo(() => {
    let active = 0;
    let faulty = 0;
    let inactive = 0;
    for (const m of meters) {
      if (m.status === "active") active += 1;
      else if (m.status === "faulty") faulty += 1;
      else inactive += 1;
    }
    return { total: meters.length, active, faulty, inactive };
  }, [meters]);

  const filteredMeters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return meters.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!q) return true;
      const account = accounts.find((a) => a.id === m.utility_account_id);
      const haystack = [m.meter_number, account?.account_number ?? "", m.status].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [meters, accounts, searchQuery, statusFilter]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Meter management requires utility admin or staff access.
      </div>
    );
  }

  const accountNumber = (id: string) =>
    accounts.find((a) => a.id === id)?.account_number ?? id.slice(0, 8) + "…";

  const addMeter = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId || !form.utility_account_id || !form.meter_number.trim()) {
      setError("Select an account and enter a meter number");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("meters").insert({
      tenant_id: tenantId,
      utility_account_id: form.utility_account_id,
      meter_number: form.meter_number.trim(),
      service_type: KIND_SERVICE_TYPE[kind],
      status: "active",
      installed_at: form.installed_at || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("Meter added.");
    setForm({ utility_account_id: "", meter_number: "", installed_at: "" });
    await load();
  };

  const updateStatus = async (meterId: string, status: MeterStatus) => {
    setBusyId(meterId);
    setError(null);
    const { error: err } = await supabase.from("meters").update({ status }).eq("id", meterId);
    setBusyId(null);
    if (err) setError(err.message);
    else await load();
  };

  return (
    <div className="space-y-5">
      <div>
        <p
          className={cn(
            "text-[11px] font-semibold tracking-[0.08em]",
            kind === "water" ? "text-brand-water" : "text-brand-power",
          )}
        >
          {label} · Finance
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Meters
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Register meters to customer accounts and track device status.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {msg}
        </div>
      )}

      <div className="rounded-2xl border border-brand-green/35 bg-card p-3 dark:border-brand-green/40 sm:p-4">
        <MetricRow>
          <MetricCard compact label="Total" value={stats.total} icon={Gauge} accent="navy" />
          <MetricCard compact label="Active" value={stats.active} icon={Activity} accent="green" />
          <MetricCard
            compact
            label="Faulty"
            value={stats.faulty}
            icon={AlertTriangle}
            accent="warning"
          />
          <MetricCard
            compact
            label="Other"
            value={stats.inactive}
            icon={Gauge}
            accent={accent}
          />
        </MetricRow>
      </div>

      <form
        onSubmit={addMeter}
        className="grid gap-3 rounded-2xl border border-brand-green/35 bg-card p-5 dark:border-brand-green/40 sm:grid-cols-3"
      >
        <div className="sm:col-span-3">
          <h3 className="font-display text-sm font-semibold text-foreground">Add meter</h3>
          <p className="text-xs text-muted-foreground">Link a device to a customer account</p>
        </div>
        <div>
          <Label htmlFor="acc">Account</Label>
          <Select
            id="acc"
            required
            value={form.utility_account_id}
            onChange={(e) => setForm({ ...form, utility_account_id: e.target.value })}
          >
            <option value="">Select account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_number}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="mn">Meter number</Label>
          <Input
            id="mn"
            required
            value={form.meter_number}
            onChange={(e) => setForm({ ...form, meter_number: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="inst">Installed date</Label>
          <Input
            id="inst"
            type="date"
            value={form.installed_at}
            onChange={(e) => setForm({ ...form, installed_at: e.target.value })}
          />
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={saving || accounts.length === 0}>
            <Plus className="h-4 w-4" />
            {saving ? "Adding…" : "Add meter"}
          </Button>
          {accounts.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Link a customer account first.</p>
          )}
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-brand-green/35 bg-card dark:border-brand-green/40">
        <div className="border-b border-border/70 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-semibold text-foreground">Meter registry</h3>
              <p className="text-xs text-muted-foreground">Search and update meter status</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <label className="relative block min-w-0 flex-1 lg:w-72">
                <span className="sr-only">Search meters</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search meter or account…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9"
                />
              </label>
              <Select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as MeterStatus | "all")}
                className="h-9 sm:w-40"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="faulty">Faulty</option>
                <option value="replaced">Replaced</option>
              </Select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-sm text-muted-foreground sm:px-5">Loading…</div>
        ) : filteredMeters.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-5">
            {meters.length === 0 ? "No meters yet." : "No meters match your filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Meter</th>
                  <th className="px-4 py-2.5 font-semibold">Account</th>
                  <th className="px-4 py-2.5 font-semibold">Installed</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-right sm:px-5">Change status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredMeters.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold sm:px-5">{m.meter_number}</td>
                    <td className="px-4 py-3 text-brand-green">{accountNumber(m.utility_account_id)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.installed_at || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <Select
                        value={m.status}
                        disabled={busyId === m.id}
                        onChange={(e) => void updateStatus(m.id, e.target.value as MeterStatus)}
                        className="ml-auto h-8 w-auto min-w-[8rem]"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="faulty">Faulty</option>
                        <option value="replaced">Replaced</option>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
