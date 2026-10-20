import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { statusTone } from "@/lib/format";
import type { Meter, MeterReading, ReadingStatus, UtilityAccount } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

const correctionStatuses: ReadingStatus[] = ["corrected", "reset"];

export function ReadingsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff = activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];

  const [meters, setMeters] = useState<Meter[]>([]);
  const [accounts, setAccounts] = useState<UtilityAccount[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    meter_id: "",
    reading_value: "",
    reading_date: (() => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })(),
    status: "valid" as ReadingStatus,
    correction_reason: "",
    notes: "",
  });

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [metersRes, accountsRes, readingsRes] = await Promise.all([
      supabase.from("meters").select("*").eq("tenant_id", tenantId).eq("status", "active").order("meter_number"),
      supabase.from("utility_accounts").select("*").eq("tenant_id", tenantId),
      supabase
        .from("meter_readings")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    if (metersRes.error || accountsRes.error || readingsRes.error) {
      setError(metersRes.error?.message || accountsRes.error?.message || readingsRes.error?.message || "Failed to load");
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

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Recording readings requires utility admin or staff access.
      </div>
    );
  }

  const accountNumberForMeter = (meterId: string) => {
    const meter = meters.find((m) => m.id === meterId);
    const account = accounts.find((a) => a.id === meter?.utility_account_id);
    return account?.account_number ?? meter?.utility_account_id.slice(0, 8) ?? "—";
  };

  const meterNumber = (meterId: string) => meters.find((m) => m.id === meterId)?.meter_number ?? meterId.slice(0, 8) + "…";

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
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">{label} meter readings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Record new readings and review recent history.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-3">
        <div className="sm:col-span-3 sm:max-w-sm">
          <Label htmlFor="meter">Meter</Label>
          <Select id="meter" required value={form.meter_id} onChange={(e) => setForm({ ...form, meter_id: e.target.value })}>
            <option value="">Select meter…</option>
            {meters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.meter_number} ({accountNumberForMeter(m.id)})
              </option>
            ))}
          </Select>
          {meters.length === 0 && <p className="mt-1 text-xs text-muted-foreground">No active meters yet.</p>}
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
          <Select id="status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ReadingStatus })}>
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
          <Input id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Recording…" : "Record reading"}
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Meter</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Previous</th>
                <th className="px-4 py-3 font-semibold">Current</th>
                <th className="px-4 py-3 font-semibold">Units</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {readings.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{meterNumber(r.meter_id)}</td>
                  <td className="px-4 py-3">{r.reading_date}</td>
                  <td className="px-4 py-3">{r.previous_reading_value ?? "—"}</td>
                  <td className="px-4 py-3">{r.reading_value}</td>
                  <td className="px-4 py-3">{r.units_consumed ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {readings.length === 0 && (
            <div className="px-5 py-10 text-sm text-muted-foreground">No readings recorded yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
