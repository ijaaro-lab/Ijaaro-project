import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCoverImage } from "@/components/listings/PropertyCoverImage";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/format";
import { formatPropertyTypeLabel } from "@/lib/propertyPhotos";
import { fetchPublicListingCovers } from "@/lib/publicListingPhotos";
import type { LandlordPublicListingSummary } from "@/types/database";

type Props = {
  tenantKey: string;
  accent?: string;
};

export function LandlordPublicListings({ tenantKey, accent = "#1fa85a" }: Props) {
  const [rows, setRows] = useState<LandlordPublicListingSummary[]>([]);
  const [coverByPropertyId, setCoverByPropertyId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setCoverByPropertyId({});
      const { data, error: err } = await supabase.rpc("list_landlord_public_listings", {
        p_tenant_key: tenantKey,
      });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows((data as LandlordPublicListingSummary[] | null) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantKey]);

  useEffect(() => {
    let cancelled = false;
    if (rows.length === 0) {
      setCoverByPropertyId({});
      return;
    }
    void (async () => {
      const covers = await fetchPublicListingCovers(
        tenantKey,
        rows.map((r) => r.id),
      );
      if (!cancelled) setCoverByPropertyId(covers);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, tenantKey]);

  if (loading) {
    return (
      <section
        className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 sm:px-6"
        id="available-homes"
        aria-busy="true"
        aria-label="Loading available properties"
      >
        <div className="mb-8">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Available properties
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Public listing details only. Sign in to apply — approval is required before private
            access.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
            >
              <div className="aspect-[16/10] animate-pulse bg-muted" />
              <div className="space-y-2.5 p-4">
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 sm:px-6" id="available-homes">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load listings. {error}
        </div>
      </section>
    );
  }

  return (
    <section className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 sm:px-6" id="available-homes">
      <div className="mb-8">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Available properties
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Public listing details only. Sign in to apply — approval is required before private
          access.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-10 text-center text-sm text-muted-foreground">
          No published available properties right now.
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => {
            const location =
              [p.district, p.city].filter(Boolean).join(", ") || "Location TBD";
            const title = p.name || "Property";
            return (
              <li key={p.id} className="h-full">
                <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-brand-blue/40 hover:shadow-md">
                  <PropertyCoverImage
                    url={coverByPropertyId[p.id] ?? null}
                    alt={`${title} cover photo`}
                    className="aspect-[16/10] w-full shrink-0"
                    imgClassName="transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                  <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {formatPropertyTypeLabel(p.property_type)}
                      </p>
                      {p.status ? (
                        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                          {p.status}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug text-foreground">
                      {title}
                    </h3>
                    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="line-clamp-1">{location}</span>
                    </p>
                    <p className="mt-auto pt-3 font-display text-lg font-bold tabular-nums text-foreground">
                      {p.rent_amount != null
                        ? money(p.rent_amount, p.currency)
                        : "Rent on request"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        to={`/listings/${p.id}?tenant=${encodeURIComponent(tenantKey)}`}
                        className="inline-flex"
                      >
                        <Button type="button" variant="outline" size="sm">
                          View details
                        </Button>
                      </Link>
                      <Link
                        to={`/apply?tenant=${encodeURIComponent(tenantKey)}&property=${encodeURIComponent(p.id)}`}
                        className="inline-flex"
                      >
                        <Button
                          type="button"
                          size="sm"
                          className="text-white"
                          style={{ backgroundColor: accent }}
                        >
                          Apply to Rent
                        </Button>
                      </Link>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
