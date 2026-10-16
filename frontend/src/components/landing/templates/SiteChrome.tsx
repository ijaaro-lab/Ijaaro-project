import type { ReactNode } from "react";
import { LogIn, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { tenantTypeLabel } from "@/lib/tenant";
import type { TenantType } from "@/types/database";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#home", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#services", label: "Services" },
  { href: "#contact", label: "Contact" },
] as const;

type NavProps = {
  displayName: string;
  accent: string;
  brandMark: ReactNode;
  /** When true, show logo only — hide the text name beside it. */
  hasLogo?: boolean;
  preview?: boolean;
  tone?: "light" | "dark";
  className?: string;
  secondaryAction?: ReactNode;
  onPortalLogin?: () => void;
};

export function SiteNav({
  displayName,
  accent,
  brandMark,
  hasLogo = false,
  preview,
  tone = "light",
  className,
  secondaryAction,
  onPortalLogin,
}: NavProps) {
  const light = tone === "light";

  return (
    <header
      className={cn(
        "relative z-20 border-b",
        light ? "border-white/10" : "border-border bg-card/90 backdrop-blur",
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <a href="#home" className="flex min-w-0 items-center gap-3">
          {hasLogo ? (
            brandMark
          ) : (
            <span
              className={cn(
                "truncate font-display text-sm font-bold sm:text-base",
                light ? "text-white" : "text-foreground",
              )}
            >
              {displayName}
            </span>
          )}
        </a>

        <nav
          className={cn(
            "hidden items-center gap-6 text-sm font-medium md:flex",
            light ? "text-white/75" : "text-muted-foreground",
          )}
          aria-label="Primary"
        >
          {NAV.map((item, i) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "transition hover:opacity-100",
                i === 0 && "font-semibold",
              )}
              style={i === 0 ? { color: accent } : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle variant={light ? "on-dark" : "default"} />
          {!preview && (
            <button
              type="button"
              onClick={() => onPortalLogin?.()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[#0b1f3a] shadow-sm transition hover:opacity-95"
              style={{ backgroundColor: accent }}
            >
              Portal Login
              <LogIn className="h-3.5 w-3.5" />
            </button>
          )}
          {secondaryAction}
        </div>
      </div>
    </header>
  );
}

export function HeroOverline({
  tenantType,
  accent,
  className,
}: {
  tenantType: TenantType;
  accent: string;
  className?: string;
}) {
  return (
    <p
      className={cn("text-xs font-semibold tracking-[0.14em]", className)}
      style={{ color: accent }}
    >
      {tenantTypeLabel(tenantType).toUpperCase()}
    </p>
  );
}

export function PortalCtaRow({
  accent,
  secondaryLabel = "Contact us",
  secondaryHref = "#contact",
  className,
  onPortalLogin,
}: {
  accent: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
  onPortalLogin?: () => void;
}) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <button
        type="button"
        onClick={() => onPortalLogin?.()}
        className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-[#0b1f3a] shadow-md transition hover:opacity-95"
        style={{ backgroundColor: accent }}
      >
        Portal Login
        <LogIn className="h-4 w-4" />
      </button>
      <a
        href={secondaryHref}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/35 bg-white/5 px-5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10"
      >
        <Shield className="h-4 w-4" />
        {secondaryLabel}
      </a>
    </div>
  );
}

export function SiteFooter({
  displayName,
  footerText,
  accent,
  tone = "dark",
}: {
  displayName: string;
  footerText: string;
  accent: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <footer
      className={cn(
        "border-t",
        dark
          ? "border-white/10 bg-[#061018] text-white/55"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p
            className={cn(
              "font-display text-sm font-semibold",
              dark ? "text-white" : "text-foreground",
            )}
          >
            {displayName}
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed">{footerText}</p>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="hover:opacity-100"
              style={{ color: accent }}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
      <div
        className={cn(
          "border-t px-4 py-3 text-center text-[11px] sm:px-6",
          dark ? "border-white/10" : "border-border",
        )}
      >
        Powered by IJAARO · secure multi-tenant workspace
      </div>
    </footer>
  );
}
