import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CreditCard, Search } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { RentCharge, RentPayment, RentalAssignment } from "@/types/database";

export function RenterDashboard() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<RentalAssignment[]>([]);
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [a, c, p] = await Promise.all([
        supabase.from("rental_assignments").select("*").eq("renter_id", user.id).order("created_at", { ascending: false }),
        supabase.from("rent_charges").select("*").eq("renter_id", user.id).neq("status", "paid").order("due_date"),
        supabase
          .from("rent_payments")
          .select("*")
          .eq("payer_id", user.id)
          .order("submitted_at", { ascending: false })
          .limit(5),
      ]);
      if (a.error || c.error || p.error) {
        setError(a.error?.message || c.error?.message || p.error?.message || "Load failed");
      } else {
        setAssignments(a.data ?? []);
        setCharges(c.data ?? []);
        setPayments(p.data ?? []);
      }
    })();
  }, [user]);

  const active = assignments.filter((a) => a.status === "active").length;
  const outstanding = charges.reduce((sum, c) => sum + Number(c.balance), 0);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link to="/app/renter/browse">
          <Button size="sm">
            <Search className="h-4 w-4" />
            Browse listings
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <MetricCard label="Active tenancies" value={active} icon={Building2} accent="navy" />
        <MetricCard label="Open balance" value={money(outstanding)} icon={CreditCard} accent="warning" />
        <MetricCard label="Recent payments" value={payments.length} icon={CreditCard} accent="green" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Open rent charges</h3>
            <Link to="/app/renter/payments" className="text-sm text-brand-blue hover:underline">
              Pay / history
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {charges.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <div className="font-medium">Due {c.due_date}</div>
                  <div className="text-muted-foreground">Balance {money(c.balance)}</div>
                </div>
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
              </li>
            ))}
            {charges.length === 0 && (
              <li className="px-4 py-4 text-sm text-muted-foreground">No open charges.</li>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">My tenancies</h3>
          </div>
          <ul className="divide-y divide-border">
            {assignments.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <Link to={`/app/renter/tenancy/${a.id}`} className="font-medium hover:underline">
                    {money(a.rent_amount, a.currency)} / period
                  </Link>
                  <div className="text-muted-foreground">Started {a.start_date}</div>
                </div>
                <Badge tone={statusTone(a.status)}>{a.status}</Badge>
              </li>
            ))}
            {assignments.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted-foreground">No tenancies yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
