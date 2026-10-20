import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FileText, Home, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { ExtraChargesConfig, UtilityAccount } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

type HouseAccount = UtilityAccount & {
  properties?: {
    id: string;
    name: string | null;
    address_line: string;
    city: string | null;
    district: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    status: string;
  } | null;
};

const emptyForm = {
  address_line: "",
  name: "",
  district: "",
  city: "",
  contact_phone: "",
  contact_email: "",
  account_number: "",
  monthly_amount: "",
  customer_email: "",
  meter_number: "",
};

/** Calendar month in the user's local timezone (avoid UTC shift from toISOString). */
function monthBounds(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  return { start, end };
}

function monthlyFee(account: UtilityAccount): number {
  const cfg = (account.extra_charges_config ?? {}) as ExtraChargesConfig;
  return Number(cfg.fixed_amount ?? 0);
}

export function ConnectionsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];
  const feeLabel = kind === "water" ? "Monthly water fee" : "Monthly electricity fee";
  const tenantSearch = activeMembership?.tenant.slug
    ? `?tenant=${encodeURIComponent(activeMembership.tenant.slug)}`
    : "";

  const [rows, setRows] = useState<HouseAccount[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [billingId, setBillingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("utility_accounts")
      .select(
        "*, properties(id, name, address_line, city, district, contact_phone, contact_email, status)",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else {
      setError(null);
      setRows((data as HouseAccount[]) ?? []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !matchesKind || !isStaff) {
      setLoading(false);
      return;
    }
    void load();
  }, [tenantId, matchesKind, isStaff, load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const h = r.properties;
      return [
        r.account_number,
        h?.name,
        h?.address_line,
        h?.district,
        h?.city,
        h?.contact_phone,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q]);

  const saveHouse = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    const amount = Number(form.monthly_amount);
    if (!form.address_line.trim() || !form.account_number.trim()) {
      setError("Address and account number are required");
      return;
    }
    if (Number.isNaN(amount) || amount < 0) {
      setError("Monthly fee must be a non-negative number");
      return;
    }

    setSaving(true);
    setError(null);
    setMsg(null);
    const { error: err } = await supabase.rpc("register_utility_house", {
      p_company_tenant_id: tenantId,
      p_address_line: form.address_line.trim(),
      p_account_number: form.account_number.trim(),
      p_monthly_amount: amount,
      p_name: form.name.trim() || null,
      p_district: form.district.trim() || null,
      p_city: form.city.trim() || null,
      p_contact_phone: form.contact_phone.trim() || null,
      p_contact_email: form.contact_email.trim() || null,
      p_customer_email: form.customer_email.trim() || null,
      p_meter_number: form.meter_number.trim() || null,
      p_property_type: "house",
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("House saved with monthly fee. You can issue a bill next.");
    setForm(emptyForm);
    setShowForm(false);
    await load();
  };

  const issueBill = async (accountId: string) => {
    const { start, end } = monthBounds();
    setBillingId(accountId);
    setError(null);
    setMsg(null);
    const { error: err } = await supabase.rpc("generate_flat_utility_bill", {
      p_utility_account_id: accountId,
      p_period_start: start,
      p_period_end: end,
      p_due_date: null,
    });
    setBillingId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg(`Bill issued for ${start} → ${end}. Collect payment under Payments.`);
  };

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
        Managing houses requires utility admin or staff access.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Houses</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Save a house, set the {feeLabel.toLowerCase()}, issue the bill, then collect payment.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={showForm ? "outline" : "primary"}
            onClick={() => {
              setShowForm((v) => !v);
              setError(null);
              setMsg(null);
            }}
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" /> Cancel
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Add house
              </>
            )}
          </Button>
          <Link
            to={`/app/${kind}/payments${tenantSearch}`}
            className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Payments
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {msg}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={saveHouse}
          className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]"
        >
          <div>
            <h3 className="font-display text-base font-semibold text-foreground">
              Add {label.toLowerCase()} house
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your company record — address and monthly fee. Customer email is optional.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="h-addr">Address *</Label>
              <Input
                id="h-addr"
                required
                value={form.address_line}
                onChange={(e) => setForm({ ...form, address_line: e.target.value })}
                placeholder="e.g. 12 Hodan Street"
              />
            </div>
            <div>
              <Label htmlFor="h-name">House name</Label>
              <Input
                id="h-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="h-acc">Account number *</Label>
              <Input
                id="h-acc"
                required
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                placeholder="e.g. W-1001"
              />
            </div>
            <div>
              <Label htmlFor="h-fee">{feeLabel} *</Label>
              <Input
                id="h-fee"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.monthly_amount}
                onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })}
                placeholder="20.00"
              />
            </div>
            <div>
              <Label htmlFor="h-phone">Contact phone</Label>
              <Input
                id="h-phone"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="h-dist">District</Label>
              <Input
                id="h-dist"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="h-city">City</Label>
              <Input
                id="h-city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="h-cust">Customer email (optional)</Label>
              <Input
                id="h-cust"
                type="email"
                value={form.customer_email}
                onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                placeholder="Must already have an account"
              />
            </div>
            <div>
              <Label htmlFor="h-meter">Meter number (optional)</Label>
              <Input
                id="h-meter"
                value={form.meter_number}
                onChange={(e) => setForm({ ...form, meter_number: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="h-email">Contact email (optional)</Label>
              <Input
                id="h-email"
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              />
            </div>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save house"}
          </Button>
        </form>
      )}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search house, address, account…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading houses…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Home className="mx-auto h-8 w-8 text-brand-water/70" />
          <p className="mt-3 text-sm font-medium text-foreground">No houses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click <span className="font-medium">Add house</span> to save address and monthly fee.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">House</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Account</th>
                <th className="px-4 py-3 font-semibold">Monthly fee</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => {
                const h = row.properties;
                const fee = monthlyFee(row);
                return (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {h?.name || h?.address_line || "House"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {h
                          ? [h.address_line, h.district, h.city].filter(Boolean).join(" · ")
                          : "Address restricted"}
                      </div>
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {row.account_number}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <Link
                        to={`/app/${kind}/customers/${row.id}${tenantSearch}`}
                        className="font-medium text-brand-blue hover:underline dark:text-brand-water"
                      >
                        {row.account_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {fee > 0 ? money(fee) : "—"}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={billingId === row.id || fee <= 0}
                        onClick={() => void issueBill(row.id)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {billingId === row.id ? "Issuing…" : "Issue bill"}
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
