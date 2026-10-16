import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { PaymentMethod, RentCharge, RentPayment } from "@/types/database";

export function RenterPaymentsPage() {
  const { user } = useAuth();
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    rent_charge_id: "",
    amount: "",
    method: "mobile_money" as PaymentMethod,
    reference: "",
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    const [c, p] = await Promise.all([
      supabase
        .from("rent_charges")
        .select("*")
        .eq("renter_id", user.id)
        .gt("balance", 0)
        .order("due_date"),
      supabase
        .from("rent_payments")
        .select("*")
        .eq("payer_id", user.id)
        .order("submitted_at", { ascending: false }),
    ]);
    if (c.error || p.error) setError(c.error?.message || p.error?.message || "Load failed");
    else {
      setCharges(c.data ?? []);
      setPayments(p.data ?? []);
      if (!form.rent_charge_id && (c.data?.length ?? 0) > 0) {
        setForm((f) => ({
          ...f,
          rent_charge_id: c.data![0].id,
          amount: String(c.data![0].balance),
        }));
      }
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const charge = charges.find((c) => c.id === form.rent_charge_id);
    if (!charge) {
      setError("Select a rent charge");
      return;
    }
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Enter a valid payment amount");
      return;
    }
    if (amount > Number(charge.balance)) {
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
      proof_path = `${charge.tenant_id}/${charge.assignment_id}/${crypto.randomUUID()}.${ext}`;
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

    const { error: err } = await supabase.from("rent_payments").insert({
      rent_charge_id: charge.id,
      amount,
      method: form.method,
      reference: form.reference.trim() || null,
      proof_path,
      // server trigger forces pending + payer + tenant linkage
      tenant_id: charge.tenant_id,
      property_id: charge.property_id,
      assignment_id: charge.assignment_id,
      payer_id: user.id,
      status: "pending",
    });

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("Payment submitted as pending. A landlord reviewer must approve or reject it.");
    setProofFile(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Rent payments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Submissions start as pending. You cannot approve your own payment.
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
          <Label>Rent charge</Label>
          <Select
            value={form.rent_charge_id}
            onChange={(e) => {
              const charge = charges.find((c) => c.id === e.target.value);
              setForm({
                ...form,
                rent_charge_id: e.target.value,
                amount: charge ? String(charge.balance) : form.amount,
              });
            }}
            required
          >
            <option value="">Select charge…</option>
            {charges.map((c) => (
              <option key={c.id} value={c.id}>
                Due {c.due_date} · balance {money(c.balance)} ({c.status})
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
        <Button type="submit" disabled={saving || charges.length === 0}>
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
