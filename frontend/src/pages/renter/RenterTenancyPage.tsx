import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { Property, RentCharge, RentalAssignment } from "@/types/database";

export function RenterTenancyPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<RentalAssignment | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      const { data, error: err } = await supabase
        .from("rental_assignments")
        .select("*")
        .eq("id", id)
        .eq("renter_id", user.id)
        .maybeSingle();
      if (err || !data) {
        setError(err?.message || "Tenancy not found");
        return;
      }
      setAssignment(data);
      const [p, c] = await Promise.all([
        supabase.from("properties").select("*").eq("id", data.property_id).maybeSingle(),
        supabase.from("rent_charges").select("*").eq("assignment_id", data.id).order("due_date"),
      ]);
      setProperty(p.data);
      setCharges(c.data ?? []);
    })();
  }, [id, user]);

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }
  if (!assignment) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/renter" className="text-sm text-brand-blue hover:underline">
          ← Renter home
        </Link>
        <h2 className="mt-2 font-display text-2xl font-bold">My tenancy</h2>
        <div className="mt-2 flex gap-2">
          <Badge tone={statusTone(assignment.status)}>{assignment.status}</Badge>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 text-sm">
        <div className="font-medium">{property?.name || property?.address_line || "Property"}</div>
        <div className="mt-1 text-muted-foreground">{property?.address_line}</div>
        <div className="mt-3">
          Rent {money(assignment.rent_amount, assignment.currency)} · started {assignment.start_date}
          {assignment.end_date ? ` · ended ${assignment.end_date}` : ""}
        </div>
        <div className="mt-4">
          <Link to="/app/renter/payments" className="text-brand-blue hover:underline">
            Submit a rent payment
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Rent schedule</h3>
        <ul className="mt-3 divide-y divide-border">
          {charges.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">
                  {c.period_start} → {c.period_end}
                </div>
                <div className="text-muted-foreground">
                  Due {c.due_date} · balance {money(c.balance)}
                </div>
              </div>
              <Badge tone={statusTone(c.status)}>{c.status}</Badge>
            </li>
          ))}
          {charges.length === 0 && <li className="py-8 text-sm text-muted-foreground">No charges yet.</li>}
        </ul>
      </section>
    </div>
  );
}
