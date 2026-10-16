import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { Property } from "@/types/database";

export function PropertiesPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const [rows, setRows] = useState<Property[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("properties")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (err) setError(err.message);
      else {
        setError(null);
        setRows(data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (!tenantId || activeMembership?.tenant.tenant_type !== "landlord") {
    return <div className="text-sm text-muted-foreground">Landlord membership required.</div>;
  }

  const filtered = rows.filter((p) => {
    const hay = `${p.name ?? ""} ${p.address_line} ${p.district ?? ""} ${p.city ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Properties</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage listings in your landlord tenant.</p>
        </div>
        <Link to="/app/landlord/properties/new">
          <Button>New property</Button>
        </Link>
      </div>

      <Input
        placeholder="Search by name, address, district…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search properties"
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No properties match. Create your first listing to get started.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Property</th>
                <th className="px-4 py-3 font-semibold">Rent</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Listed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link to={`/app/landlord/properties/${p.id}`} className="font-medium hover:underline">
                      {p.name || p.address_line}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {p.address_line}
                      {p.district ? ` · ${p.district}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">{money(p.rent_amount, p.currency)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3">{p.is_listed ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
