import { useCallback, useEffect, useId, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PropertyImagePlaceholder } from "./PropertyImagePlaceholder";

export type GalleryImage = {
  id: string;
  url: string;
  alt?: string;
};

type Props = {
  images: GalleryImage[];
  propertyName: string;
  className?: string;
};

const MAX_GALLERY_PHOTOS = 8;

/**
 * UI gallery for existing property images only.
 * Handles 0, 1, or many photos — never fabricates assets.
 */
export function PropertyImageGallery({ images, propertyName, className }: Props) {
  const labelId = useId();
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const limited = images.slice(0, MAX_GALLERY_PHOTOS);
  const usable = limited.filter((img) => img.url && !broken[img.id]);
  const count = usable.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const current = count > 0 ? usable[safeIndex] : null;

  useEffect(() => {
    setIndex(0);
    setBroken({});
    setLightboxOpen(false);
  }, [images]);

  useEffect(() => {
    if (count === 0) return;
    setIndex((i) => Math.min(i, count - 1));
  }, [count]);

  const goPrev = useCallback(() => {
    if (count < 2) return;
    setIndex((i) => (i - 1 + count) % count);
  }, [count]);

  const goNext = useCallback(() => {
    if (count < 2) return;
    setIndex((i) => (i + 1) % count);
  }, [count]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, goPrev, goNext]);

  const markBroken = (id: string) => {
    setBroken((prev) => ({ ...prev, [id]: true }));
  };

  const mainFrameClass =
    "aspect-[16/10] max-h-[min(26rem,52vh)] w-full overflow-hidden bg-muted";

  if (count === 0) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-card shadow-sm",
          className,
        )}
        data-testid="property-gallery-empty"
      >
        <div className={mainFrameClass}>
          <PropertyImagePlaceholder />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("space-y-2.5", className)}
      data-testid="property-gallery"
      aria-labelledby={labelId}
    >
      <p id={labelId} className="sr-only">
        Photo gallery for {propertyName}
      </p>

      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <button
          type="button"
          className={cn(
            "group relative block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            mainFrameClass,
          )}
          onClick={() => setLightboxOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              goPrev();
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              goNext();
            }
          }}
          aria-label={`Open photo ${safeIndex + 1} of ${count} for ${propertyName}`}
        >
          <img
            key={current!.id}
            src={current!.url}
            alt={current!.alt ?? `${propertyName} photo ${safeIndex + 1}`}
            className="h-full w-full object-cover transition-opacity duration-200"
            onError={() => markBroken(current!.id)}
          />
        </button>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-white/95 text-brand-navy shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-3 sm:h-10 sm:w-10"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-white/95 text-brand-navy shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-3 sm:h-10 sm:w-10"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </>
        )}

        <div
          className="absolute bottom-2.5 right-2.5 rounded-md bg-brand-navy/90 px-2.5 py-1 text-xs font-semibold tabular-nums text-white shadow-sm"
          data-testid="property-gallery-counter"
          aria-live="polite"
        >
          {safeIndex + 1} / {count}
        </div>
      </div>

      {count > 1 && (
        <ul
          className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 md:grid-cols-6 sm:overflow-visible"
          data-testid="property-gallery-thumbs"
          aria-label="Photo thumbnails"
        >
          {usable.map((img, i) => {
            const selected = i === safeIndex;
            return (
              <li key={img.id} className="contents sm:block">
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "relative h-[4.25rem] w-[5.75rem] shrink-0 overflow-hidden rounded-lg border bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-auto sm:w-auto sm:aspect-[4/3]",
                    selected
                      ? "border-brand-blue ring-2 ring-brand-blue/30"
                      : "border-border/80 opacity-75 hover:opacity-100",
                  )}
                >
                  <img
                    src={img.url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => markBroken(img.id)}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {lightboxOpen && current && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Enlarged photo ${safeIndex + 1} of ${count}`}
          data-testid="property-gallery-lightbox"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand-navy shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close photo viewer"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          {count > 1 && (
            <>
              <button
                type="button"
                className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-navy shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-4"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-navy shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-4"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </>
          )}
          <img
            src={current.url}
            alt={current.alt ?? `${propertyName} photo ${safeIndex + 1}`}
            className="max-h-[85vh] max-w-[min(960px,92vw)] rounded-lg object-contain shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onError={() => markBroken(current.id)}
          />
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-md bg-white px-3 py-1 text-sm font-semibold tabular-nums text-brand-navy shadow">
            {safeIndex + 1} / {count}
          </div>
        </div>
      )}
    </div>
  );
}
