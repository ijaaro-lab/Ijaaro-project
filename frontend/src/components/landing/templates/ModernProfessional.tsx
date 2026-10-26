import { ContactSection, ServicesSection } from "./PublicSections";
import {
  HeroOverline,
  PortalCtaRow,
  SiteFooter,
  SiteNav,
} from "./SiteChrome";
import type { TenantLandingProps } from "./types";

export function ModernProfessional(props: TenantLandingProps) {
  const {
    accent,
    secondary,
    heroImage,
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
    belowContent,
  } = props;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        id="home"
        className="relative isolate overflow-hidden text-white"
        style={{ backgroundColor: secondary || "#0b1f3a" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `repeating-linear-gradient(-18deg, transparent, transparent 28px, ${accent} 28px, ${accent} 29px)`,
          }}
          aria-hidden
        />
        {heroImage ? (
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url(${heroImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            aria-hidden
          />
        ) : null}

        <SiteNav
          displayName={displayName}
          accent={accent}
          brandMark={brandMark("sm", true)}
          hasLogo={props.hasLogo}
          preview={preview}
          tone="light"
          onPortalLogin={onPortalLogin}
        />

        <div className="relative mx-auto flex min-h-[70vh] max-w-4xl flex-col items-center justify-center px-4 pb-20 pt-16 text-center sm:px-6">
          <HeroOverline tenantType={tenantType} accent={accent} />
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            {headline || displayName}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
            {tagline ||
              publicDescription ||
              `Welcome to ${displayName}. Sign in to your secure workspace portal.`}
          </p>
          <PortalCtaRow
            className="mt-9 justify-center"
            accent={accent}
            secondaryLabel="Learn more"
            secondaryHref="#about"
            onPortalLogin={onPortalLogin}
          />
        </div>
      </div>

      <section id="about" className="scroll-mt-20 border-b border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight">
              About {displayName}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {publicDescription ||
                tagline ||
                `${displayName} operates on IJAARO with isolated tenant data, role-based access, and a branded customer portal.`}
            </p>
          </div>
          <div
            className="rounded-2xl border border-border p-6"
            style={{ borderTopWidth: 4, borderTopColor: accent }}
          >
            <p className="font-display text-lg font-semibold text-foreground">
              {displayName}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Members only — Portal Login is for this organization’s users.
            </p>
            {!preview && (
              <button
                type="button"
                onClick={() => onPortalLogin?.()}
                className="mt-4 text-sm font-semibold hover:underline"
                style={{ color: accent }}
              >
                Open portal sign-in →
              </button>
            )}
          </div>
        </div>
      </section>

      <section id="services" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-3xl font-bold tracking-tight">
          What we offer
        </h2>
        <ServicesSection className="mt-8" tenantType={tenantType} accent={accent} />
      </section>

      <section id="contact" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-3xl font-bold tracking-tight">Contact</h2>
        <ContactSection
          className="mt-6"
          email={contactEmail}
          phone={contactPhone}
          address={address}
          website={websiteUrl}
        />
        {!contactEmail && !contactPhone && !address && !websiteUrl ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Public contact details can be added in Workspace branding.
          </p>
        ) : null}
      </section>

      {belowContent}

      <SiteFooter displayName={displayName} footerText={footerText} accent={accent} />
    </div>
  );
}
