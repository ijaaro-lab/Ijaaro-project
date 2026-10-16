import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Disambiguate embeds when a table has multiple FKs to tenants (e.g. properties). */
export const TENANT_EMBED = "tenants!tenant_id(name, slug, tenant_type)";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-green">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.65rem]">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function AdminTableCard({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none",
        className,
      )}
    >
      {children}
      {footer && (
        <div className="border-t border-border/80 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export function AdminError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
    >
      {message}
    </div>
  );
}

export function AdminKpiRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-3.5">{children}</div>
  );
}

const KPI_ACCENTS = {
  navy: "bg-brand-navy/10 text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water",
  green: "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-emerald-300",
  water: "bg-brand-water/10 text-brand-water dark:bg-brand-water/20 dark:text-sky-300",
  power: "bg-brand-power/20 text-[#9a7a00] dark:bg-brand-power/25 dark:text-brand-power",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
} as const;

export function AdminKpi({
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
  accent?: keyof typeof KPI_ACCENTS;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-border dark:shadow-none">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium leading-snug text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <div className={cn("shrink-0 rounded-lg p-1.5", KPI_ACCENTS[accent])}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </div>
        )}
      </div>
      <p className="mt-2.5 font-display text-2xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {hint && (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function AdminSectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="border-b border-border/80 px-4 py-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function adminTableHeadClass() {
  return "bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
}

export function filterSelectClassName(className?: string) {
  return cn("h-9 w-auto min-w-[9rem]", className);
}

export type TenantRef = { name: string; slug: string; tenant_type: string };

export type WorkspaceTenant = {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  tenant_type: string;
  status: string;
  created_at: string;
};

export function statusBadgeTone(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "info" {
  if (status === "active" || status === "paid" || status === "available")
    return "success";
  if (status === "pending" || status === "processing" || status === "vacant")
    return "warning";
  if (
    status === "suspended" ||
    status === "rejected" ||
    status === "failed" ||
    status === "disabled"
  )
    return "danger";
  if (status === "occupied" || status === "listed") return "info";
  return "neutral";
}
