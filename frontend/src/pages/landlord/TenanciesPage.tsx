import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { RentalAssignment } from "@/types/database";

export function TenanciesPage() {
  const { activeMembership } = useAuth();
  const [rows, setRows] = useState<RentalAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeMembership?.tenant_id) return;
    (async () => {
      const { data, error: err } = await supabase
        .from("rental_assignments")
        .select("*")
        .eq("tenant_id", activeMembership.tenant_id)
        .order("created_at", { ascending: false });
      if (err) setError(err.message);
      else setRows(data ?? []);
    })();
  }, [activeMembership?.tenant_id]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Tenancies</h2>
        <p className="mt-1 text-sm text-muted-foreground">Active and historical rental assignments.</p>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Assignment</th>
              <th className="px-4 py-3">Rent</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <Link to={`/app/landlord/tenancies/${r.id}`} className="font-medium hover:underline">
                    {r.id.slice(0, 8)}…
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    Property {r.property_id.slice(0, 8)}…
                  </div>
                </td>
                <td className="px-4 py-3">{money(r.rent_amount, r.currency)}</td>
                <td className="px-4 py-3">
                  {r.start_date}
                  {r.end_date ? ` → ${r.end_date}` : ""}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-5 py-10 text-sm text-muted-foreground">No tenancies yet.</div>
        )}
      </div>
    </div>
  );
}
