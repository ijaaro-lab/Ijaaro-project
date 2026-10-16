import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { RentCharge, RentPayment, RentalAssignment } from "@/types/database";

export function TenancyDetailPage() {
  const { id } = useParams();
  const [assignment, setAssignment] = useState<RentalAssignment | null>(null);
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chargeForm, setChargeForm] = useState({
    period_start: "",
    period_end: "",
    due_date: "",
    amount_due: "",
  });

  const load = async () => {
    if (!id) return;
    const [a, c, p] = await Promise.all([
      supabase.from("rental_assignments").select("*").eq("id", id).maybeSingle(),
      supabase.from("rent_charges").select("*").eq("assignment_id", id).order("due_date"),
      supabase.from("rent_payments").select("*").eq("assignment_id", id).order("submitted_at", { ascending: false }),
    ]);
    if (a.error) setError(a.error.message);
    setAssignment(a.data);
    setCharges(c.data ?? []);
    setPayments(p.data ?? []);
    if (a.data) {
      setChargeForm((f) => ({
        ...f,
        amount_due: String(a.data!.rent_amount),
      }));
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const createCharge = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignment) return;
    const amount = chargeForm.amount_due ? Number(chargeForm.amount_due) : null;
    const { error: err } = await supabase.rpc("create_rent_charge", {
      p_assignment_id: assignment.id,
      p_period_start: chargeForm.period_start,
      p_period_end: chargeForm.period_end,
      p_due_date: chargeForm.due_date,
      p_amount_due: amount,
    });
    if (err) setError(err.message);
    else {
      setError(null);
      await load();
    }
  };

  if (!assignment) {
    return <div className="text-sm text-muted-foreground">Tenancy not found or unauthorized.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/landlord/tenancies" className="text-sm text-brand-blue hover:underline">
          ← Tenancies
        </Link>
        <h2 className="mt-2 font-display text-2xl font-bold">Tenancy details</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone={statusTone(assignment.status)}>{assignment.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {assignment.start_date}
            {assignment.end_date ? ` → ${assignment.end_date}` : " → present"}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 text-sm">
        Rent {money(assignment.rent_amount, assignment.currency)} · due day {assignment.due_day ?? "—"}
        <div className="mt-2">
          <Link to={`/app/landlord/properties/${assignment.property_id}`} className="text-brand-blue hover:underline">
            Open property
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Rent charges</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Period</th>
                <th className="py-2 pr-3">Due</th>
                <th className="py-2 pr-3">Due amt</th>
                <th className="py-2 pr-3">Paid</th>
                <th className="py-2 pr-3">Balance</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {charges.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-3">
                    {c.period_start} → {c.period_end}
                  </td>
                  <td className="py-2 pr-3">{c.due_date}</td>
                  <td className="py-2 pr-3">{money(c.amount_due)}</td>
                  <td className="py-2 pr-3">{money(c.amount_paid)}</td>
                  <td className="py-2 pr-3">{money(c.balance)}</td>
                  <td className="py-2">
                    <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {charges.length === 0 && <p className="text-sm text-muted-foreground">No charges yet.</p>}
        </div>

        {assignment.status === "active" && (
          <form onSubmit={createCharge} className="mt-6 grid max-w-2xl gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <Label>Period start</Label>
              <Input
                type="date"
                required
                value={chargeForm.period_start}
                onChange={(e) => setChargeForm({ ...chargeForm, period_start: e.target.value })}
              />
            </div>
            <div>
              <Label>Period end</Label>
              <Input
                type="date"
                required
                value={chargeForm.period_end}
                onChange={(e) => setChargeForm({ ...chargeForm, period_end: e.target.value })}
              />
            </div>
            <div>
              <Label>Due date</Label>
              <Input
                type="date"
                required
                value={chargeForm.due_date}
                onChange={(e) => setChargeForm({ ...chargeForm, due_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Amount due</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={chargeForm.amount_due}
                onChange={(e) => setChargeForm({ ...chargeForm, amount_due: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Add rent charge</Button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Payment history</h3>
        <ul className="mt-3 divide-y divide-border">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">{money(p.amount, p.currency)}</div>
                <div className="text-muted-foreground">
                  {p.method.replaceAll("_", " ")} · {new Date(p.submitted_at).toLocaleString()}
                </div>
              </div>
              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
            </li>
          ))}
          {payments.length === 0 && <li className="py-6 text-sm text-muted-foreground">No payments yet.</li>}
        </ul>
      </section>
    </div>
  );
}
