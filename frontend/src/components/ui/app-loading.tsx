import { cn } from "@/lib/utils";

type AppLoadingProps = {
  /** Shown under the spinner. */
  message?: string;
  /** Full viewport overlay (auth / boot). Default true. */
  fullScreen?: boolean;
  className?: string;
};

/**
 * Light boot / page loading with a small circular spinner.
 */
export function AppLoading({
  message = "Loading…",
  fullScreen = true,
  className,
}: AppLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground",
        fullScreen ? "min-h-svh w-full" : "min-h-[40vh] w-full",
        className,
      )}
    >
      <div
        className="h-7 w-7 animate-spin rounded-full border-2 border-brand-water/25 border-t-brand-water"
        aria-hidden
      />
      <p className="text-sm">{message}</p>
      <span className="sr-only">{message}</span>
    </div>
  );
}
