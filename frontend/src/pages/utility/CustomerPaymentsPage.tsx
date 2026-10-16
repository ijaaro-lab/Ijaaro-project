import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { PaymentMethod, UtilityBill, UtilityPayment } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function CustomerPaymentsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isCustomer = activeMembership?.role === "utility_customer";
  const label = KIND_LABEL[kind];

  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [payments, setPayments] = useState<UtilityPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    utility_bill_id: "",
    amount: "",
    method: "mobile_money" as PaymentMethod,
    reference: "",
  });

  const load = async () => {
    if (!tenantId || !user) return;
    const { data: accounts, error: accErr } = await supabase
      .from("utility_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("customer_id", user.id);
    if (accErr) {
      setError(accErr.message);
      return;
    }
    const accountIds = (accounts ?? []).map((a) => a.id);
    const [byAccount, byResp, payRes] = await Promise.all([
      accountIds.length > 0
        ? supabase.from("utility_bills").select("*").in("utility_account_id", accountIds).gt("balance", 0)
        : Promise.resolve({ data: [] as UtilityBill[], error: null }),
      supabase.from("utility_bills").select("*").eq("tenant_id", tenantId).eq("responsible_party_id", user.id).gt("balance", 0),
      supabase.from("utility_payments").select("*").eq("tenant_id", tenantId).eq("payer_id", user.id).order("submitted_at", { ascending: false }),
    ]);
    if (byAccount.error || byResp.error || payRes.error) {
      setError(byAccount.error?.message || byResp.error?.message || payRes.error?.message || "Failed to load");
      return;
    }
    const merged = new Map<string, UtilityBill>();
    for (const b of [...(byAccount.data ?? []), ...(byResp.data ?? [])]) merged.set(b.id, b);
    const dueBills = Array.from(merged.values()).sort((a, b) => a.due_date.localeCompare(b.due_date));
    setBills(dueBills);
    setPayments(payRes.data ?? []);
    setError(null);
    if (!form.utility_bill_id && dueBills.length > 0) {
      setForm((f) => ({ ...f, utility_bill_id: dueBills[0].id, amount: String(dueBills[0].balance) }));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, user]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }
  if (!isCustomer) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        This page is for utility customer accounts.
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const bill = bills.find((b) => b.id === form.utility_bill_id);
    if (!bill) {
      setError("Select a bill");
      return;
    }
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Enter a valid payment amount");
      return;
    }
    if (amount > Number(bill.balance)) {
      setError("Amount exceeds outstanding balance");
      return;
    }

    setSaving(true);
    setError(null);
    setMsg(null);

    let proof_path: string | null = null;
    if (proofFile) {
      const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowed.includes(proofFile.type)) {
        setSaving(false);
        setError("Proof must be JPEG, PNG, WebP, or PDF");
        return;
      }
      if (proofFile.size > 5 * 1024 * 1024) {
        setSaving(false);
        setError("Proof must be 5MB or smaller");
        return;
      }
      const ext = proofFile.name.split(".").pop() || "bin";
      proof_path = `utility/${bill.tenant_id}/${bill.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("payment-proofs").upload(proof_path, proofFile, {
        contentType: proofFile.type,
        upsert: false,
      });
      if (upErr) {
        setSaving(false);
        setError(upErr.message);
        return;
      }
    }

    const { error: err } = await supabase.from("utility_payments").insert({
      utility_bill_id: bill.id,
      amount,
      method: form.method,
      reference: form.reference.trim() || null,
      proof_path,
      // trigger forces tenant_id/account_id/payer_id/status server-side
      status: "pending",
    });

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("Payment submitted as pending. The utility company must approve or reject it.");
    setProofFile(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">My {label.toLowerCase()} payments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Submissions start as pending. Only the utility company can approve or reject them.
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

      <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <Label>Bill</Label>
          <Select
            value={form.utility_bill_id}
            onChange={(e) => {
              const bill = bills.find((b) => b.id === e.target.value);
              setForm({ ...form, utility_bill_id: e.target.value, amount: bill ? String(bill.balance) : form.amount });
            }}
            required
          >
            <option value="">Select bill…</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                Due {b.due_date} · balance {money(b.balance)} ({b.status})
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <Label>Method</Label>
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
              <option value="mobile_money">Mobile money</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Reference</Label>
          <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        </div>
        <div>
          <Label>Payment proof (optional)</Label>
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <Button type="submit" disabled={saving || bills.length === 0}>
          {saving ? "Submitting…" : "Submit payment"}
        </Button>
      </form>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">History</h3>
        <ul className="mt-3 divide-y divide-border">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">{money(p.amount, p.currency)}</div>
                <div className="text-muted-foreground">{new Date(p.submitted_at).toLocaleString()}</div>
                {p.rejection_reason && <div className="text-red-700">Rejected: {p.rejection_reason}</div>}
              </div>
              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
            </li>
          ))}
          {payments.length === 0 && <li className="py-8 text-sm text-muted-foreground">No submissions yet.</li>}
        </ul>
      </section>
    </div>
  );
}
