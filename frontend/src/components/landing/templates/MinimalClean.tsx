import { LogIn } from "lucide-react";
import { ContactSection, ServicesSection } from "./PublicSections";
import { HeroOverline, SiteFooter, SiteNav } from "./SiteChrome";
import type { TenantLandingProps } from "./types";

export function MinimalClean(props: TenantLandingProps) {
  const {
    accent,
    displayName,
    tagline,
    headline,
    footerText,
    publicDescription,
    contactEmail,
    contactPhone,
    address,
    websiteUrl,
    tenantType,
    brandMark,
    onPortalLogin,
    preview,
  } = props;

  return (
    <div className="min-h-screen bg-background">
      <SiteNav
        displayName={displayName}
        accent={accent}
        brandMark={brandMark("sm", false)}
        hasLogo={props.hasLogo}
        preview={preview}
        tone="dark"
        onPortalLogin={onPortalLogin}
      />

      <section
        id="home"
        className="scroll-mt-20 mx-auto max-w-3xl px-4 pb-16 pt-20 text-center sm:px-6"
      >
        {props.hasLogo && (
          <div className="mx-auto mb-6 flex justify-center">{brandMark("lg", false)}</div>
        )}
        <HeroOverline tenantType={tenantType} accent={accent} />
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          {props.hasLogo ? headline || displayName : displayName}
        </h1>
        {!props.hasLogo && (
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">{headline}</p>
        )}
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {tagline || publicDescription}
        </p>
        <div
          className="mx-auto mt-8 h-1 w-20 rounded-full"
          style={{ background: accent }}
          aria-hidden
        />
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => onPortalLogin?.()}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            Portal Login
            <LogIn className="h-4 w-4" />
          </button>
          <a
            href="#services"
            className="inline-flex h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            View services
          </a>
        </div>
      </section>

      <section id="about" className="scroll-mt-20 border-y border-border bg-card">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
          <h2 className="font-display text-2xl font-bold">About</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {publicDescription ||
              `${displayName} — public site for visitors; portal for this organization’s members only.`}
          </p>
        </div>
      </section>

      <section id="services" className="scroll-mt-20 mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <h2 className="text-center font-display text-2xl font-bold">Services</h2>
        <ServicesSection className="mt-8" tenantType={tenantType} accent={accent} />
      </section>

      <section id="contact" className="scroll-mt-20 mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="text-center font-display text-2xl font-bold">Contact</h2>
        <div className="mx-auto mt-6 max-w-md">
          <ContactSection
            email={contactEmail}
            phone={contactPhone}
            address={address}
            website={websiteUrl}
          />
        </div>
      </section>

      <SiteFooter
        displayName={displayName}
        footerText={footerText}
        accent={accent}
        tone="light"
      />
    </div>
  );
}
