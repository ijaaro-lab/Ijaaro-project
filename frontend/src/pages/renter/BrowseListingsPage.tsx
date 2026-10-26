import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, MapPin } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PropertyCoverImage } from "@/components/listings/PropertyCoverImage";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import { fetchCoverPathsForProperties, formatPropertyTypeLabel } from "@/lib/propertyPhotos";
import { resolvePortalTenantKey } from "@/lib/tenant";
import type { LandlordPublicListingSummary, PropertyType } from "@/types/database";

const MISSING_TENANT_MESSAGE =
  "Missing workspace. Open the renter portal with ?tenant=<slug> so listings stay scoped to this landlord.";

export function BrowseListingsPage() {
  const { activeMembership } = useAuth();
  const location = useLocation();
  const tenantKey = resolvePortalTenantKey({
    membershipSlug: activeMembership?.tenant.slug,
    membershipSubdomain: activeMembership?.tenant.subdomain,
    search: location.search,
  });

  const [rows, setRows] = useState<LandlordPublicListingSummary[]>([]);
  const [coverByPropertyId, setCoverByPropertyId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [district, setDistrict] = useState("");
  const [maxRent, setMaxRent] = useState("");
  const [type, setType] = useState<PropertyType | "">("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setRows([]);
      setCoverByPropertyId({});

      if (!tenantKey) {
        if (!cancelled) {
          setError(MISSING_TENANT_MESSAGE);
          setLoading(false);
        }
        return;
      }

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
    const tenantId = activeMembership?.tenant_id;
    if (!tenantId || rows.length === 0) {
      setCoverByPropertyId({});
      return;
    }
    void (async () => {
      const covers = await fetchCoverPathsForProperties(
        tenantId,
        rows.map((r) => r.id),
      );
      if (!cancelled) setCoverByPropertyId(covers);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, activeMembership?.tenant_id]);

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (district && !(p.district ?? "").toLowerCase().includes(district.toLowerCase())) return false;
      if (type && p.property_type !== type) return false;
      if (maxRent && (p.rent_amount == null || Number(p.rent_amount) > Number(maxRent))) return false;
      return true;
    });
  }, [rows, district, maxRent, type]);

  const locationLabel = (p: LandlordPublicListingSummary) =>
    [p.district, p.city].filter(Boolean).join(", ") || "Location TBD";

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <h2 className="font-display text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">
          Find your next home
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Browse available rentals from this landlord. Open a listing for the full address and
          inquiry contacts.
        </p>
      </header>

      <section
        aria-label="Listing filters"
        className="rounded-xl border border-border bg-card p-3.5 shadow-sm sm:p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          <div className="min-w-0">
            <Label htmlFor="browse-district">District</Label>
            <Input
              id="browse-district"
              placeholder="District"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="browse-max-rent">Max rent</Label>
            <Input
              id="browse-max-rent"
              placeholder="Max rent"
              type="number"
              min="0"
              value={maxRent}
              onChange={(e) => setMaxRent(e.target.value)}
            />
          </div>
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="browse-property-type">Property type</Label>
            <Select
              id="browse-property-type"
              value={type}
              onChange={(e) => setType(e.target.value as PropertyType | "")}
            >
              <option value="">All types</option>
              <option value="apartment">Apartment</option>
              <option value="house">House</option>
              <option value="shop">Shop</option>
              <option value="office">Office</option>
              <option value="other">Other</option>
            </Select>
          </div>
        </div>
      </section>

      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label="Loading listings"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
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
      ) : (
        <>
          {!error && (
            <p className="text-sm text-muted-foreground" data-testid="browse-result-count">
              {filtered.length === 1 ? "1 property" : `${filtered.length} properties`}
              {rows.length !== filtered.length ? " match your filters" : " available"}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => {
              const title = p.name || locationLabel(p);
              const coverPath = coverByPropertyId[p.id] ?? null;
              return (
                <Link
                  key={p.id}
                  to={`/app/renter/browse/${p.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-brand-blue/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PropertyCoverImage
                    storagePath={coverPath}
                    alt={`${title} cover photo`}
                    className="aspect-[16/10] w-full shrink-0"
                    imgClassName="transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                  <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug text-brand-navy transition-colors group-hover:text-brand-blue sm:text-lg">
                        {title}
                      </h3>
                      <Badge tone={statusTone(p.status)} className="mt-0.5 shrink-0 capitalize">
                        {p.status}
                      </Badge>
                    </div>
                    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="line-clamp-1">{locationLabel(p)}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatPropertyTypeLabel(p.property_type)}
                    </p>
                    <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/70 pt-3">
                      <p className="font-display text-lg font-bold tabular-nums text-brand-navy sm:text-xl">
                        {money(p.rent_amount, p.currency)}
                      </p>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue">
                        View details
                        <ArrowRight
                          className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {!error && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <p className="font-display text-lg font-semibold text-brand-navy">No matching homes</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                No available listings match your filters. Try widening district, rent, or type.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
