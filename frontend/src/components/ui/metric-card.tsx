import { Children, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Equal-width KPI strip that never wraps — always one horizontal line. */
export function MetricRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-nowrap items-stretch gap-2.5 sm:gap-3",
        className,
      )}
    >
      {Children.map(children, (child) => (
        <div className="min-w-0 flex-1">{child}</div>
      ))}
    </div>
  );
}

const ACCENT_SURFACE = {
  navy: "bg-brand-navy/10 text-brand-navy ring-brand-navy/15 dark:bg-brand-blue/20 dark:text-brand-water dark:ring-brand-water/20",
  green:
    "bg-brand-green/10 text-brand-green ring-brand-green/15 dark:bg-brand-green/20 dark:text-brand-green dark:ring-brand-green/25",
  water:
    "bg-brand-water/10 text-brand-water ring-brand-water/15 dark:bg-brand-water/20 dark:text-brand-water dark:ring-brand-water/25",
  power:
    "bg-brand-power/20 text-[#9a7a00] ring-brand-power/25 dark:bg-brand-power/25 dark:text-brand-power dark:ring-brand-power/30",
  warning:
    "bg-amber-100 text-amber-700 ring-amber-200/80 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-400/20",
} as const;

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "navy",
  compact = false,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: keyof typeof ACCENT_SURFACE;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <div
        className={cn(
          "group relative flex h-full min-h-[5.75rem] min-w-0 flex-col justify-center overflow-hidden rounded-2xl border border-border/70 bg-card px-3.5 py-4 shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition-all duration-200 sm:min-h-[6.25rem] sm:px-4 sm:py-5",
          "hover:border-brand-water/35 hover:shadow-[0_8px_24px_rgba(11,31,58,0.08)]",
          "dark:border-border dark:shadow-none dark:hover:border-brand-water/40 dark:hover:bg-muted/20 dark:hover:shadow-none",
          className,
        )}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-water/40 to-transparent opacity-70"
          aria-hidden
        />
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <div
              className={cn(
                "shrink-0 rounded-xl p-2.5 ring-1 transition-transform duration-200 group-hover:scale-105 sm:p-3",
                ACCENT_SURFACE[accent],
              )}
            >
              <Icon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" aria-hidden />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium uppercase tracking-[0.04em] text-muted-foreground sm:text-[0.7rem]">
              {label}
            </div>
            <div className="mt-1.5 truncate font-display text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums sm:text-[1.85rem]">
              {value}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] transition-shadow hover:shadow-[0_4px_14px_rgba(11,31,58,0.06)] dark:border-border dark:shadow-none dark:hover:shadow-none",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={cn("shrink-0 rounded-xl p-2.5 ring-1", ACCENT_SURFACE[accent])}>
            <Icon className="h-4 w-4" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 truncate font-display text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums">
            {value}
          </div>
          {hint ? (
            <p className="mt-1.5 truncate text-xs leading-snug text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
