import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "navy",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: "navy" | "green" | "water" | "power" | "warning";
}) {
  const accents = {
    navy: "bg-brand-navy/10 text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water",
    green: "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-brand-green",
    water: "bg-brand-water/10 text-brand-water dark:bg-brand-water/20 dark:text-brand-water",
    power: "bg-brand-power/20 text-[#9a7a00] dark:bg-brand-power/25 dark:text-brand-power",
    warning:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  };

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:shadow-none">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className={cn("shrink-0 rounded-md p-1.5", accents[accent])}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-medium leading-tight text-muted-foreground">
            {label}
          </div>
          <div className="truncate font-display text-lg font-bold leading-tight tracking-tight text-foreground">
            {value}
          </div>
          {hint && (
            <p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
