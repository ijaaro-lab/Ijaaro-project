import { useEffect, useState, type FormEvent } from "react";
import { Download, Send } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { brandingString } from "@/lib/uploadImage";
import { money, paymentStatusLabel, statusTone } from "@/lib/format";
import { openUtilityInvoice } from "@/lib/utilityInvoice";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { PaymentMethod, UtilityBill, UtilityPayment } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function CustomerPaymentsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isCustomer = activeMembership?.role === "utility_customer";
  const label = KIND_LABEL[kind];
  const branding = (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>;
  const companyName =
    brandingString(branding, "display_name") || activeMembership?.tenant.name || label;

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
        ? supabase
            .from("utility_bills")
            .select("*")
            .in("utility_account_id", accountIds)
            .gt("balance", 0)
        : Promise.resolve({ data: [] as UtilityBill[], error: null }),
      supabase
        .from("utility_bills")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("responsible_party_id", user.id)
        .gt("balance", 0),
      supabase
        .from("utility_payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("payer_id", user.id)
        .order("submitted_at", { ascending: false }),
    ]);
    if (byAccount.error || byResp.error || payRes.error) {
      setError(
        byAccount.error?.message || byResp.error?.message || payRes.error?.message || "Failed to load",
      );
      return;
    }
    const merged = new Map<string, UtilityBill>();
    for (const b of [...(byAccount.data ?? []), ...(byResp.data ?? [])]) merged.set(b.id, b);
    const dueBills = Array.from(merged.values()).sort((a, b) => a.due_date.localeCompare(b.due_date));
    setBills(dueBills);
    setPayments(payRes.data ?? []);
    setError(null);
    if (!form.utility_bill_id && dueBills.length > 0) {
      setForm((f) => ({
        ...f,
        utility_bill_id: dueBills[0].id,
        amount: String(dueBills[0].balance),
      }));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, user]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }
  if (!isCustomer) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
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
    <div className="space-y-5">
      <div>
        <p
          className={cn(
            "text-[11px] font-semibold tracking-[0.08em]",
            kind === "water" ? "text-brand-water" : "text-brand-power",
          )}
        >
          {label} · Payments
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Record a payment
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Submit proof for an open bill. Company staff will approve or reject it.
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

      <form
        onSubmit={onSubmit}
        className="max-w-2xl space-y-4 rounded-2xl border border-brand-green/35 bg-card p-5 dark:border-brand-green/40"
      >
        <div>
          <Label>Bill</Label>
          <Select
            value={form.utility_bill_id}
            onChange={(e) => {
              const bill = bills.find((b) => b.id === e.target.value);
              setForm({
                ...form,
                utility_bill_id: e.target.value,
                amount: bill ? String(bill.balance) : form.amount,
              });
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
            <Select
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}
            >
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
          <Input
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            placeholder="Transaction / receipt number"
          />
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
          <Send className="h-4 w-4" />
          {saving ? "Submitting…" : "Submit payment"}
        </Button>
      </form>

      <section className="overflow-hidden rounded-2xl border border-brand-green/35 bg-card dark:border-brand-green/40">
        <div className="border-b border-border/70 px-4 py-3.5 sm:px-5">
          <h3 className="font-display text-sm font-semibold text-foreground">Payment history</h3>
          <p className="text-xs text-muted-foreground">Your submissions and invoice downloads</p>
        </div>
        {payments.length === 0 ? (
          <div className="px-4 py-10 text-sm text-muted-foreground sm:px-5">No submissions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Amount</th>
                  <th className="px-4 py-2.5 font-semibold">Submitted</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-right sm:px-5">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {payments.map((p) => {
                  const bill = bills.find((b) => b.id === p.utility_bill_id);
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-semibold tabular-nums sm:px-5">
                        {money(p.amount, p.currency)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(p.submitted_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(p.status)}>{paymentStatusLabel(p.status)}</Badge>
                        {p.rejection_reason ? (
                          <div className="mt-1 text-xs text-red-600 dark:text-red-300">
                            {p.rejection_reason}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right sm:px-5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!bill}
                          onClick={() => {
                            if (!bill) return;
                            openUtilityInvoice({ bill, kind, companyName });
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Invoice
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
