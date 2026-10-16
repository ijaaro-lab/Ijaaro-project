import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { statusTone } from "@/lib/format";
import type { Meter, MeterStatus, UtilityAccount } from "@/types/database";
import { KIND_LABEL, KIND_SERVICE_TYPE, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function MetersPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff = activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];

  const [meters, setMeters] = useState<Meter[]>([]);
  const [accounts, setAccounts] = useState<UtilityAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ utility_account_id: "", meter_number: "", installed_at: "" });

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [metersRes, accountsRes] = await Promise.all([
      supabase.from("meters").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
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
        Meter management requires utility admin or staff access.
      </div>
    );
  }

  const accountNumber = (id: string) => accounts.find((a) => a.id === id)?.account_number ?? id.slice(0, 8) + "…";

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
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">{label} meters</h2>
        <p className="mt-1 text-sm text-muted-foreground">Meters registered to customer accounts.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      <form onSubmit={addMeter} className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-3">
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
            {saving ? "Adding…" : "Add meter"}
          </Button>
          {accounts.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Link a customer account first.</p>
          )}
        </div>
      </form>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : meters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No meters yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Meter</th>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Installed</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Change status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {meters.map((m) => (
                <tr key={m.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{m.meter_number}</td>
                  <td className="px-4 py-3">{accountNumber(m.utility_account_id)}</td>
                  <td className="px-4 py-3">{m.installed_at || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={m.status}
                      disabled={busyId === m.id}
                      onChange={(e) => void updateStatus(m.id, e.target.value as MeterStatus)}
                      className="h-8 w-auto"
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
    </div>
  );
}
