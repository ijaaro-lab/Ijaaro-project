import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  label?: string;
};

/** Polished empty-state surface when a listing has no usable photo. */
export function PropertyImagePlaceholder({
  className,
  label = "No photo available",
}: Props) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-muted text-muted-foreground",
        className,
      )}
      role="img"
      aria-label={label}
    >
      <Building2 className="h-8 w-8 opacity-35 sm:h-9 sm:w-9" aria-hidden />
      <span className="px-3 text-center text-[11px] font-medium uppercase tracking-wide opacity-65">
        {label}
      </span>
    </div>
  );
}
