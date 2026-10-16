import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { Property, PropertyType } from "@/types/database";

export function BrowseListingsPage() {
  const [rows, setRows] = useState<Property[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [district, setDistrict] = useState("");
  const [maxRent, setMaxRent] = useState("");
  const [type, setType] = useState<PropertyType | "">("");

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from("properties")
        .select("*")
        .eq("is_listed", true)
        .eq("status", "available")
        .order("created_at", { ascending: false });
      if (err) setError(err.message);
      else setRows(data ?? []);
    })();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (district && !(p.district ?? "").toLowerCase().includes(district.toLowerCase())) return false;
      if (type && p.property_type !== type) return false;
      if (maxRent && (p.rent_amount == null || Number(p.rent_amount) > Number(maxRent))) return false;
      return true;
    });
  }, [rows, district, maxRent, type]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Browse available properties</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Public listing fields only. Contact the landlord to request assignment.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input placeholder="District" value={district} onChange={(e) => setDistrict(e.target.value)} />
        <Input
          placeholder="Max rent"
          type="number"
          min="0"
          value={maxRent}
          onChange={(e) => setMaxRent(e.target.value)}
        />
        <Select value={type} onChange={(e) => setType(e.target.value as PropertyType | "")}>
          <option value="">All types</option>
          <option value="apartment">Apartment</option>
          <option value="house">House</option>
          <option value="shop">Shop</option>
          <option value="office">Office</option>
          <option value="other">Other</option>
        </Select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <Link
            key={p.id}
            to={`/app/renter/browse/${p.id}`}
            className="rounded-xl border border-border bg-card p-5 transition hover:border-brand-blue/40 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">{p.name || p.address_line}</h3>
              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {p.district || p.city || "—"} · {p.property_type}
            </p>
            <p className="mt-3 font-semibold text-brand-navy">{money(p.rent_amount, p.currency)}</p>
          </Link>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No available listings match your filters.
        </div>
      )}
    </div>
  );
}
