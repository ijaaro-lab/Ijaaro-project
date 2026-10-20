import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "navy",
  to,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: "navy" | "green" | "water" | "power" | "warning";
  to?: string;
}) {
  const accents = {
    navy: "bg-brand-navy/10 text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water",
    green: "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-brand-green",
    water: "bg-brand-water/10 text-brand-water dark:bg-brand-water/20 dark:text-brand-water",
    power: "bg-brand-power/20 text-[#9a7a00] dark:bg-brand-power/25 dark:text-brand-power",
    warning:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  };

  const body = (
    <div className="flex items-center gap-3">
      {Icon && (
        <div className={cn("shrink-0 rounded-lg p-2", accents[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium leading-tight text-muted-foreground">
          {label}
        </div>
        <div className="truncate font-display text-xl font-bold leading-tight tracking-tight text-foreground">
          {value}
        </div>
        {hint && (
          <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );

  const className = cn(
    "block rounded-xl border border-border/80 bg-card px-3.5 py-3 shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none",
    to &&
      "transition duration-200 hover:-translate-y-0.5 hover:border-brand-water/45 hover:bg-muted/30 hover:shadow-[0_6px_16px_rgba(11,31,58,0.06)] dark:hover:shadow-none",
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
