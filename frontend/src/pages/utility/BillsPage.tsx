import { useEffect, useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { brandingString } from "@/lib/uploadImage";
import { money, statusTone } from "@/lib/format";
import { openUtilityInvoice } from "@/lib/utilityInvoice";
import { supabase } from "@/lib/supabase";
import type { Meter, MeterReading, UtilityAccount, UtilityBill } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function BillsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff = activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];
  const branding = (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>;
  const companyName =
    brandingString(branding, "display_name") || activeMembership?.tenant.name || label;

  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [accounts, setAccounts] = useState<UtilityAccount[]>([]);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    meter_reading_id: "",
    period_start: "",
    period_end: "",
    due_date: "",
    unit_price: "",
  });

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [readingsRes, metersRes, accountsRes, billsRes] = await Promise.all([
      supabase
        .from("meter_readings")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("status", ["valid", "corrected", "reset"])
        .not("units_consumed", "is", null)
        .order("reading_date", { ascending: false })
        .limit(50),
      supabase.from("meters").select("*").eq("tenant_id", tenantId),
      supabase.from("utility_accounts").select("*").eq("tenant_id", tenantId),
      supabase.from("utility_bills").select("*").eq("tenant_id", tenantId).order("period_start", { ascending: false }),
    ]);
    if (readingsRes.error || metersRes.error || accountsRes.error || billsRes.error) {
      setError(
        readingsRes.error?.message || metersRes.error?.message || accountsRes.error?.message || billsRes.error?.message || "Failed to load",
      );
    } else {
      setError(null);
      setReadings(readingsRes.data ?? []);
      setMeters(metersRes.data ?? []);
      setAccounts(accountsRes.data ?? []);
      setBills(billsRes.data ?? []);
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
        Generating bills requires utility admin or staff access.
      </div>
    );
  }

  const billedReadingIds = new Set(bills.map((b) => b.meter_reading_id));
  const billableReadings = readings.filter((r) => !billedReadingIds.has(r.id));

  const describeReading = (r: MeterReading) => {
    const meter = meters.find((m) => m.id === r.meter_id);
    const account = accounts.find((a) => a.id === meter?.utility_account_id);
    return `${meter?.meter_number ?? r.meter_id.slice(0, 8)} · ${account?.account_number ?? "—"} · ${r.reading_date} · ${r.units_consumed} units`;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.meter_reading_id || !form.period_start || !form.period_end) {
      setError("Select a reading and billing period");
      return;
    }
    const overridePrice = form.unit_price.trim() === "" ? null : Number(form.unit_price);
    if (overridePrice != null && (Number.isNaN(overridePrice) || overridePrice < 0)) {
      setError("Unit price override must be a non-negative number");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc("generate_utility_bill", {
      p_meter_reading_id: form.meter_reading_id,
      p_period_start: form.period_start,
      p_period_end: form.period_end,
      p_due_date: form.due_date || null,
      p_unit_price: overridePrice,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("Bill generated.");
    setForm({ meter_reading_id: "", period_start: "", period_end: "", due_date: "", unit_price: "" });
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">{label} bills</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate bills from accepted meter readings. Total = (units × unit price) + extra charges.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="reading">Meter reading</Label>
          <Select
            id="reading"
            required
            value={form.meter_reading_id}
            onChange={(e) => setForm({ ...form, meter_reading_id: e.target.value })}
          >
            <option value="">Select reading…</option>
            {billableReadings.map((r) => (
              <option key={r.id} value={r.id}>
                {describeReading(r)}
              </option>
            ))}
          </Select>
          {billableReadings.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              No un-billed valid/corrected/reset readings available. Record a reading first.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="ps">Period start</Label>
          <Input
            id="ps"
            type="date"
            required
            value={form.period_start}
            onChange={(e) => setForm({ ...form, period_start: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="pe">Period end</Label>
          <Input
            id="pe"
            type="date"
            required
            value={form.period_end}
            onChange={(e) => setForm({ ...form, period_end: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="due">Due date (optional, defaults to period end + 14 days)</Label>
          <Input id="due" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="up">Unit price override (optional)</Label>
          <Input
            id="up"
            type="number"
            min="0"
            step="0.0001"
            value={form.unit_price}
            onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={saving || billableReadings.length === 0}>
            {saving ? "Generating…" : "Generate bill"}
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : bills.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No bills generated yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Period</th>
                <th className="px-4 py-3 font-semibold">Units</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Balance</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bills.map((b) => {
                const account = accounts.find((a) => a.id === b.utility_account_id);
                return (
                  <tr key={b.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      {b.period_start} → {b.period_end}
                    </td>
                    <td className="px-4 py-3">{b.units_consumed}</td>
                    <td className="px-4 py-3">{money(b.total_amount)}</td>
                    <td className="px-4 py-3">{money(b.balance)}</td>
                    <td className="px-4 py-3">{b.due_date}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          openUtilityInvoice({
                            bill: b,
                            kind,
                            companyName,
                            accountNumber: account?.account_number,
                          })
                        }
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
