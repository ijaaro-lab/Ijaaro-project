import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ClipboardList,
  FileCheck2,
  Gauge,
  Search,
  Send,
} from "lucide-react";
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
import type { Meter, MeterReading, ReadingStatus, UtilityAccount } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

const correctionStatuses: ReadingStatus[] = ["corrected", "reset"];

export function ReadingsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];
  const accent = kind === "water" ? "water" : "power";

  const [meters, setMeters] = useState<Meter[]>([]);
  const [accounts, setAccounts] = useState<UtilityAccount[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReadingStatus | "all">("all");
  const [form, setForm] = useState({
    meter_id: "",
    reading_value: "",
    reading_date: new Date().toISOString().slice(0, 10),
    status: "valid" as ReadingStatus,
    correction_reason: "",
    notes: "",
  });

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [metersRes, accountsRes, readingsRes] = await Promise.all([
      supabase
        .from("meters")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("meter_number"),
      supabase.from("utility_accounts").select("*").eq("tenant_id", tenantId),
      supabase
        .from("meter_readings")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(80),
    ]);
    if (metersRes.error || accountsRes.error || readingsRes.error) {
      setError(
        metersRes.error?.message ||
          accountsRes.error?.message ||
          readingsRes.error?.message ||
          "Failed to load",
      );
    } else {
      setError(null);
      setMeters(metersRes.data ?? []);
      setAccounts(accountsRes.data ?? []);
      setReadings(readingsRes.data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const meterById = useMemo(() => {
    const map = new Map<string, Meter>();
    for (const m of meters) map.set(m.id, m);
    return map;
  }, [meters]);

  const accountById = useMemo(() => {
    const map = new Map<string, UtilityAccount>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  const stats = useMemo(() => {
    let valid = 0;
    let corrected = 0;
    let units = 0;
    for (const r of readings) {
      if (r.status === "valid") valid += 1;
      if (r.status === "corrected" || r.status === "reset") corrected += 1;
      if (r.units_consumed != null) units += Number(r.units_consumed);
    }
    return {
      total: readings.length,
      valid,
      corrected,
      units: Math.round(units * 1000) / 1000,
    };
  }, [readings]);

  const filteredReadings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return readings.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const meter = meterById.get(r.meter_id);
      const account = meter ? accountById.get(meter.utility_account_id) : undefined;
      const haystack = [
        meter?.meter_number ?? "",
        account?.account_number ?? "",
        r.status,
        r.reading_date,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [readings, searchQuery, statusFilter, meterById, accountById]);

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
        Recording readings requires utility admin or staff access.
      </div>
    );
  }

  const accountNumberForMeter = (meterId: string) => {
    const meter = meterById.get(meterId) ?? meters.find((m) => m.id === meterId);
    const account = meter ? accountById.get(meter.utility_account_id) : undefined;
    return account?.account_number ?? meter?.utility_account_id.slice(0, 8) ?? "—";
  };

  const meterNumber = (meterId: string) =>
    meterById.get(meterId)?.meter_number ??
    meters.find((m) => m.id === meterId)?.meter_number ??
    meterId.slice(0, 8) + "…";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(form.reading_value);
    if (!form.meter_id) {
      setError("Select a meter");
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      setError("Reading value must be a non-negative number");
      return;
    }
    if (correctionStatuses.includes(form.status) && !form.correction_reason.trim()) {
      setError("A correction reason is required for corrected/reset readings");
      return;
    }

    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc("record_meter_reading", {
      p_meter_id: form.meter_id,
      p_reading_value: value,
      p_reading_date: form.reading_date,
      p_status: form.status,
      p_correction_reason: form.correction_reason.trim() || null,
      p_notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("Reading recorded.");
    setForm({ ...form, reading_value: "", correction_reason: "", notes: "" });
    await load();
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
          Readings
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Record meter readings and review recent consumption history.
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
          <MetricCard
            compact
            label="Readings"
            value={stats.total}
            icon={ClipboardList}
            accent="navy"
          />
          <MetricCard compact label="Valid" value={stats.valid} icon={FileCheck2} accent="green" />
          <MetricCard
            compact
            label="Corrected"
            value={stats.corrected}
            icon={Gauge}
            accent="warning"
          />
          <MetricCard compact label="Units" value={stats.units} icon={Activity} accent={accent} />
        </MetricRow>
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-3 rounded-2xl border border-brand-green/35 bg-card p-5 dark:border-brand-green/40 sm:grid-cols-3"
      >
        <div className="sm:col-span-3">
          <h3 className="font-display text-sm font-semibold text-foreground">Record reading</h3>
          <p className="text-xs text-muted-foreground">Capture a new meter value for billing</p>
        </div>
        <div className="sm:col-span-3 sm:max-w-sm">
          <Label htmlFor="meter">Meter</Label>
          <Select
            id="meter"
            required
            value={form.meter_id}
            onChange={(e) => setForm({ ...form, meter_id: e.target.value })}
          >
            <option value="">Select meter…</option>
            {meters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.meter_number} ({accountNumberForMeter(m.id)})
              </option>
            ))}
          </Select>
          {meters.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">No active meters yet.</p>
          )}
        </div>
        <div>
          <Label htmlFor="rv">Reading value</Label>
          <Input
            id="rv"
            type="number"
            min="0"
            step="0.0001"
            required
            value={form.reading_value}
            onChange={(e) => setForm({ ...form, reading_value: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="rd">Reading date</Label>
          <Input
            id="rd"
            type="date"
            required
            value={form.reading_date}
            onChange={(e) => setForm({ ...form, reading_date: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            id="status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as ReadingStatus })}
          >
            <option value="valid">Valid</option>
            <option value="estimated">Estimated</option>
            <option value="corrected">Corrected</option>
            <option value="reset">Reset</option>
            <option value="disputed">Disputed</option>
          </Select>
        </div>
        {correctionStatuses.includes(form.status) && (
          <div className="sm:col-span-3">
            <Label htmlFor="reason">Correction reason *</Label>
            <Input
              id="reason"
              required
              value={form.correction_reason}
              onChange={(e) => setForm({ ...form, correction_reason: e.target.value })}
            />
          </div>
        )}
        <div className="sm:col-span-3">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={saving || meters.length === 0}>
            <Send className="h-4 w-4" />
            {saving ? "Recording…" : "Record reading"}
          </Button>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-brand-green/35 bg-card dark:border-brand-green/40">
        <div className="border-b border-border/70 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-semibold text-foreground">
                Reading history
              </h3>
              <p className="text-xs text-muted-foreground">Search and filter recent meter readings</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <label className="relative block min-w-0 flex-1 lg:w-72">
                <span className="sr-only">Search readings</span>
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
                onChange={(e) => setStatusFilter(e.target.value as ReadingStatus | "all")}
                className="h-9 sm:w-40"
              >
                <option value="all">All statuses</option>
                <option value="valid">Valid</option>
                <option value="estimated">Estimated</option>
                <option value="corrected">Corrected</option>
                <option value="reset">Reset</option>
                <option value="disputed">Disputed</option>
              </Select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-sm text-muted-foreground sm:px-5">Loading…</div>
        ) : filteredReadings.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-5">
            {readings.length === 0 ? "No readings recorded yet." : "No readings match your filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Meter</th>
                  <th className="px-4 py-2.5 font-semibold">Account</th>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Previous</th>
                  <th className="px-4 py-2.5 font-semibold">Current</th>
                  <th className="px-4 py-2.5 font-semibold">Units</th>
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredReadings.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold sm:px-5">{meterNumber(r.meter_id)}</td>
                    <td className="px-4 py-3 text-brand-green">
                      {accountNumberForMeter(r.meter_id)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.reading_date}</td>
                    <td className="px-4 py-3 tabular-nums">{r.previous_reading_value ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{r.reading_value}</td>
                    <td className="px-4 py-3 tabular-nums">{r.units_consumed ?? "—"}</td>
                    <td className="px-4 py-3 sm:px-5">
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
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
