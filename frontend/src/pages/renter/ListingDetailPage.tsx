import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { Property } from "@/types/database";

export function ListingDetailPage() {
  const { id } = useParams();
  const [property, setProperty] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error: err } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
      if (err) setError(err.message);
      else setProperty(data);
    })();
  }, [id]);

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }
  if (!property) return <div className="text-sm text-muted-foreground">Loading listing…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/app/renter/browse" className="text-sm text-brand-blue hover:underline">
        ← Browse
      </Link>
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-3xl font-bold">{property.name || property.address_line}</h2>
          <Badge tone={statusTone(property.status)}>{property.status}</Badge>
        </div>
        <p className="mt-2 text-muted-foreground">{property.address_line}</p>
        <p className="mt-4 font-display text-2xl font-semibold text-brand-navy">
          {money(property.rent_amount, property.currency)}
        </p>
        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="font-medium">{property.property_type}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd className="font-medium">{[property.district, property.city].filter(Boolean).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Contact phone</dt>
            <dd className="font-medium">
              {property.contact_phone ? (
                <a className="text-brand-blue hover:underline" href={`tel:${property.contact_phone}`}>
                  {property.contact_phone}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Contact email</dt>
            <dd className="font-medium">
              {property.contact_email ? (
                <a className="text-brand-blue hover:underline" href={`mailto:${property.contact_email}`}>
                  {property.contact_email}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
        {property.description && <p className="mt-6 text-sm leading-relaxed">{property.description}</p>}
      </div>
    </div>
  );
}
