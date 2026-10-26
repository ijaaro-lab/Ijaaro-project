import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Mail, MapPin, Phone } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import {
  PropertyImageGallery,
  type GalleryImage,
} from "@/components/listings/PropertyImageGallery";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import {
  createPropertyPhotoSignedUrl,
  fetchPropertyPhotoRows,
  formatPropertyTypeLabel,
} from "@/lib/propertyPhotos";
import { resolvePortalTenantKey } from "@/lib/tenant";
import type { LandlordPublicListing } from "@/types/database";

const MISSING_TENANT_MESSAGE =
  "Missing workspace. Open the renter portal with ?tenant=<slug> so listings stay scoped to this landlord.";

const MAX_GALLERY_PHOTOS = 8;

/** Missing numbers → em dash; never invent 0 when the value is null/undefined. */
function displayCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return String(Number(value));
}

function displayText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export function ListingDetailPage() {
  const { id } = useParams();
  const { activeMembership } = useAuth();
  const location = useLocation();
  const tenantKey = resolvePortalTenantKey({
    membershipSlug: activeMembership?.tenant.slug,
    membershipSubdomain: activeMembership?.tenant.subdomain,
    search: location.search,
  });

  const [listing, setListing] = useState<LandlordPublicListing | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setUnavailable(true);
      setListing(null);
      setGalleryImages([]);
      setError(null);
      return;
    }
    if (!tenantKey) {
      setLoading(false);
      setUnavailable(false);
      setListing(null);
      setGalleryImages([]);
      setError(MISSING_TENANT_MESSAGE);
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

      const tenantId = activeMembership?.tenant_id;
      if (!row || !tenantId) return;

      const photoRows = await fetchPropertyPhotoRows(tenantId, row.id);
      if (cancelled || photoRows.length === 0) return;

      const signed = await Promise.all(
        photoRows.slice(0, MAX_GALLERY_PHOTOS).map(async (ph) => {
          const url = await createPropertyPhotoSignedUrl(ph.storage_path);
          if (!url) return null;
          return { id: ph.id, url } satisfies GalleryImage;
        }),
      );
      if (cancelled) return;
      setGalleryImages(signed.filter((img): img is GalleryImage => img != null));
    })();
    return () => {
      cancelled = true;
    };
  }, [id, tenantKey, activeMembership?.tenant_id]);

  const browseLink = (
    <Link
      to="/app/renter/browse"
      className="inline-flex rounded text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      ← Browse listings
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading listing">
        {browseLink}
        <div className="aspect-[16/10] max-h-[min(26rem,52vh)] w-full animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18.5rem]">
          <div className="space-y-3">
            <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-24 w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {browseLink}
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      </div>
    );
  }

  if (unavailable || !listing) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {browseLink}
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="font-display text-lg font-semibold text-brand-navy">Listing unavailable</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This listing is unavailable. It may be unlisted, occupied, or no longer published.
          </p>
        </div>
      </div>
    );
  }

  const title = listing.name || listing.address_line;
  const locationText = [listing.district, listing.city].filter(Boolean).join(", ") || "—";

  const summaryAside = (
    <aside className="space-y-3 lg:sticky lg:top-6">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Monthly rent
        </p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums text-brand-navy sm:text-3xl">
          {money(listing.rent_amount, listing.currency)}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Availability</span>
          <Badge tone={statusTone(listing.status)} className="capitalize">
            {listing.status}
          </Badge>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="font-display text-base font-semibold text-brand-navy">Inquiry contact</h3>
        <ul className="mt-3 space-y-2.5">
          <li>
            {listing.contact_phone ? (
              <a
                className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium text-brand-navy transition-colors hover:border-brand-blue/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`tel:${listing.contact_phone}`}
              >
                <Phone className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden />
                <span>{listing.contact_phone}</span>
              </a>
            ) : (
              <div className="flex items-center gap-2.5 px-1 py-1 text-sm text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                <span>—</span>
              </div>
            )}
          </li>
          <li>
            {listing.contact_email ? (
              <a
                className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium text-brand-navy transition-colors hover:border-brand-blue/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`mailto:${listing.contact_email}`}
              >
                <Mail className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden />
                <span className="break-all">{listing.contact_email}</span>
              </a>
            ) : (
              <div className="flex items-center gap-2.5 px-1 py-1 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" aria-hidden />
                <span>—</span>
              </div>
            )}
          </li>
        </ul>
      </div>
    </aside>
  );

  return (
    <div className="space-y-5">
      {browseLink}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:items-start lg:gap-7">
        <PropertyImageGallery
          images={galleryImages}
          propertyName={title}
          className="min-w-0 lg:col-start-1"
        />

        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {summaryAside}
        </div>

        <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5 lg:col-start-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="max-w-3xl font-display text-2xl font-bold tracking-tight text-brand-navy sm:text-[1.75rem]">
              {title}
            </h2>
            <Badge tone={statusTone(listing.status)} className="capitalize lg:hidden">
              {listing.status}
            </Badge>
          </div>

          <p className="mt-2.5 flex items-start gap-1.5 text-sm text-muted-foreground sm:text-base">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{locationText}</span>
          </p>

          <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2 sm:gap-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Bedrooms
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {displayCount(listing.bedrooms)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kitchens
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {displayCount(listing.kitchens)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Bathrooms
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {displayCount(listing.bathrooms)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Neighborhood
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {displayText(listing.neighborhood)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Property type
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {formatPropertyTypeLabel(listing.property_type)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Full address
              </dt>
              <dd className="mt-1 font-medium text-foreground">{listing.address_line}</dd>
            </div>
          </dl>

          {listing.description && (
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="text-sm font-semibold text-brand-navy">About this property</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {listing.description}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
