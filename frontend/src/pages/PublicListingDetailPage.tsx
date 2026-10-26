import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  ChefHat,
  FileText,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PropertyImageGallery,
  type GalleryImage,
} from "@/components/listings/PropertyImageGallery";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import { formatPropertyTypeLabel } from "@/lib/propertyPhotos";
import { fetchPublicListingGallery } from "@/lib/publicListingPhotos";
import type { LandlordPublicListing } from "@/types/database";

const MISSING = "Lama sheegin";

function displayText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : MISSING;
}

/** Missing numbers → Lama sheegin; never invent 0 when the value is null/undefined. */
function displayCount(value: number | null | undefined, unit?: string): string {
  if (value == null || Number.isNaN(Number(value))) return MISSING;
  const n = Number(value);
  return unit ? `${n} ${unit}` : String(n);
}

function formatAvailabilityLabel(status: string | null | undefined): string {
  const raw = status?.trim();
  if (!raw) return MISSING;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function buildLocationLine(listing: LandlordPublicListing): string | null {
  const districtCity = [listing.district, listing.city]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(", ");
  const neighborhood = listing.neighborhood?.trim();
  if (districtCity && neighborhood) {
    return `${districtCity} · Xaafadda ${neighborhood}`;
  }
  if (districtCity) return districtCity;
  if (neighborhood) return `Xaafadda ${neighborhood}`;
  return null;
}

type DetailRowProps = {
  label: string;
  value: string;
  icon?: ReactNode;
  wide?: boolean;
};

function DetailRow({ label, value, icon, wide }: DetailRowProps) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function PublicListingDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const tenantKey = params.get("tenant")?.trim().toLowerCase() || "";

  const [listing, setListing] = useState<LandlordPublicListing | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!id || !tenantKey) {
      setLoading(false);
      setUnavailable(true);
      setGalleryImages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setUnavailable(false);
      setGalleryImages([]);
      const { data, error: err } = await supabase.rpc("get_landlord_public_listing", {
        p_tenant_key: tenantKey,
        p_property_id: id,
      });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setListing(null);
        setLoading(false);
        return;
      }
      const row = (data as LandlordPublicListing[] | null)?.[0] ?? null;
      setListing(row);
      setUnavailable(!row);
      setLoading(false);

      if (!row) return;

      const photos = await fetchPublicListingGallery(tenantKey, row.id);
      if (cancelled) return;
      setGalleryImages(
        photos.map((ph) => ({
          id: ph.id,
          url: ph.url,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [id, tenantKey]);

  const backToHomes = (
    <Link
      to={`/?tenant=${encodeURIComponent(tenantKey)}#available-homes`}
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to available properties
    </Link>
  );

  const backToWorkspace = (
    <Link
      to={`/?tenant=${encodeURIComponent(tenantKey)}`}
      className="mt-4 inline-flex rounded-md text-sm text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      ← Back to workspace
    </Link>
  );

  if (!tenantKey) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-muted-foreground">
        Missing workspace. Open the landlord site with{" "}
        <code className="text-foreground">?tenant=&lt;slug&gt;</code>.
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6"
        aria-busy="true"
        aria-label="Loading listing"
      >
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        <div className="aspect-[16/10] w-full animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-3">
            <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
          </div>
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
        {backToWorkspace}
      </div>
    );
  }

  if (unavailable || !listing) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-muted-foreground">
        This listing is not available.
        <div>{backToWorkspace}</div>
      </div>
    );
  }

  const title = listing.name?.trim() || "Property";
  const locationLine = buildLocationLine(listing);
  const hasInquiry = Boolean(listing.contact_phone || listing.contact_email);
  const propertyTypeLabel = formatPropertyTypeLabel(listing.property_type);
  const availabilityLabel = formatAvailabilityLabel(listing.status);
  const description = listing.description?.trim() || null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {backToHomes}

        <PropertyImageGallery images={galleryImages} propertyName={title} />

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-8 lg:p-8">
            <div className="min-w-0 space-y-5">
              <header className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {propertyTypeLabel}
                  </span>
                  <Badge tone={statusTone(listing.status)} className="capitalize">
                    {availabilityLabel}
                  </Badge>
                </div>
                <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {title}
                </h1>
                {locationLine ? (
                  <p className="flex items-start gap-1.5 text-sm text-muted-foreground sm:text-base">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{locationLine}</span>
                  </p>
                ) : null}
              </header>

              <section
                className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5"
                aria-labelledby="listing-details-heading"
              >
                <h2
                  id="listing-details-heading"
                  className="font-display text-base font-semibold text-foreground"
                >
                  Faahfaahinta guriga
                </h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4">
                  <DetailRow
                    label="Tirada qolalka jiifka"
                    value={displayCount(listing.bedrooms, "qol")}
                    icon={<BedDouble className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  />
                  <DetailRow
                    label="Tirada jikada"
                    value={displayCount(listing.kitchens)}
                    icon={<ChefHat className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  />
                  <DetailRow
                    label="Tirada musqulaha"
                    value={displayCount(listing.bathrooms)}
                    icon={<Bath className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  />
                  <DetailRow
                    label="Nooca guriga"
                    value={displayText(propertyTypeLabel)}
                    icon={<Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  />
                  <DetailRow label="Degmada" value={displayText(listing.district)} />
                  <DetailRow label="Xaafadda" value={displayText(listing.neighborhood)} />
                  <DetailRow label="Magaalada" value={displayText(listing.city)} />
                  <DetailRow label="Xaaladda guriga" value={availabilityLabel} />
                  <DetailRow
                    label="Cinwaanka oo buuxa"
                    value={displayText(listing.address_line)}
                    icon={<MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                    wide
                  />
                </dl>

                <div className="mt-5 border-t border-border pt-5">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Sharaxaadda guriga
                  </h3>
                  {description ? (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">{MISSING}</p>
                  )}
                </div>
              </section>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Monthly rent
                </p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
                  {listing.rent_amount != null
                    ? money(listing.rent_amount, listing.currency)
                    : "Rent on request"}
                </p>
                <Link
                  to={`/apply?tenant=${encodeURIComponent(tenantKey)}&property=${encodeURIComponent(listing.id)}`}
                  className="mt-5 block"
                >
                  <Button type="button" className="h-11 w-full text-sm font-bold">
                    Apply to Rent
                  </Button>
                </Link>
              </div>

              {hasInquiry ? (
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <h2 className="font-display text-base font-semibold text-foreground">
                    Inquiry contact
                  </h2>
                  <ul className="mt-3 space-y-2.5">
                    {listing.contact_phone ? (
                      <li>
                        <a
                          href={`tel:${listing.contact_phone}`}
                          className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-brand-blue/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Phone className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden />
                          <span>{listing.contact_phone}</span>
                        </a>
                      </li>
                    ) : null}
                    {listing.contact_email ? (
                      <li>
                        <a
                          href={`mailto:${listing.contact_email}`}
                          className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-brand-blue/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Mail className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden />
                          <span className="break-all">{listing.contact_email}</span>
                        </a>
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
