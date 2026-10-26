import { useEffect, useId, useState, type ReactNode } from "react";
import { LogIn, Menu, Shield, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { tenantTypeLabel } from "@/lib/tenant";
import type { TenantType } from "@/types/database";
import { cn } from "@/lib/utils";

export const SITE_NAV_ITEMS = [
  { href: "#home", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#services", label: "Services" },
  { href: "#contact", label: "Contact" },
  { href: "#available-homes", label: "Properties" },
] as const;

export type SiteNavHref = (typeof SITE_NAV_ITEMS)[number]["href"];

function normalizeHash(hash: string): string {
  if (!hash || hash === "#") return "#home";
  return hash.startsWith("#") ? hash : `#${hash}`;
}

function useActiveSectionHash(): string {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "#home" : normalizeHash(window.location.hash),
  );

  useEffect(() => {
    const sync = () => setHash(normalizeHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return hash;
}

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
  const activeHash = useActiveSectionHash();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const linkClass = (href: string, opts?: { mobile?: boolean }) => {
    const active = activeHash === href;
    return cn(
      "rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
      opts?.mobile
        ? "block px-3 py-2.5 text-base font-medium"
        : "text-sm font-medium",
      light
        ? cn(
            active ? "font-semibold text-white" : "text-white/75 hover:text-white",
            "focus-visible:ring-white/70 focus-visible:ring-offset-[#0b1f3a]",
          )
        : cn(
            active
              ? "font-semibold text-foreground"
              : "text-muted-foreground hover:text-foreground",
            "focus-visible:ring-ring focus-visible:ring-offset-background",
          ),
    );
  };

  const closeMenu = () => setMenuOpen(false);

  const onNavClick = () => {
    closeMenu();
  };

  const portalButton = (opts?: { mobile?: boolean; onClick?: () => void }) =>
    !preview ? (
      <button
        type="button"
        onClick={() => {
          opts?.onClick?.();
          onPortalLogin?.();
        }}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-[#0b1f3a] shadow-sm transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          opts?.mobile ? "h-11 w-full px-4" : "h-9 px-3",
          light
            ? "focus-visible:ring-white/70 focus-visible:ring-offset-[#0b1f3a]"
            : "focus-visible:ring-ring focus-visible:ring-offset-background",
        )}
        style={{ backgroundColor: accent }}
      >
        Portal Login
        <LogIn className="h-3.5 w-3.5" />
      </button>
    ) : null;

  return (
    <header
      className={cn(
        "relative z-20 border-b",
        light ? "border-white/10" : "border-border bg-card/90 backdrop-blur",
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <a
          href="#home"
          className={cn(
            "flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            light
              ? "focus-visible:ring-white/70 focus-visible:ring-offset-[#0b1f3a]"
              : "focus-visible:ring-ring focus-visible:ring-offset-background",
          )}
          onClick={onNavClick}
        >
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
            "hidden items-center gap-5 text-sm font-medium lg:gap-6 md:flex",
            light ? "text-white/75" : "text-muted-foreground",
          )}
          aria-label="Primary"
        >
          {SITE_NAV_ITEMS.map((item) => {
            const active = activeHash === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className={linkClass(item.href)}
                style={active ? { color: accent } : undefined}
                aria-current={active ? "true" : undefined}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle variant={light ? "on-dark" : "default"} />
          <div className="hidden md:block">{portalButton()}</div>
          {secondaryAction}
          <button
            type="button"
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-lg md:hidden",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              light
                ? "text-white hover:bg-white/10 focus-visible:ring-white/70 focus-visible:ring-offset-[#0b1f3a]"
                : "text-foreground hover:bg-muted focus-visible:ring-ring focus-visible:ring-offset-background",
            )}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          id={menuId}
          className={cn(
            "border-t px-4 pb-4 pt-2 md:hidden",
            light ? "border-white/10 bg-[#0b1f3a]/95" : "border-border bg-card",
          )}
        >
          <nav aria-label="Mobile primary" className="flex flex-col gap-0.5">
            {SITE_NAV_ITEMS.map((item) => {
              const active = activeHash === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={linkClass(item.href, { mobile: true })}
                  style={active ? { color: accent } : undefined}
                  aria-current={active ? "true" : undefined}
                  onClick={onNavClick}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
          <div className="mt-3">{portalButton({ mobile: true, onClick: closeMenu })}</div>
        </div>
      ) : null}
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
        className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-[#0b1f3a] shadow-md transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1f3a]"
        style={{ backgroundColor: accent }}
      >
        Portal Login
        <LogIn className="h-4 w-4" />
      </button>
      <a
        href={secondaryHref}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/35 bg-white/5 px-5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1f3a]"
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
  const activeHash = useActiveSectionHash();

  return (
    <footer
      className={cn(
        "border-t",
        dark
          ? "border-white/10 bg-[#061018] text-white/55"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
      data-testid="site-footer"
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
        <nav
          className="flex flex-wrap gap-4 text-xs"
          aria-label="Footer"
        >
          {SITE_NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-sm hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ color: accent }}
              aria-current={activeHash === item.href ? "true" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
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
