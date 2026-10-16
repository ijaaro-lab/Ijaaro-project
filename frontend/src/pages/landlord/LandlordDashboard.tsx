import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ClipboardList, CreditCard, Users } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { Property, RentPayment } from "@/types/database";

export function LandlordDashboard() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const [properties, setProperties] = useState<Property[]>([]);
  const [pending, setPending] = useState<RentPayment[]>([]);
  const [assignmentCount, setAssignmentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [propsRes, payRes, asgRes] = await Promise.all([
        supabase.from("properties").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
        supabase
          .from("rent_payments")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("status", "pending")
          .order("submitted_at", { ascending: false })
          .limit(8),
        supabase
          .from("rental_assignments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active"),
      ]);
      if (cancelled) return;
      if (propsRes.error || payRes.error || asgRes.error) {
        setError(propsRes.error?.message || payRes.error?.message || asgRes.error?.message || "Failed to load");
      } else {
        setError(null);
        setProperties(propsRes.data ?? []);
        setPending(payRes.data ?? []);
        setAssignmentCount(asgRes.count ?? 0);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (!tenantId || activeMembership?.tenant.tenant_type !== "landlord") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a landlord workspace membership to manage rental properties.
      </div>
    );
  }

  const available = properties.filter((p) => p.status === "available").length;
  const occupied = properties.filter((p) => p.status === "occupied").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link to="/app/landlord/payments">
          <Button variant="outline" size="sm">Review payments</Button>
        </Link>
        <Link to="/app/landlord/properties/new">
          <Button size="sm">Add property</Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading dashboard…</div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Properties" value={properties.length} icon={Building2} accent="navy" />
            <MetricCard label="Available" value={available} icon={ClipboardList} accent="green" />
            <MetricCard label="Occupied" value={occupied} icon={Users} accent="water" />
            <MetricCard label="Active tenancies" value={assignmentCount} icon={CreditCard} accent="warning" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold">Recent properties</h3>
                <Link to="/app/landlord/properties" className="text-sm text-brand-blue hover:underline">
                  View all
                </Link>
              </div>
              {properties.length === 0 ? (
                <div className="px-4 py-4 text-sm text-muted-foreground">No properties yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {properties.slice(0, 5).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link to={`/app/landlord/properties/${p.id}`} className="font-medium hover:underline">
                          {p.name || p.address_line}
                        </Link>
                        <div className="truncate text-muted-foreground">
                          {money(p.rent_amount, p.currency)} · {p.district || p.city || "—"}
                        </div>
                      </div>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold">Pending rent payments</h3>
                <Link to="/app/landlord/payments" className="text-sm text-brand-blue hover:underline">
                  Review queue
                </Link>
              </div>
              {pending.length === 0 ? (
                <div className="px-4 py-4 text-sm text-muted-foreground">No pending submissions.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {pending.map((pay) => (
                    <li key={pay.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div>
                        <div className="font-medium">{money(pay.amount, pay.currency)}</div>
                        <div className="text-muted-foreground">{pay.method.replaceAll("_", " ")}</div>
                      </div>
                      <Badge tone="warning">pending</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
