import { useEffect, useState } from "react";
import { createPropertyPhotoSignedUrl } from "@/lib/propertyPhotos";
import { cn } from "@/lib/utils";
import { PropertyImagePlaceholder } from "./PropertyImagePlaceholder";

type Props = {
  /** Private path — signed client-side for landlord/renter members. */
  storagePath?: string | null;
  /** Ready signed URL from the public listing photos Edge Function. */
  url?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
};

/**
 * Displays a property cover from either a ready signed URL or a private storage path.
 * Shows a polished placeholder when missing, denied, or failed.
 */
export function PropertyCoverImage({
  storagePath,
  url: readyUrl,
  alt,
  className,
  imgClassName,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    if (readyUrl) {
      setUrl(readyUrl);
      setStatus("ready");
      return () => {
        cancelled = true;
      };
    }

    if (!storagePath) {
      setUrl(null);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    void (async () => {
      const signed = await createPropertyPhotoSignedUrl(storagePath);
      if (cancelled) return;
      if (!signed) {
        setUrl(null);
        setStatus("error");
        return;
      }
      setUrl(signed);
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [storagePath, readyUrl]);

  const hasSource = Boolean(readyUrl || storagePath);

  if (!hasSource || status === "error" || (status === "ready" && !url)) {
    return (
      <div className={cn("overflow-hidden bg-muted", className)}>
        <PropertyImagePlaceholder />
      </div>
    );
  }

  if (status === "loading" || status === "idle") {
    return (
      <div
        className={cn("animate-pulse bg-muted", className)}
        role="img"
        aria-label="Loading property photo"
      />
    );
  }

  return (
    <div className={cn("overflow-hidden bg-muted", className)}>
      <img
        src={url!}
        alt={alt}
        className={cn("h-full w-full object-cover", imgClassName)}
        onError={() => {
          setUrl(null);
          setStatus("error");
        }}
      />
    </div>
  );
}
